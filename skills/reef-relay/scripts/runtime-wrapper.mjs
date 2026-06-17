#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import {
  runLiteCommand,
  compileLiteRun,
  parseLiteCommand,
  compileFullCommand,
  finalizeFullRun,
  dispatchLiveRun,
  loadLiveAdapter,
  runFullCommandPipeline,
  collectRunMetrics,
  generateFeedbackFromRun,
} from '../../../src/reefrelay/index.mjs';

function usage(exitCode = 1) {
  const text = `usage: node skills/reef-relay/scripts/runtime-wrapper.mjs (--command <cmd> | --mode lite|full --goal <goal>) --out-dir <dir> [--scenario <name>] [--dispatcher deterministic|live] [--adapter <module>] [--timeout-ms <ms>] [--max-child-lanes <n>] [--max-concurrent-child-lanes <n>] [--min-available-memory-mb <n>] [--max-load1 <n>] [--max-load-per-cpu <n>] [--max-openclaw-hooks <n>] [--disable-resource-guard] [--resume-from <final-run.json>] [--retry-blocked] [--agent <id>] [--model <id>] [--thinking <level>] [--context-file <path>] [--now <iso>]\n\nExamples:\n  node skills/reef-relay/scripts/runtime-wrapper.mjs --command '/reef_relay lite audit docs' --out-dir runs/wrapper-smoke/lite\n  node skills/reef-relay/scripts/runtime-wrapper.mjs --mode full --goal 'review runtime wrapper and verify tests' --out-dir runs/wrapper-smoke/full\n  node skills/reef-relay/scripts/runtime-wrapper.mjs --mode lite --goal 'read-only live smoke' --dispatcher live --adapter skills/reef-relay/adapters/openclaw-cli-live-adapter.mjs --out-dir runs/live-smoke/lite\n`;
  (exitCode === 0 ? console.log : console.error)(text.trim());
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = { command: null, mode: null, goal: null, outDir: null, scenario: 'default', dispatcher: 'deterministic', adapter: null, timeoutMs: null, maxChildLanes: null, maxConcurrentChildLanes: null, resourceGuard: {}, resumeFrom: null, retryBlocked: false, agent: null, model: null, thinking: null, contextFiles: [], now: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--help' || token === '-h') args.help = true;
    else if (token === '--command') args.command = argv[++i];
    else if (token === '--command-file') args.command = readFileSync(resolve(argv[++i]), 'utf8').trim();
    else if (token === '--mode') args.mode = argv[++i];
    else if (token === '--goal') args.goal = argv[++i];
    else if (token === '--out-dir') args.outDir = argv[++i];
    else if (token === '--scenario') args.scenario = argv[++i];
    else if (token === '--dispatcher') args.dispatcher = argv[++i];
    else if (token === '--adapter') args.adapter = argv[++i];
    else if (token === '--timeout-ms') args.timeoutMs = Number(argv[++i]);
    else if (token === '--max-child-lanes') args.maxChildLanes = Number(argv[++i]);
    else if (token === '--max-concurrent-child-lanes') args.maxConcurrentChildLanes = Number(argv[++i]);
    else if (token === '--min-available-memory-mb') args.resourceGuard.minAvailableMemoryMb = Number(argv[++i]);
    else if (token === '--max-load1') args.resourceGuard.maxLoad1 = Number(argv[++i]);
    else if (token === '--max-load-per-cpu') args.resourceGuard.maxLoadPerCpu = Number(argv[++i]);
    else if (token === '--max-openclaw-hooks') args.resourceGuard.maxOpenClawHooks = Number(argv[++i]);
    else if (token === '--disable-resource-guard') args.resourceGuard.enabled = false;
    else if (token === '--resume-from') args.resumeFrom = argv[++i];
    else if (token === '--retry-blocked') args.retryBlocked = true;
    else if (token === '--agent') args.agent = argv[++i];
    else if (token === '--model') args.model = argv[++i];
    else if (token === '--thinking') args.thinking = argv[++i];
    else if (token === '--context-file') args.contextFiles.push(argv[++i]);
    else if (token === '--now') args.now = argv[++i];
    else throw new Error(`unsupported option ${token}`);
  }
  return args;
}

function inferMode(command) {
  const text = String(command || '').trim();
  if (/^(\/reef_relay|\/skill\s+reef-relay)\s+lite\b/.test(text)) return 'lite';
  if (/^(\/reef_relay|\/skill\s+reef-relay)\s+full\b/.test(text)) return 'full';
  throw new Error('command must start with /reef_relay lite, /reef_relay full, /skill reef-relay lite, or /skill reef-relay full');
}

function commandFromMode(mode, goal) {
  if (!['lite', 'full'].includes(mode)) throw new Error('mode must be lite or full');
  if (!String(goal || '').trim()) throw new Error('goal is required with --mode');
  return `/reef_relay ${mode} ${String(goal).trim()}`;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function emitProgress(options, event) {
  if (typeof options.onProgress !== 'function') return;
  try {
    await Promise.resolve(options.onProgress(event));
  } catch {
    // Progress reporting is best-effort and must never fail the run.
  }
}

function compactList(items, limit) {
  const unique = [];
  const seen = new Set();
  for (const item of items || []) {
    const text = typeof item === 'string' ? item : JSON.stringify(item);
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return {
    shown: unique.slice(0, limit),
    omitted: Math.max(0, unique.length - limit),
    total: unique.length,
  };
}

function userSummary(run) {
  const synthesis = run.finalSynthesis || {};
  return {
    runId: run.runId,
    mode: run.mode,
    status: run.status,
    sendDecision: run.finalDecision?.sendDecision || synthesis.sendDecision || 'unknown',
    summary: synthesis.summary || run.finalDecision?.reason || 'ReefRelay wrapper completed without synthesis text.',
    topFindings: synthesis.whatChangedOrFound || [],
    evidenceReferences: synthesis.evidenceReferences || [],
    toolEvidence: synthesis.toolEvidence || [],
    changedFileEvidence: synthesis.changedFileEvidence || [],
    caveatsOrBlockers: synthesis.caveatsOrBlockers || run.blockers || [],
  };
}

function markdownSummary(summary) {
  const findings = compactList(summary.topFindings, 8);
  const changedFiles = compactList(summary.changedFileEvidence, 12);
  const evidence = compactList(summary.evidenceReferences, 10);
  return [
    `# ReefRelay ${summary.mode} wrapper result`,
    '',
    `**Run:** ${summary.runId}`,
    `**Status:** ${summary.status}`,
    `**Send decision:** ${summary.sendDecision}`,
    '',
    '## Summary',
    summary.summary,
    '',
    ...(findings.total ? ['## Top findings', ...findings.shown.map((item) => `- ${item}`), ...(findings.omitted ? [`- …${findings.omitted} more finding(s) kept in final-run.json/final-synthesis.md.`] : []), ''] : []),
    ...(changedFiles.total ? ['## Changed files', ...changedFiles.shown.map((item) => `- ${item}`), ...(changedFiles.omitted ? [`- …${changedFiles.omitted} more changed file(s) kept in final-run.json/final-synthesis.md.`] : []), ''] : []),
    '## Evidence preview',
    ...(evidence.total ? evidence.shown.map((item) => `- ${item}`) : ['- None recorded.']),
    ...(evidence.omitted ? [`- …${evidence.omitted} more evidence reference(s) kept in final-run.json/final-synthesis.md.`] : []),
    '',
    '## Caveats / blockers',
    ...(summary.caveatsOrBlockers.length ? summary.caveatsOrBlockers.map((item) => `- ${typeof item === 'string' ? item : JSON.stringify(item)}`) : ['- None.']),
    '',
  ].join('\n');
}

export async function runRuntimeWrapper(options) {
  const command = options.command || commandFromMode(options.mode, options.goal);
  const mode = inferMode(command);
  const outDir = resolve(options.outDir || join('runs', 'wrapper-smoke', mode));
  const now = options.now || new Date().toISOString();
  const dispatcher = options.dispatcher || 'deterministic';
  if (!['deterministic', 'live'].includes(dispatcher)) throw new Error('dispatcher must be deterministic or live');
  mkdirSync(outDir, { recursive: true });
  await emitProgress(options, {
    stage: 'setup',
    mode,
    dispatcher,
    message: `ReefRelay ${mode}${dispatcher === 'live' ? ' live' : ''}: setting up artifacts and run state…`,
  });
  const liveArtifactDir = join(outDir, 'artifacts');
  const liveScratchWorkspace = join(liveArtifactDir, 'scratch-workspace');
  if (dispatcher === 'live') mkdirSync(liveScratchWorkspace, { recursive: true });
  const previousRun = options.resumeFrom ? JSON.parse(readFileSync(resolve(options.resumeFrom), 'utf8')) : null;
  const contextText = (options.contextFiles || []).map((file) => {
    const path = resolve(file);
    return `--- ${path} ---\n${readFileSync(path, 'utf8')}`;
  }).join('\n\n');

  let run;
  let artifacts = {};
  if (mode === 'lite' && dispatcher === 'deterministic') {
    run = runLiteCommand(command, {
      scenario: options.scenario || 'default',
      artifactDir: join(outDir, 'artifacts'),
      synthesisOut: join(outDir, 'final-synthesis.md'),
      now,
    });
  } else if (mode === 'lite') {
    await emitProgress(options, { stage: 'dispatch', mode, dispatcher, message: 'ReefRelay lite live: starting the audit lane…' });
    const adapter = await loadLiveAdapter(options.adapter);
    const brief = parseLiteCommand(command);
    const compiledRun = compileLiteRun(brief, { now });
    artifacts = { compiledRun };
    run = await dispatchLiveRun(compiledRun, {
      adapter,
      artifactDir: liveArtifactDir,
      scratchWorkspace: liveScratchWorkspace,
      synthesisOut: join(outDir, 'final-synthesis.md'),
      timeoutMs: options.timeoutMs,
      maxChildLanes: options.maxChildLanes,
      maxConcurrentChildLanes: options.maxConcurrentChildLanes,
      resourceGuard: options.resourceGuard,
      previousRun,
      retryBlockedChildLanes: options.retryBlocked,
      agent: options.agent,
      model: options.model,
      thinking: options.thinking,
      onProgress: options.onProgress,
      contextText,
      now,
    });
    writeJson(join(outDir, 'generated-run.json'), compiledRun);
  } else if (dispatcher === 'deterministic') {
    await emitProgress(options, { stage: 'dispatch', mode, dispatcher, message: 'ReefRelay full: running deterministic planning, review, verification, and synthesis…' });
    const result = runFullCommandPipeline(command, {
      scenario: options.scenario || 'default',
      artifactDir: join(outDir, 'artifacts'),
      synthesisOut: join(outDir, 'final-synthesis.md'),
      now,
    });
    artifacts = {
      command: result.command,
      routing: result.routing,
      brief: result.brief,
      generatedRun: result.generatedRun,
      dispatchedRun: result.dispatchedRun,
    };
    run = result.finalizedRun;
    writeJson(join(outDir, 'brief.json'), result.brief);
    writeJson(join(outDir, 'generated-run.json'), result.generatedRun);
    writeJson(join(outDir, 'dispatched-run.json'), result.dispatchedRun);
  } else {
    await emitProgress(options, { stage: 'planning', mode, dispatcher, message: 'ReefRelay full live: compiling task lanes…' });
    const adapter = await loadLiveAdapter(options.adapter);
    const compiled = compileFullCommand(command, { now, maxChildLanes: options.maxChildLanes });
    const generatedRun = compiled.run;
    const dispatchedRun = await dispatchLiveRun(generatedRun, {
      adapter,
      artifactDir: liveArtifactDir,
      scratchWorkspace: liveScratchWorkspace,
      timeoutMs: options.timeoutMs,
      maxChildLanes: options.maxChildLanes,
      maxConcurrentChildLanes: options.maxConcurrentChildLanes,
      resourceGuard: options.resourceGuard,
      previousRun,
      retryBlockedChildLanes: options.retryBlocked,
      agent: options.agent,
      model: options.model,
      thinking: options.thinking,
      onProgress: options.onProgress,
      contextText,
      now,
    });
    await emitProgress(options, { stage: 'finalizing', mode, dispatcher, message: 'ReefRelay full live: finalizing gates and synthesis…' });
    run = finalizeFullRun(dispatchedRun, {
      synthesisOut: join(outDir, 'final-synthesis.md'),
      now,
    });
    artifacts = {
      command: compiled.command,
      routing: compiled.routing,
      brief: compiled.brief,
      generatedRun,
      dispatchedRun,
    };
    writeJson(join(outDir, 'brief.json'), compiled.brief);
    writeJson(join(outDir, 'generated-run.json'), generatedRun);
    writeJson(join(outDir, 'dispatched-run.json'), dispatchedRun);
  }

  const metrics = collectRunMetrics(run, { now });
  const feedback = generateFeedbackFromRun(run, { now });
  const summary = userSummary(run);
  writeJson(join(outDir, 'final-run.json'), run);
  writeJson(join(outDir, 'metrics.json'), metrics);
  writeJson(join(outDir, 'feedback.json'), feedback);
  writeJson(join(outDir, 'wrapper-result.json'), { command, mode, dispatcher, outDir, now, resumeFrom: options.resumeFrom || null, retryBlocked: Boolean(options.retryBlocked), contextFiles: options.contextFiles || [], scratchWorkspace: dispatcher === 'live' ? liveScratchWorkspace : null, summary, artifacts: Object.keys(artifacts) });
  writeFileSync(join(outDir, 'wrapper-summary.md'), markdownSummary(summary));

  return { command, mode, dispatcher, outDir, now, run, metrics, feedback, summary, artifacts };
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    if (args.help) usage(0);
    if (!args.outDir || (!args.command && (!args.mode || !args.goal))) usage(1);
    const result = await runRuntimeWrapper(args);
    console.log(JSON.stringify({
      mode: result.mode,
      runId: result.summary.runId,
      status: result.summary.status,
      sendDecision: result.summary.sendDecision,
      outDir: result.outDir,
      summaryPath: join(result.outDir, 'wrapper-summary.md'),
      finalRunPath: join(result.outDir, 'final-run.json'),
    }, null, 2));
  } catch (error) {
    console.error(`reef-relay runtime wrapper failed: ${error.message}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

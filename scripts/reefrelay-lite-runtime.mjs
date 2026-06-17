import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { compileLiteRun, parseLiteCommand } from './reefrelay-lite-stub.mjs';

const childStatuses = new Set(['done', 'blocked', 'failed']);
const confidenceLevels = new Set(['low', 'medium', 'high']);
const riskLevels = new Set(['low', 'medium', 'high']);
const recommendedActions = new Set(['accept', 'reject', 'defer']);
const decisionStates = new Set(['accepted', 'rejected', 'deferred']);

function parseArgs(argv) {
  const args = { command: null, in: null, out: null, synthesisOut: null, artifactDir: null, scenario: 'default', now: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--command') args.command = argv[++i];
    else if (argv[i] === '--in') args.in = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--synthesis-out') args.synthesisOut = argv[++i];
    else if (argv[i] === '--artifact-dir') args.artifactDir = argv[++i];
    else if (argv[i] === '--scenario') args.scenario = argv[++i];
    else if (argv[i] === '--now') args.now = argv[++i];
  }
  if ((!args.command && !args.in) || (args.command && args.in) || !args.out) {
    console.error('usage: node scripts/reefrelay-lite-runtime.mjs (--command "/reef_relay lite <goal>" | --in <brief.json>) --out <run.json> [--synthesis-out <summary.md>] [--artifact-dir <dir>] [--scenario default|blocked|malformed] [--now <iso>]');
    process.exit(1);
  }
  return args;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slug(input) {
  return String(input || 'artifact')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72) || 'artifact';
}

function ensureLiteRun(run) {
  if (!run || run.mode !== 'lite') throw new Error('lite runtime requires a lite-mode run artifact');
  if (!Array.isArray(run.tasks) || run.tasks.length === 0) throw new Error('lite runtime requires at least one child task');
  if (run.tasks.length > run.lite?.maxChildLanes) throw new Error('lite runtime exceeded max child lanes');
  for (const task of run.tasks) {
    if (!task.id) throw new Error('lite task missing id');
    if (task.mode !== 'read-only' && task.mode !== 'orchestrator-write') throw new Error(`lite task ${task.id} has invalid mode ${task.mode}`);
    if (task.mode === 'read-only' && task.mutationAllowed) throw new Error(`read-only lite task cannot mutate: ${task.id}`);
    if (task.owner !== 'reefrelay-lite') throw new Error(`lite task must remain orchestrator-owned: ${task.id}`);
  }
}

function deterministicFinding(task, index, now) {
  return {
    id: `${task.id}-finding-${index + 1}`,
    claim: `${task.id} completed read-only lane for ${task.objective || 'lite goal'}`,
    evidence: [`task:${task.id}:objective`, `task:${task.id}:scope`],
    confidence: 'high',
    risk: 'low',
    recommendedAction: 'accept',
    doNotMutate: true,
    observedAt: now,
  };
}

function deterministicChildOutput(task, index, run, options) {
  if (options.scenario === 'blocked' && index === run.tasks.length - 1) {
    return {
      taskId: task.id,
      status: 'blocked',
      summary: 'Lite lane blocked before producing an evidence-backed finding.',
      findings: [],
      blockers: ['Deterministic blocked scenario requires orchestrator follow-up or heavier workflow.'],
      assumptions: ['This is a fixture for blocked lite runtime behavior.'],
    };
  }
  if (options.scenario === 'malformed' && index === 0) {
    return `RAW LITE CHILD TEXT ONLY: ${task.id} did not return structured output.`;
  }
  return {
    taskId: task.id,
    status: 'done',
    summary: `${task.role || 'reviewer'} lane completed bounded lite dispatch for ${run.runId}.`,
    findings: [deterministicFinding(task, index, options.now)],
    blockers: [],
    assumptions: ['Deterministic lite runtime used a mock child runner with real child-result contract shape.'],
  };
}

function normalizeFinding(finding, taskId, index, repairs) {
  if (!finding || typeof finding !== 'object') throw new Error(`finding ${index + 1} for ${taskId} is not an object`);
  const normalized = { ...finding };
  if (!normalized.id) normalized.id = `${taskId}-finding-${index + 1}`;
  if (!normalized.claim) throw new Error(`finding ${normalized.id} missing claim`);
  if (typeof normalized.evidence === 'string') {
    normalized.evidence = [normalized.evidence];
    repairs.push(`finding ${normalized.id}: scalar evidence repaired to evidence[]`);
  }
  if (!Array.isArray(normalized.evidence) || normalized.evidence.length === 0) throw new Error(`finding ${normalized.id} needs evidence`);
  if (!confidenceLevels.has(normalized.confidence)) throw new Error(`finding ${normalized.id} invalid confidence ${normalized.confidence}`);
  if (!riskLevels.has(normalized.risk)) throw new Error(`finding ${normalized.id} invalid risk ${normalized.risk}`);
  if (!recommendedActions.has(normalized.recommendedAction)) throw new Error(`finding ${normalized.id} invalid recommendedAction ${normalized.recommendedAction}`);
  if (normalized.doNotMutate !== true) throw new Error(`finding ${normalized.id} must set doNotMutate true`);
  return normalized;
}

function normalizeChildOutput(raw, task, artifactId, options) {
  const repairs = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      result: {
        taskId: task.id,
        status: 'failed',
        summary: 'Malformed lite child output rejected; raw text retained only as an artifact.',
        findings: [],
        blockers: ['Child output was not a structured lite child-result object.'],
        assumptions: [],
        rawArtifact: artifactId,
        normalizedAt: options.now,
      },
      normalization: 'rejected',
      repairs,
    };
  }

  const normalized = { ...raw };
  if (normalized.taskId !== task.id) throw new Error(`child result taskId mismatch: expected ${task.id}, got ${normalized.taskId}`);
  if (!childStatuses.has(normalized.status)) throw new Error(`invalid child status ${normalized.status} for ${task.id}`);
  if (!normalized.summary) throw new Error(`child result ${task.id} missing summary`);
  if (!Array.isArray(normalized.findings)) throw new Error(`child result ${task.id} findings must be an array`);
  if (!Array.isArray(normalized.blockers)) throw new Error(`child result ${task.id} blockers must be an array`);
  if (!Array.isArray(normalized.assumptions)) throw new Error(`child result ${task.id} assumptions must be an array`);
  normalized.findings = normalized.findings.map((finding, index) => normalizeFinding(finding, task.id, index, repairs));
  if (normalized.status === 'done' && normalized.findings.length === 0) throw new Error(`done child result ${task.id} needs at least one evidence-backed finding`);
  if ((normalized.status === 'blocked' || normalized.status === 'failed') && normalized.blockers.length === 0) throw new Error(`${normalized.status} child result ${task.id} needs blocker details`);
  normalized.rawArtifact = artifactId;
  normalized.normalizedAt = options.now;
  return { result: normalized, normalization: repairs.length > 0 ? 'repaired' : 'accepted', repairs };
}

function writeRawArtifact(raw, task, run, artifactDir, now) {
  const dir = artifactDir || join('runs', 'lite-runtime', 'artifacts', slug(run.runId));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${slug(task.id)}.raw.json`);
  writeFileSync(path, `${JSON.stringify({ taskId: task.id, producedAt: now, raw }, null, 2)}\n`);
  return path;
}

function artifactRecord(task, artifactPath, now) {
  return {
    id: `raw-${task.id}`,
    type: 'lite-child-result-raw',
    path: artifactPath,
    producerTaskId: task.id,
    createdAt: now,
  };
}

function taskStatusFromResult(result) {
  if (!childStatuses.has(result.status)) throw new Error(`cannot map child status ${result.status}`);
  return result.status;
}

function reviewFindings(run, now) {
  const findings = run.childResults.flatMap((result) => result.findings.map((finding) => ({ ...finding, taskId: result.taskId })));
  run.findingDecisions = findings.map((finding) => {
    const evidence = Array.isArray(finding.evidence) ? finding.evidence.filter(Boolean) : [];
    let decision = finding.recommendedAction === 'reject' ? 'rejected' : finding.recommendedAction === 'defer' ? 'deferred' : 'accepted';
    let reason = `Orchestrator followed child recommendation ${finding.recommendedAction}.`;
    if (evidence.length === 0) {
      decision = 'rejected';
      reason = 'Unsupported lite finding cannot be accepted without evidence.';
    }
    if (!decisionStates.has(decision)) throw new Error(`invalid lite finding decision ${decision}`);
    return {
      findingId: finding.id,
      taskId: finding.taskId,
      decision,
      reason,
      decider: 'orchestrator',
      evidenceReviewed: evidence,
      timestamp: now,
    };
  });
}

function enforceLiteGates(run, now) {
  const accepted = run.findingDecisions.filter((decision) => decision.decision === 'accepted');
  const acceptedEvidence = [...new Set(accepted.flatMap((decision) => decision.evidenceReviewed))];
  const blockers = run.childResults.flatMap((result) => result.blockers.map((blocker) => `${result.taskId}: ${blocker}`));
  const hasFailed = run.childResults.some((result) => result.status === 'failed');
  const hasBlocked = run.childResults.some((result) => result.status === 'blocked');

  const safetyPassed = run.tasks.every((task) => task.mode === 'read-only' || task.owner === 'reefrelay-lite');
  const verificationPassed = !hasFailed && !hasBlocked && acceptedEvidence.length > 0;
  const sendDecision = safetyPassed && verificationPassed ? 'send' : 'no-send';

  run.gateRecords = [
    {
      runId: run.runId,
      gate: 'safety',
      result: safetyPassed ? 'passed' : 'blocked',
      decision: safetyPassed ? 'continue' : 'no-send',
      reason: safetyPassed ? 'Lite runtime preserved read-only child lanes and orchestrator-owned mutation boundaries.' : 'Lite runtime safety boundary was violated.',
      evidence: acceptedEvidence,
      requiredFixes: safetyPassed ? [] : ['Restore read-only child lanes or escalate to durable mode.'],
      owner: 'orchestrator',
      timestamp: now,
    },
    {
      runId: run.runId,
      gate: 'verification',
      result: verificationPassed ? 'passed' : 'blocked',
      decision: verificationPassed ? 'continue' : 'no-send',
      reason: verificationPassed ? 'Accepted lite findings have evidence and all child lanes completed.' : 'Lite verification is blocked by child blocker/failure state or missing accepted evidence.',
      evidence: acceptedEvidence,
      requiredFixes: verificationPassed ? [] : (blockers.length > 0 ? blockers : ['Attach evidence-backed accepted findings.']),
      owner: 'orchestrator',
      timestamp: now,
    },
    {
      runId: run.runId,
      gate: 'finalAcceptance',
      result: 'passed',
      decision: sendDecision,
      reason: sendDecision === 'send' ? 'Lite synthesis is evidence-backed and user-ready.' : 'Lite synthesis is no-send because an upstream gate is blocked.',
      evidence: acceptedEvidence,
      requiredFixes: sendDecision === 'send' ? [] : blockers,
      owner: 'orchestrator',
      timestamp: now,
    },
  ];
  run.gates = {
    safety: { result: run.gateRecords[0].result, notes: run.gateRecords[0].reason, evidence: acceptedEvidence },
    verification: { result: run.gateRecords[1].result, notes: run.gateRecords[1].reason, evidence: acceptedEvidence },
    finalAcceptance: { result: run.gateRecords[2].result, notes: run.gateRecords[2].reason, evidence: acceptedEvidence },
  };
  run.finalDecision = {
    sendDecision,
    reason: run.gateRecords[2].reason,
    persistedAt: now,
  };
}

function synthesisMarkdown(synthesis) {
  return [
    `# Lite synthesis — ${synthesis.runId}`,
    '',
    `**Send decision:** ${synthesis.sendDecision}`,
    '',
    '## Summary',
    synthesis.summary,
    '',
    '## Findings',
    ...synthesis.whatChangedOrFound.map((item) => `- ${item}`),
    '',
    '## Evidence',
    ...synthesis.evidenceReferences.map((item) => `- ${item}`),
    '',
    '## Caveats / blockers',
    ...(synthesis.caveatsOrBlockers.length > 0 ? synthesis.caveatsOrBlockers.map((item) => `- ${item}`) : ['- None.']),
    '',
  ].join('\n');
}

function readableHighlight(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function chatHighlight(text, maxLength = 220) {
  const clean = readableHighlight(text);
  if (clean.length <= maxLength) return clean;

  const suffix = ' (full finding in artifacts)';
  const budget = Math.max(40, maxLength - suffix.length);
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [];
  let selected = '';
  for (const sentence of sentences) {
    const next = `${selected}${sentence}`.trim();
    if (next.length > budget) break;
    selected = `${selected}${sentence}`;
  }
  if (selected.trim()) return `${selected.trim()}${suffix}`;

  const words = [];
  for (const word of clean.split(' ')) {
    const next = [...words, word].join(' ');
    if (next.length > budget) break;
    words.push(word);
  }
  return `${words.join(' ')}${suffix}`.trim();
}

function humanCompletionSummary(label, runId, acceptedFindings) {
  const count = acceptedFindings.length;
  const plural = count === 1 ? '' : 's';
  const highlights = acceptedFindings
    .map((finding) => chatHighlight(finding.claim))
    .filter(Boolean)
    .slice(0, 3);
  const omitted = Math.max(0, count - highlights.length);
  const highlightText = highlights.length > 0
    ? `\nHighlights:\n${highlights.map((item) => `- ${item}`).join('\n')}${omitted > 0 ? `\n- plus ${omitted} more in artifacts` : ''}`
    : '';
  return `${label} ReefRelay completed ${runId} with ${count} evidence-backed accepted finding${plural}.${highlightText}`;
}

function createLiteSynthesis(run, options) {
  const acceptedIds = new Set(run.findingDecisions.filter((decision) => decision.decision === 'accepted').map((decision) => decision.findingId));
  const acceptedFindings = run.childResults.flatMap((result) => result.findings).filter((finding) => acceptedIds.has(finding.id));
  const evidenceReferences = [...new Set([
    ...acceptedFindings.flatMap((finding) => finding.evidence || []),
    ...run.gateRecords.flatMap((gate) => gate.evidence || []),
  ])];
  const blockers = [...new Set([
    ...run.blockers.map((item) => `${item.taskId}: ${item.blocker}`),
    ...run.gateRecords.flatMap((gate) => gate.requiredFixes || []),
  ])];

  const synthesis = {
    runId: run.runId,
    createdAt: options.now,
    summary: run.finalDecision.sendDecision === 'send'
      ? humanCompletionSummary('Lite', run.runId, acceptedFindings)
      : `Lite ReefRelay produced a no-send synthesis for ${run.runId} because one or more gates were blocked.`,
    whatChangedOrFound: acceptedFindings.map((finding) => finding.claim),
    evidenceReferences,
    caveatsOrBlockers: blockers,
    sendDecision: run.finalDecision.sendDecision,
    decisionReason: run.finalDecision.reason,
  };

  if (options.synthesisOut) {
    mkdirSync(dirname(options.synthesisOut), { recursive: true });
    writeFileSync(options.synthesisOut, synthesisMarkdown(synthesis));
    const artifact = {
      id: 'lite-final-synthesis',
      type: 'report',
      path: options.synthesisOut,
      producerTaskId: 'orchestrator',
      createdAt: options.now,
    };
    run.artifacts.push(artifact);
    run.finalSynthesis = { ...synthesis, artifactId: artifact.id };
  } else {
    run.finalSynthesis = synthesis;
  }
  run.status = run.finalDecision.sendDecision === 'send' ? 'completed' : 'blocked';
}

export function dispatchLiteRun(inputRun, options = {}) {
  const run = clone(inputRun);
  const now = options.now || new Date().toISOString();
  ensureLiteRun(run);

  run.status = 'running';
  run.updatedAt = now;
  run.childResults = [];
  run.findingDecisions = [];
  run.artifacts = Array.isArray(run.artifacts) ? run.artifacts : [];
  run.decisions = Array.isArray(run.decisions) ? run.decisions : [];
  run.blockers = [];

  const runner = options.childRunner || deterministicChildOutput;
  for (let index = 0; index < run.tasks.length; index++) {
    const task = run.tasks[index];
    task.status = 'running';
    task.startedAt = task.startedAt || now;
    const raw = runner(task, index, run, { ...options, now });
    const rawPath = writeRawArtifact(raw, task, run, options.artifactDir, now);
    const artifact = artifactRecord(task, rawPath, now);
    run.artifacts.push(artifact);
    task.evidence = [...(task.evidence || []), artifact.id];

    const normalized = normalizeChildOutput(raw, task, artifact.id, { ...options, now });
    run.childResults.push(normalized.result);
    task.status = taskStatusFromResult(normalized.result);
    task.endedAt = now;
    task.verification = {
      ...(task.verification || {}),
      result: normalized.result.status === 'done' ? 'passed' : 'failed',
    };
    run.decisions.push({
      id: `lite-normalize-${task.id}`,
      decision: normalized.normalization,
      reason: normalized.normalization === 'accepted'
        ? 'Structured lite child output matched child-result schema.'
        : normalized.normalization === 'repaired'
          ? `Repairable lite child output normalized: ${normalized.repairs.join('; ')}`
          : 'Malformed lite child output rejected and persisted as failed child result.',
      timestamp: now,
      taskId: task.id,
      artifactId: artifact.id,
    });
  }

  run.blockers = run.childResults.flatMap((result) => result.blockers.map((blocker) => ({ taskId: result.taskId, blocker })));
  reviewFindings(run, now);
  enforceLiteGates(run, now);
  createLiteSynthesis(run, { ...options, now });
  run.updatedAt = now;
  return run;
}

export function runLiteCommand(command, options = {}) {
  const brief = parseLiteCommand(command);
  const run = compileLiteRun(brief, options);
  return dispatchLiteRun(run, options);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv);
  const outPath = resolve(args.out);
  const brief = args.command ? parseLiteCommand(args.command) : JSON.parse(readFileSync(resolve(args.in), 'utf8'));
  const compiled = compileLiteRun(brief, { now: args.now });
  const dispatched = dispatchLiteRun(compiled, {
    artifactDir: args.artifactDir,
    synthesisOut: args.synthesisOut ? resolve(args.synthesisOut) : null,
    scenario: args.scenario,
    now: args.now,
  });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(dispatched, null, 2)}\n`);
  console.log(`dispatched lite ReefRelay run -> ${outPath}`);
}

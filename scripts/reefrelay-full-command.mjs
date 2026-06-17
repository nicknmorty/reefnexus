import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { route } from './reefrelay-auto-router.mjs';
import { generateFullBrief } from './reefrelay-full-run-generator.mjs';
import { compile } from './reefrelay-taskflow-stub.mjs';
import { dispatchFullRun } from './reefrelay-full-dispatcher.mjs';
import { finalizeFullRun } from './reefrelay-full-finalizer.mjs';

const patterns = new Set(['sequential', 'concurrent', 'handoff', 'group-chat', 'magentic', 'hierarchical', 'hybrid']);
const riskClasses = new Set(['normal', 'sensitive', 'destructive', 'security', 'config', 'public']);
const immediateRisk = /\b(delete|remove|wipe|rotate|restart|deploy|publish|send|message|call|sms|payment|billing)\b/i;
const immediacy = /\b(now|immediately|asap|right now)\b/i;

function tokenizeCommand(input) {
  const tokens = [];
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let match;
  while ((match = re.exec(input)) !== null) {
    tokens.push((match[1] || match[2] || match[3]).replace(/\\(["'])/g, '$1'));
  }
  return tokens;
}

function slug(input) {
  const clean = String(input || 'full')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const clipped = clean.length > 36 ? clean.slice(0, 36).replace(/-[^-]*$/, '') : clean;
  return clipped.replace(/^-|-$/g, '') || 'full';
}

export function parseFullCommand(input) {
  const tokens = tokenizeCommand(String(input || '').trim());
  if (tokens.length < 2) throw new Error('expected /reef_relay full <goal>');
  const command = tokens.shift();
  let mode = tokens.shift();

  if (!['/reef_relay', '/skill'].includes(command)) throw new Error(`unsupported command ${command}`);
  if (command === '/skill') {
    const skillName = mode;
    if (skillName !== 'reef-relay') throw new Error(`unsupported skill ${skillName || ''}`.trim());
    mode = tokens.shift();
  }
  if (mode !== 'full') throw new Error('only full command parsing is supported');

  const options = {
    ownerSessionKey: 'current',
    pattern: null,
    riskClass: null,
    runPipeline: false,
  };
  const goalParts = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '--owner-session') options.ownerSessionKey = tokens[++i];
    else if (token === '--pattern') options.pattern = tokens[++i];
    else if (token === '--risk') options.riskClass = tokens[++i];
    else if (token === '--run-pipeline') options.runPipeline = true;
    else if (token.startsWith('--')) throw new Error(`unsupported option ${token}`);
    else goalParts.push(token);
  }

  const goal = goalParts.join(' ').trim();
  if (!goal) throw new Error('full command goal required');
  if (options.pattern && !patterns.has(options.pattern)) throw new Error(`invalid pattern ${options.pattern}`);
  if (options.riskClass && !riskClasses.has(options.riskClass)) throw new Error(`invalid risk ${options.riskClass}`);
  if (immediateRisk.test(goal) && immediacy.test(goal)) {
    throw new Error('full command cannot execute risky immediate action without a separate confirmation gate');
  }

  return {
    id: `cmd-full-${slug(goal)}`,
    goal,
    mode: 'full',
    ownerSessionKey: options.ownerSessionKey,
    pattern: options.pattern,
    riskClass: options.riskClass,
    runPipeline: options.runPipeline,
  };
}

export function fullCommandRouting(goal, commandOptions = {}) {
  const auto = route(goal);
  const riskClass = commandOptions.riskClass || auto.riskClass || 'normal';
  return {
    mode: 'full',
    routeOutcome: 'selected',
    confidence: 1,
    riskClass,
    selectedLane: 'full-command-operator-override',
    fallbackUsed: false,
    clarificationAsked: false,
    escalationTriggered: auto.escalationTriggered || false,
    reasons: [
      'explicit full ReefRelay operator override',
      `auto-router would select ${auto.mode}/${auto.selectedLane || 'none'} at confidence ${auto.confidence}`,
      ...(auto.reasons || []).map((reason) => `auto-evidence: ${reason}`),
    ],
    expectedBehavior: 'proceed',
    orchestrationRequired: true,
    durableRequired: true,
    operatorOverride: true,
    overrideSource: '/reef_relay full',
    autoSelection: {
      mode: auto.mode,
      routeOutcome: auto.routeOutcome,
      confidence: auto.confidence,
      riskClass: auto.riskClass,
      selectedLane: auto.selectedLane,
      expectedBehavior: auto.expectedBehavior,
      reasons: auto.reasons || [],
    },
  };
}

export function compileFullCommand(input, options = {}) {
  const command = parseFullCommand(input);
  const now = options.now || new Date().toISOString();
  const routing = fullCommandRouting(command.goal, command);
  const brief = generateFullBrief(command.goal, {
    routing,
    ownerSessionKey: command.ownerSessionKey,
    pattern: command.pattern || options.pattern,
    maxContracts: options.maxContracts || options.maxChildLanes,
    now,
    operatorOverride: true,
    overrideSource: '/reef_relay full',
  });
  brief.id = command.id;
  const run = compile(brief, { now });
  return { command, routing, brief, run };
}

export function runFullCommandPipeline(input, options = {}) {
  const now = options.now || new Date().toISOString();
  const { command, routing, brief } = compileFullCommand(input, { ...options, now });
  const generatedRun = compile(brief, { now });
  const dispatchedRun = dispatchFullRun(generatedRun, {
    scenario: options.scenario || 'default',
    artifactDir: options.artifactDir,
    now,
  });
  const finalizedRun = finalizeFullRun(dispatchedRun, {
    synthesisOut: options.synthesisOut,
    now,
  });
  return { command, routing, brief, generatedRun, dispatchedRun, finalizedRun };
}

function parseArgs(argv) {
  const args = { command: null, out: null, briefOut: null, outDir: null, ownerSessionKey: null, scenario: 'default', now: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--command') args.command = argv[++i];
    else if (argv[i] === '--file') args.command = readFileSync(argv[++i], 'utf8');
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--brief-out') args.briefOut = argv[++i];
    else if (argv[i] === '--out-dir') args.outDir = argv[++i];
    else if (argv[i] === '--owner-session') args.ownerSessionKey = argv[++i];
    else if (argv[i] === '--scenario') args.scenario = argv[++i];
    else if (argv[i] === '--now') args.now = argv[++i];
  }
  if (!args.command || (!args.out && !args.outDir)) {
    console.error('usage: node scripts/reefrelay-full-command.mjs --command "/reef_relay full <goal>" (--out <run.json> [--brief-out <brief.json>] | --out-dir <dir>) [--scenario default|phase2-dogfood] [--now <iso>]');
    process.exit(1);
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv);
  const commandText = args.ownerSessionKey
    ? `${args.command.trim()} --owner-session ${args.ownerSessionKey}`
    : args.command.trim();

  if (args.outDir) {
    const outDir = resolve(args.outDir);
    mkdirSync(outDir, { recursive: true });
    const result = runFullCommandPipeline(commandText, {
      scenario: args.scenario,
      artifactDir: join(outDir, 'artifacts'),
      synthesisOut: join(outDir, 'final-synthesis.md'),
      now: args.now,
    });
    writeFileSync(join(outDir, 'brief.json'), `${JSON.stringify(result.brief, null, 2)}\n`);
    writeFileSync(join(outDir, 'generated-run.json'), `${JSON.stringify(result.generatedRun, null, 2)}\n`);
    writeFileSync(join(outDir, 'dispatched-run.json'), `${JSON.stringify(result.dispatchedRun, null, 2)}\n`);
    writeFileSync(join(outDir, 'final-run.json'), `${JSON.stringify(result.finalizedRun, null, 2)}\n`);
    console.log(`ran full ReefRelay command pipeline -> ${outDir}`);
  } else {
    const result = compileFullCommand(commandText, { now: args.now });
    const outPath = resolve(args.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(result.run, null, 2)}\n`);
    if (args.briefOut) {
      const briefPath = resolve(args.briefOut);
      mkdirSync(dirname(briefPath), { recursive: true });
      writeFileSync(briefPath, `${JSON.stringify(result.brief, null, 2)}\n`);
    }
    console.log(`compiled full ReefRelay command -> ${outPath}`);
  }
}

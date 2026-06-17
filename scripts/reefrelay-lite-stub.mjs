import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const patterns = new Set(['sequential', 'concurrent', 'handoff', 'hierarchical', 'hybrid']);
const risk = new Set(['normal', 'sensitive']);
const mutationPolicies = new Set(['none', 'orchestrator-only']);
const taskModes = new Set(['read-only', 'orchestrator-write']);

function parseArgs(argv) {
  const args = { in: null, out: null, command: null, now: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--in') args.in = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--command') args.command = argv[++i];
    else if (argv[i] === '--now') args.now = argv[++i];
  }
  if ((!args.in && !args.command) || (args.in && args.command) || !args.out) {
    console.error('usage: node scripts/reefrelay-lite-stub.mjs (--in <brief.json> | --command "/reef_relay lite <goal>") --out <run.json>');
    process.exit(1);
  }
  return args;
}

function tokenizeCommand(input) {
  const tokens = [];
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let match;
  while ((match = re.exec(input)) !== null) {
    tokens.push((match[1] || match[2] || match[3]).replace(/\\(["'])/g, '$1'));
  }
  return tokens;
}

function slug(input, maxLength = 40, fallback = 'lite') {
  const clean = String(input || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const clipped = clean.length > maxLength ? clean.slice(0, maxLength).replace(/-[^-]*$/, '') : clean;
  return clipped.replace(/^-|-$/g, '') || fallback;
}

export function parseLiteCommand(input) {
  const tokens = tokenizeCommand(input.trim());
  if (tokens.length < 3) throw new Error('expected /reef_relay lite <goal>');
  const command = tokens.shift();
  let mode = tokens.shift();

  if (!['/reef_relay', '/skill'].includes(command)) throw new Error(`unsupported command ${command}`);
  if (command === '/skill') {
    const skillName = mode;
    if (skillName !== 'reef-relay') throw new Error(`unsupported skill ${skillName || ''}`.trim());
    mode = tokens.shift();
  }
  if (mode !== 'lite') throw new Error('only lite command parsing is supported');

  const options = {
    pattern: 'concurrent',
    riskClass: 'normal',
    mutationPolicy: 'orchestrator-only',
    ownerSessionKey: 'current',
  };
  const goalParts = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '--pattern') options.pattern = tokens[++i];
    else if (token === '--risk') options.riskClass = tokens[++i];
    else if (token === '--mutation-policy') options.mutationPolicy = tokens[++i];
    else if (token === '--owner-session') options.ownerSessionKey = tokens[++i];
    else if (token === '--read-only') options.mutationPolicy = 'none';
    else if (token.startsWith('--')) throw new Error(`unsupported option ${token}`);
    else goalParts.push(token);
  }

  const goal = goalParts.join(' ').trim();
  if (!goal) throw new Error('lite command goal required');

  return {
    id: `cmd-${slug(goal)}`,
    goal,
    mode: 'lite',
    pattern: options.pattern,
    riskClass: options.riskClass,
    ownerSessionKey: options.ownerSessionKey,
    mutationPolicy: options.mutationPolicy,
    routing: {
      routeOutcome: 'selected',
      confidence: 0.75,
      selectedLane: 'lite-command',
    },
    contracts: [{
      taskId: 'lite-audit',
      role: 'reviewer',
      objective: goal,
      scope: ['operator-supplied goal'],
      mode: 'read-only',
      expectedOutputs: ['child result packet'],
      verificationRequired: ['evidence-backed findings'],
      mutationAllowed: false,
    }],
  };
}

function taskFromContract(c, i) {
  const mode = c.mode || 'read-only';
  if (!taskModes.has(mode)) throw new Error(`invalid contract.mode for ${c.taskId || i}: ${mode}`);
  if (c.mutationAllowed === true && mode === 'read-only') {
    throw new Error(`read-only contract cannot allow mutation: ${c.taskId || i}`);
  }
  if (mode === 'orchestrator-write' && c.mutationAllowed !== true) {
    throw new Error(`orchestrator-write contract must explicitly allow mutation: ${c.taskId || i}`);
  }

  return {
    id: c.taskId || `lane-${i + 1}`,
    role: c.role || 'reviewer',
    objective: c.objective || '',
    scope: c.scope || [],
    mode,
    mutationAllowed: Boolean(c.mutationAllowed),
    outputs: c.expectedOutputs || ['child result packet'],
    status: 'pending',
    owner: 'reefrelay-lite',
    evidence: [],
    verification: {
      checks: c.verificationRequired || ['evidence-backed findings'],
      result: 'pending',
    },
    resultSchema: 'reefrelay-lite-child-result@0.1.0',
  };
}

export function compileLiteRun(brief, options = {}) {
  if (!brief.goal) throw new Error('brief.goal required');
  if (brief.mode !== 'lite') throw new Error('brief.mode must be lite');
  if (!patterns.has(brief.pattern)) throw new Error('invalid brief.pattern');
  if (!risk.has(brief.riskClass)) throw new Error('lite mode only accepts normal or sensitive risk');
  if (!Array.isArray(brief.contracts) || brief.contracts.length === 0) throw new Error('brief.contracts required');
  if (brief.contracts.length > 4) throw new Error('lite mode allows at most 4 child lanes');

  const mutationPolicy = brief.mutationPolicy || 'orchestrator-only';
  if (!mutationPolicies.has(mutationPolicy)) throw new Error('invalid mutationPolicy');

  const now = options.now || new Date().toISOString();
  const runId = `lite-${brief.id || now.replace(/[:.]/g, '-')}`;
  const tasks = brief.contracts.map(taskFromContract);

  if (mutationPolicy === 'none' && tasks.some((t) => t.mutationAllowed)) {
    throw new Error('mutationPolicy none cannot include mutationAllowed tasks');
  }
  if (tasks.some((t) => t.mutationAllowed && t.owner !== 'reefrelay-lite')) {
    throw new Error('lite mutations must remain orchestrator-owned');
  }

  return {
    schemaVersion: '0.1.0',
    runId,
    mode: 'lite',
    createdAt: now,
    updatedAt: now,
    goal: brief.goal,
    pattern: brief.pattern,
    riskClass: brief.riskClass,
    status: 'queued',
    routing: {
      routeOutcome: brief.routing?.routeOutcome || 'selected',
      confidence: brief.routing?.confidence ?? 0.8,
      selectedLane: brief.routing?.selectedLane || 'lite',
      fallbackUsed: Boolean(brief.routing?.fallbackUsed),
      clarificationAsked: Boolean(brief.routing?.clarificationAsked),
      escalationTriggered: false,
    },
    lite: {
      durableTaskflow: false,
      ownerSessionKey: brief.ownerSessionKey || 'current',
      mutationPolicy,
      maxChildLanes: 4,
      childResultSchema: 'reefrelay-lite-child-result@0.1.0',
      findingDecisionStates: ['accepted', 'rejected', 'deferred'],
    },
    tasks,
    childResults: [],
    findingDecisions: [],
    gates: {
      safety: { result: 'pending', notes: 'lite mode defaults child lanes to read-only' },
      verification: { result: 'pending', notes: '' },
      finalAcceptance: { result: 'pending', notes: '' },
    },
    artifacts: [],
    decisions: [],
    blockers: [],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv);
  const outPath = resolve(args.out);
  const brief = args.command ? parseLiteCommand(args.command) : JSON.parse(readFileSync(resolve(args.in), 'utf8'));
  const run = compileLiteRun(brief, { now: args.now });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(run, null, 2)}\n`);
  console.log(`compiled lite ${args.command ? 'command' : resolve(args.in)} -> ${outPath}`);
}

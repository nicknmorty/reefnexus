import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { route } from './reefrelay-auto-router.mjs';
import { compile } from './reefrelay-taskflow-stub.mjs';

function slug(input) {
  return String(input || 'full-run')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56) || 'full-run';
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function isReadOnlyRequest(text) {
  return /\bread[- ]only\b/.test(text)
    || /\bno[- ]mutation\b/.test(text)
    || /\bwithout (changing|modifying|editing|writing) files\b/.test(text)
    || /\bdo not (change|modify|edit|write) files\b/.test(text);
}

function selectPattern(request, routing) {
  const text = request.toLowerCase();
  if (routing.riskClass !== 'normal' && hasAny(text, ['security', 'config', 'gateway', 'admin', 'access'])) return 'hierarchical';
  if (hasAny(text, ['parallel', 'fan out', 'independent', 'audit', 'research'])) return 'concurrent';
  if (hasAny(text, ['implement', 'patch', 'fix', 'build', 'test', 'review'])) return 'hierarchical';
  return 'hierarchical';
}

function baseContract(taskId, role, objective, inputs = ['operator request'], extra = {}) {
  return {
    taskId,
    role,
    objective,
    boundaries: extra.boundaries || ['Stay within the request scope', 'Do not perform irreversible/external actions without orchestrator approval'],
    inputs,
    expectedOutputs: extra.expectedOutputs || ['structured child result packet'],
    verificationRequired: extra.verificationRequired || ['evidence for every material claim'],
    timeoutOrDeadline: extra.timeoutOrDeadline || 'bounded interactive session',
    escalationCondition: extra.escalationCondition || 'Missing authority, unsafe ambiguity, blocked dependency, or insufficient evidence',
    artifactTargets: extra.artifactTargets || [],
    riskNotes: extra.riskNotes || [],
  };
}

function mergeContracts(target, source, note) {
  target.objective = `${target.objective}\nAlso cover: ${source.objective}`;
  target.inputs = Array.from(new Set([...(target.inputs || []), ...(source.inputs || [])]));
  target.expectedOutputs = Array.from(new Set([...(target.expectedOutputs || []), ...(source.expectedOutputs || [])]));
  target.verificationRequired = Array.from(new Set([...(target.verificationRequired || []), ...(source.verificationRequired || [])]));
  target.boundaries = Array.from(new Set([...(target.boundaries || []), ...(source.boundaries || [])]));
  target.riskNotes = Array.from(new Set([...(target.riskNotes || []), ...(source.riskNotes || []), note]));
}

function mergeContractById(contracts, sourceId, targetId, note) {
  const sourceIndex = contracts.findIndex((contract) => contract.taskId === sourceId);
  const targetIndex = contracts.findIndex((contract) => contract.taskId === targetId);
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return false;
  mergeContracts(contracts[targetIndex], contracts[sourceIndex], note);
  contracts.splice(sourceIndex, 1);
  return true;
}

function constrainContractsToMax(contracts, maxContracts, options = {}) {
  if (!Number.isInteger(maxContracts) || maxContracts < 1) return contracts;

  if (options.mergeAssessmentWithReview) {
    mergeContractById(contracts, 'implementation-assessment', 'review', 'implementation assessment merged into review for read-only live-full reliability');
  }

  if (contracts.length <= maxContracts) return contracts;

  mergeContractById(contracts, 'verification', 'review', 'verification merged into review to respect live child lane cap');

  if (contracts.length <= maxContracts) return contracts;

  mergeContractById(contracts, 'implementation-assessment', 'review', 'implementation assessment merged into review to respect live child lane cap');

  if (contracts.length > maxContracts) {
    throw new Error(`full brief generated ${contracts.length} contracts after compaction; maxContracts is ${maxContracts}`);
  }
  return contracts;
}

export function generateFullBrief(request, options = {}) {
  const routing = options.routing || route(request);
  if (routing.mode !== 'full') {
    throw new Error(`request routed to ${routing.mode}; full run artifact not generated`);
  }
  if (routing.expectedBehavior !== 'proceed') {
    throw new Error(`request requires ${routing.expectedBehavior}; full run artifact not generated`);
  }

  const text = request.toLowerCase();
  const readOnly = isReadOnlyRequest(text);
  const pattern = options.pattern || selectPattern(request, routing);
  const contracts = [];

  contracts.push(baseContract(
    'intake-plan',
    'researcher',
    `Clarify requirements, constraints, risks, and acceptance criteria for: ${request}`,
    ['operator request', 'routing metadata'],
    { expectedOutputs: ['scope summary', 'risk notes', 'acceptance criteria'] },
  ));

  if (routing.riskClass !== 'normal') {
    contracts.push(baseContract(
      'safety-review',
      'reviewer',
      `Review safety, authority, approval, and risk constraints before execution for: ${request}`,
      ['operator request', 'routing metadata', 'risk policy'],
      {
        expectedOutputs: ['approval requirements', 'unsafe actions to block', 'safe execution boundaries'],
        verificationRequired: ['risk/authority finding has evidence or policy reference'],
        riskNotes: [`riskClass=${routing.riskClass}`],
      },
    ));
  }

  if (hasAny(text, ['implement', 'patch', 'fix', 'build', 'update', 'change', 'refactor', 'runtime', 'code'])) {
    if (readOnly) {
      contracts.push(baseContract(
        'implementation-assessment',
        'reviewer',
        `Assess implementation/runtime evidence without changing files for: ${request}`,
        ['operator request', 'intake-plan output', 'provided context'],
        {
          expectedOutputs: ['evidence-backed implementation assessment', 'safe gaps or risks', 'non-mutating next actions'],
          verificationRequired: ['each assessment tied to provided evidence'],
          riskNotes: ['read-only request: do not produce patches, changed files, or external mutations'],
        },
      ));
      contracts.push(baseContract(
        'review',
        'reviewer',
        `Review findings for correctness, scope, safety, and maintainability without requiring a change set: ${request}`,
        ['implementation-assessment output', 'acceptance criteria'],
        { expectedOutputs: ['review findings', 'required follow-ups', 'approval/blocking recommendation'], verificationRequired: ['each finding tied to concrete evidence'] },
      ));
    } else {
      contracts.push(baseContract(
        'implementation',
        'implementer',
        `Produce the scoped implementation or change set for: ${request}`,
        ['operator request', 'intake-plan output'],
        { expectedOutputs: ['patch/artifact summary', 'changed files', 'implementation notes'], verificationRequired: ['diff or artifact references'] },
      ));
      contracts.push(baseContract(
        'review',
        'reviewer',
        `Review the implementation for correctness, scope, safety, and maintainability: ${request}`,
        ['implementation output', 'acceptance criteria'],
        { expectedOutputs: ['review findings', 'required fixes', 'approval/blocking recommendation'], verificationRequired: ['each finding tied to concrete evidence'] },
      ));
    }
  }

  if (hasAny(text, ['test', 'verify', 'verification', 'validate', 'checks', 'ci', 'build', 'prove', 'proving'])) {
    contracts.push(baseContract(
      'verification',
      'tester',
      `Run or define the required verification checks for: ${request}`,
      ['operator request', 'implementation/review outputs'],
      { expectedOutputs: ['test/check report', 'pass/fail breakdown'], verificationRequired: ['command output or explicit verification evidence'] },
    ));
  }

  if (!contracts.some((c) => c.role === 'implementer') && hasAny(text, ['research', 'investigate', 'diagnose', 'triage', 'audit'])) {
    contracts.push(baseContract(
      'evidence-pass',
      'researcher',
      `Gather evidence, hypotheses, and candidate conclusions for: ${request}`,
      ['operator request'],
      { expectedOutputs: ['evidence-backed findings', 'uncertainties', 'recommended next actions'] },
    ));
  }

  contracts.push(baseContract(
    'synthesis',
    'synthesizer',
    `Prepare final synthesis only after child results, finding decisions, and gates are reviewed for: ${request}`,
    ['normalized child results', 'finding decisions', 'gate states'],
    { expectedOutputs: ['final synthesis draft with evidence and caveats'], verificationRequired: ['safety/verification/final acceptance gates referenced'] },
  ));

  constrainContractsToMax(contracts, options.maxContracts || options.maxChildLanes, {
    mergeAssessmentWithReview: readOnly && Number.isInteger(options.maxContracts || options.maxChildLanes),
  });

  return {
    id: `auto-${slug(request)}`,
    goal: request,
    pattern,
    riskClass: routing.riskClass,
    ownerSessionKey: options.ownerSessionKey || 'current',
    routing: {
      routeOutcome: routing.routeOutcome,
      confidence: routing.confidence,
      selectedLane: routing.selectedLane,
      fallbackUsed: routing.fallbackUsed,
      clarificationAsked: routing.clarificationAsked,
      escalationTriggered: routing.escalationTriggered,
      reasons: routing.reasons,
      operatorOverride: Boolean(routing.operatorOverride || options.operatorOverride),
      overrideSource: routing.overrideSource || options.overrideSource || null,
      autoSelection: routing.autoSelection || null,
    },
    contracts,
    childResults: [],
    findingDecisions: [],
    decisions: [{
      id: 'route-selection',
      decision: routing.operatorOverride || options.operatorOverride ? 'full-operator-override' : 'full',
      reason: routing.reasons.join('; ') || (routing.operatorOverride || options.operatorOverride ? 'operator explicitly selected full mode' : 'auto-router selected full mode'),
      timestamp: options.now || null,
    }],
    blockers: [],
  };
}

function parseArgs(argv) {
  const args = { input: null, out: null, briefOut: null, ownerSessionKey: 'current', now: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--file') args.input = readFileSync(argv[++i], 'utf8');
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--brief-out') args.briefOut = argv[++i];
    else if (argv[i] === '--owner-session') args.ownerSessionKey = argv[++i];
    else if (argv[i] === '--now') args.now = argv[++i];
  }
  if (!args.input || !args.out) {
    console.error('usage: node scripts/reefrelay-full-run-generator.mjs --input "<request>" --out <run.json> [--brief-out <brief.json>] [--owner-session current] [--now <iso>]');
    process.exit(1);
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv);
  const brief = generateFullBrief(args.input.trim(), { ownerSessionKey: args.ownerSessionKey, now: args.now });
  const run = compile(brief, { now: args.now });
  const outPath = resolve(args.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(run, null, 2)}\n`);
  if (args.briefOut) {
    const briefPath = resolve(args.briefOut);
    mkdirSync(dirname(briefPath), { recursive: true });
    writeFileSync(briefPath, `${JSON.stringify(brief, null, 2)}\n`);
  }
  console.log(`generated full ReefRelay run -> ${outPath}`);
}

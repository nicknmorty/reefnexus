import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const patterns = new Set(['sequential', 'concurrent', 'handoff', 'group-chat', 'magentic', 'hierarchical', 'hybrid']);
const risk = new Set(['normal', 'sensitive', 'destructive', 'security', 'config', 'public']);

function parseArgs(argv) {
  const args = { in: null, out: null, now: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--in') args.in = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--now') args.now = argv[++i];
  }
  if (!args.in || !args.out) {
    console.error('usage: node scripts/reefrelay-taskflow-stub.mjs --in <brief.json> --out <run.json>');
    process.exit(1);
  }
  return args;
}

const findingDecisionStates = new Set(['accepted', 'rejected', 'deferred']);
const childStatuses = new Set(['done', 'blocked', 'failed']);
const confidenceLevels = new Set(['low', 'medium', 'high']);
const severityLevels = new Set(['low', 'medium', 'high', 'critical']);
const recommendedActions = new Set(['accept', 'reject', 'defer']);

function taskFromContract(c, i) {
  return {
    id: c.taskId || `task-${i + 1}`,
    role: c.role || 'custom',
    objective: c.objective || '',
    boundaries: c.boundaries || [],
    inputs: c.inputs || [],
    outputs: c.expectedOutputs || [],
    timeoutOrDeadline: c.timeoutOrDeadline || null,
    escalationCondition: c.escalationCondition || null,
    artifactTargets: c.artifactTargets || [],
    status: 'pending',
    owner: 'reefrelay',
    startedAt: null,
    endedAt: null,
    evidence: [],
    assumptions: c.assumptions || [],
    risks: c.riskNotes || [],
    verification: {
      checks: c.verificationRequired || [],
      result: 'pending',
    },
  };
}

function validateChildResult(result, taskIds) {
  for (const key of ['taskId', 'status', 'summary', 'findings', 'blockers', 'assumptions']) {
    if (result[key] === undefined || result[key] === null) throw new Error(`child result missing ${key}`);
  }
  if (!taskIds.has(result.taskId)) throw new Error(`child result references unknown task ${result.taskId}`);
  if (!childStatuses.has(result.status)) throw new Error(`invalid child result status ${result.status}`);
  if (!Array.isArray(result.findings)) throw new Error('child result findings must be an array');
  if (!Array.isArray(result.blockers)) throw new Error('child result blockers must be an array');
  if (!Array.isArray(result.assumptions)) throw new Error('child result assumptions must be an array');
  for (const finding of result.findings) {
    for (const key of ['id', 'claim', 'evidence', 'confidence', 'severity', 'recommendedAction']) {
      if (finding[key] === undefined || finding[key] === null) throw new Error(`finding missing ${key}`);
    }
    if (!Array.isArray(finding.evidence) || finding.evidence.length === 0) throw new Error(`finding ${finding.id} needs evidence`);
    if (!confidenceLevels.has(finding.confidence)) throw new Error(`invalid finding confidence ${finding.confidence}`);
    if (!severityLevels.has(finding.severity)) throw new Error(`invalid finding severity ${finding.severity}`);
    if (!recommendedActions.has(finding.recommendedAction)) throw new Error(`invalid finding recommendedAction ${finding.recommendedAction}`);
  }
}

function validateFindingDecision(decision, findingIds) {
  for (const key of ['findingId', 'decision', 'reason', 'decider', 'evidenceReviewed']) {
    if (decision[key] === undefined || decision[key] === null) throw new Error(`finding decision missing ${key}`);
  }
  if (!findingIds.has(decision.findingId)) throw new Error(`decision references unknown finding ${decision.findingId}`);
  if (!findingDecisionStates.has(decision.decision)) throw new Error(`invalid finding decision ${decision.decision}`);
  if (decision.decider !== 'orchestrator') throw new Error('finding decision decider must be orchestrator');
  if (!Array.isArray(decision.evidenceReviewed) || decision.evidenceReviewed.length === 0) throw new Error(`decision ${decision.findingId} needs reviewed evidence`);
}

export function compile(brief, options = {}) {
  if (!brief.goal) throw new Error('brief.goal required');
  if (!patterns.has(brief.pattern)) throw new Error('invalid brief.pattern');
  if (!risk.has(brief.riskClass)) throw new Error('invalid brief.riskClass');
  if (!Array.isArray(brief.contracts) || brief.contracts.length === 0) throw new Error('brief.contracts required');

  const now = options.now || new Date().toISOString();
  const runId = `run-${brief.id || now.replace(/[:.]/g, '-')}`;
  const tasks = brief.contracts.map(taskFromContract);
  const taskIds = new Set(tasks.map((t) => t.id));
  const childResults = brief.childResults || [];
  if (!Array.isArray(childResults)) throw new Error('brief.childResults must be an array when present');
  childResults.forEach((result) => validateChildResult(result, taskIds));
  const findingIds = new Set(childResults.flatMap((result) => result.findings.map((finding) => finding.id)));
  const findingDecisions = brief.findingDecisions || [];
  if (!Array.isArray(findingDecisions)) throw new Error('brief.findingDecisions must be an array when present');
  findingDecisions.forEach((decision) => validateFindingDecision(decision, findingIds));

  return {
    schemaVersion: '0.1.0',
    runId,
    mode: 'full',
    createdAt: now,
    updatedAt: now,
    goal: brief.goal,
    pattern: brief.pattern,
    riskClass: brief.riskClass,
    status: 'queued',
    routing: {
      routeOutcome: brief.routing?.routeOutcome || 'selected',
      confidence: brief.routing?.confidence ?? 0.8,
      selectedLane: brief.routing?.selectedLane || brief.pattern,
      fallbackUsed: Boolean(brief.routing?.fallbackUsed),
      clarificationAsked: Boolean(brief.routing?.clarificationAsked),
      escalationTriggered: Boolean(brief.routing?.escalationTriggered),
      reasons: brief.routing?.reasons || [],
      operatorOverride: Boolean(brief.routing?.operatorOverride),
      overrideSource: brief.routing?.overrideSource || null,
      autoSelection: brief.routing?.autoSelection || null,
    },
    taskflow: {
      jobId: runId,
      ownerSessionKey: brief.ownerSessionKey || 'current',
      lifecycle: 'created',
      revision: 1,
      childTaskIds: tasks.map((t) => t.id),
    },
    tasks,
    childResults,
    findingDecisions,
    gates: {
      safety: { result: 'pending', notes: '' },
      verification: { result: 'pending', notes: '' },
      finalAcceptance: { result: 'pending', notes: '' },
    },
    artifacts: [],
    decisions: brief.decisions || [],
    blockers: brief.blockers || [],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv);
  const inPath = resolve(args.in);
  const outPath = resolve(args.out);
  const brief = JSON.parse(readFileSync(inPath, 'utf8'));
  const run = compile(brief, { now: args.now });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(run, null, 2)}\n`);
  console.log(`compiled ${inPath} -> ${outPath}`);
}

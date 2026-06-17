import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const metricSchemaVersion = 'reefrelay-run-metrics@0.1.0';
const taskStatuses = ['pending', 'running', 'blocked', 'done', 'failed'];
const childStatuses = ['done', 'blocked', 'failed'];
const findingDecisionStates = ['accepted', 'rejected', 'deferred'];

function parseArgs(argv) {
  const args = { in: null, out: null, metricsOut: null, now: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--in') args.in = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--metrics-out') args.metricsOut = argv[++i];
    else if (argv[i] === '--now') args.now = argv[++i];
  }
  if (!args.in || (!args.out && !args.metricsOut)) {
    console.error('usage: node scripts/reefrelay-metrics.mjs --in <run.json> (--out <annotated-run.json> | --metrics-out <metrics.json>) [--now <iso>]');
    process.exit(1);
  }
  return args;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function countBy(items, keyFn, allowed = []) {
  const counts = Object.fromEntries(allowed.map((key) => [key, 0]));
  for (const item of items || []) {
    const key = keyFn(item) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function msBetween(start, end) {
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.max(0, endMs - startMs);
}

function compactCounts(counts) {
  return Object.fromEntries(Object.entries(counts).filter(([, value]) => value !== 0));
}

function unique(value) {
  return [...new Set((value || []).filter(Boolean))];
}

export function collectRunMetrics(inputRun, options = {}) {
  const run = clone(inputRun);
  const now = options.now || new Date().toISOString();
  const tasks = Array.isArray(run.tasks) ? run.tasks : [];
  const childResults = Array.isArray(run.childResults) ? run.childResults : [];
  const blockers = Array.isArray(run.blockers) ? run.blockers : [];
  const artifacts = Array.isArray(run.artifacts) ? run.artifacts : [];
  const decisions = Array.isArray(run.findingDecisions) ? run.findingDecisions : [];
  const gateRecords = Array.isArray(run.gateRecords) ? run.gateRecords : [];
  const childFindings = childResults.flatMap((result) => Array.isArray(result.findings) ? result.findings : []);

  const retryEvents = [
    ...(Array.isArray(run.retryEvents) ? run.retryEvents : []),
    ...(Array.isArray(run.decisions) ? run.decisions : []).filter((decision) => /\bretry\b/i.test(`${decision.id || ''} ${decision.decision || ''} ${decision.reason || ''}`)),
    ...gateRecords.filter((gate) => gate.decision === 'repair'),
  ];

  const explicitCost = run.costHints || run.cost || run.usage || null;
  const evidenceRefs = unique([
    ...childFindings.flatMap((finding) => Array.isArray(finding.evidence) ? finding.evidence : []),
    ...gateRecords.flatMap((gate) => Array.isArray(gate.evidence) ? gate.evidence : []),
    ...(run.finalSynthesis?.evidenceReferences || []),
  ]);

  return {
    schemaVersion: metricSchemaVersion,
    runId: run.runId,
    collectedAt: now,
    mode: run.mode || 'unknown',
    status: run.status || 'unknown',
    latency: {
      runMs: msBetween(run.createdAt, run.updatedAt),
      taskMs: Object.fromEntries(tasks.map((task) => [task.id || 'unknown-task', msBetween(task.startedAt, task.endedAt)])),
    },
    tasks: {
      total: tasks.length,
      byStatus: countBy(tasks, (task) => task.status, taskStatuses),
      childResults: {
        total: childResults.length,
        byStatus: countBy(childResults, (result) => result.status, childStatuses),
      },
    },
    blockers: {
      total: blockers.length,
      byTask: compactCounts(countBy(blockers, (blocker) => blocker.taskId || 'run')),
    },
    failures: {
      failedTaskCount: tasks.filter((task) => task.status === 'failed').length,
      blockedTaskCount: tasks.filter((task) => task.status === 'blocked').length,
      failedChildCount: childResults.filter((result) => result.status === 'failed').length,
      blockedChildCount: childResults.filter((result) => result.status === 'blocked').length,
      noSend: run.finalDecision?.sendDecision === 'no-send',
    },
    retries: {
      total: retryEvents.length,
      sources: retryEvents.map((event) => event.id || event.gate || event.decision || 'retry'),
    },
    artifacts: {
      total: artifacts.length,
      byType: compactCounts(countBy(artifacts, (artifact) => artifact.type || 'unknown')),
    },
    findings: {
      total: childFindings.length,
      decisions: countBy(decisions, (decision) => decision.decision, findingDecisionStates),
      evidenceReferenceCount: evidenceRefs.length,
    },
    gates: {
      total: gateRecords.length,
      byResult: compactCounts(countBy(gateRecords, (gate) => gate.result || 'unknown')),
      byDecision: compactCounts(countBy(gateRecords, (gate) => gate.decision || 'unknown')),
    },
    costHints: explicitCost || {
      available: false,
      reason: 'No provider usage or cost metadata persisted on this deterministic run artifact.',
    },
  };
}

export function annotateRunMetrics(inputRun, options = {}) {
  const run = clone(inputRun);
  run.metrics = collectRunMetrics(run, options);
  return run;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv);
  const run = JSON.parse(readFileSync(resolve(args.in), 'utf8'));
  const metrics = collectRunMetrics(run, { now: args.now });
  if (args.metricsOut) writeJson(resolve(args.metricsOut), metrics);
  if (args.out) writeJson(resolve(args.out), { ...run, metrics });
  console.log(`collected ReefRelay metrics for ${run.runId || args.in}`);
}

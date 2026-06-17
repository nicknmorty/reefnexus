import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const feedbackSchemaVersion = 'reefrelay-quality-feedback@0.1.0';
const severities = new Set(['low', 'medium', 'high', 'critical']);

function parseArgs(argv) {
  const args = { run: null, coordinationCases: null, out: null, now: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--run') args.run = argv[++i];
    else if (argv[i] === '--coordination-cases') args.coordinationCases = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--now') args.now = argv[++i];
  }
  if ((!args.run && !args.coordinationCases) || (args.run && args.coordinationCases) || !args.out) {
    console.error('usage: node scripts/reefrelay-feedback.mjs (--run <run.json> | --coordination-cases <cases.json>) --out <feedback.json> [--now <iso>]');
    process.exit(1);
  }
  return args;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slug(input) {
  return String(input || 'feedback')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'feedback';
}

function assertSeverity(severity) {
  if (!severities.has(severity)) throw new Error(`invalid feedback severity ${severity}`);
  return severity;
}

function event({ id, createdAt, trigger, severity, sourceRun, affected, evidence, recommendedRepair, regressionCandidate }) {
  return {
    schemaVersion: feedbackSchemaVersion,
    id: `qf-${slug(id)}`,
    createdAt,
    trigger,
    severity: assertSeverity(severity),
    sourceRun,
    affected,
    evidence: evidence || [],
    recommendedRepair,
    regressionCandidate: Boolean(regressionCandidate),
    advisoryOnly: true,
    routingPolicyChange: null,
    gatePolicyChange: null,
  };
}

function sourceRun(run, sourcePath) {
  return {
    runId: run.runId || 'unknown-run',
    path: sourcePath || null,
    mode: run.mode || 'unknown',
    status: run.status || 'unknown',
    sendDecision: run.finalDecision?.sendDecision || null,
  };
}

function taskRole(run, taskId) {
  return (run.tasks || []).find((task) => task.id === taskId)?.role || taskId || 'run';
}

function recipeName(run) {
  return run.routing?.selectedLane || run.pattern || run.mode || 'unknown';
}

export function generateFeedbackFromRun(inputRun, options = {}) {
  const run = clone(inputRun);
  const now = options.now || new Date().toISOString();
  const source = sourceRun(run, options.sourcePath || null);
  const recipe = recipeName(run);
  const events = [];

  for (const result of run.childResults || []) {
    if (result.status === 'failed') {
      events.push(event({
        id: `${run.runId}-${result.taskId}-failed-child`,
        createdAt: now,
        trigger: 'child-failed',
        severity: 'high',
        sourceRun: source,
        affected: { lane: taskRole(run, result.taskId), taskId: result.taskId, recipe },
        evidence: [result.rawArtifact ? `artifact:${result.rawArtifact}` : null, ...(result.blockers || [])].filter(Boolean),
        recommendedRepair: 'Inspect retained raw child output, tighten the child result contract, and rerun or escalate the failed lane before any send decision.',
        regressionCandidate: true,
      }));
    }
    if (result.status === 'blocked') {
      events.push(event({
        id: `${run.runId}-${result.taskId}-blocked-child`,
        createdAt: now,
        trigger: 'child-blocked',
        severity: 'medium',
        sourceRun: source,
        affected: { lane: taskRole(run, result.taskId), taskId: result.taskId, recipe },
        evidence: result.blockers || [],
        recommendedRepair: 'Resolve blocker details or convert the run to an explicit no-send/blocker report; do not send normal final output until verification is unblocked.',
        regressionCandidate: true,
      }));
    }
    for (const finding of result.findings || []) {
      if (!Array.isArray(finding.evidence) || finding.evidence.length === 0) {
        events.push(event({
          id: `${run.runId}-${finding.id || result.taskId}-weak-finding`,
          createdAt: now,
          trigger: 'weak-worker-output',
          severity: 'medium',
          sourceRun: source,
          affected: { lane: taskRole(run, result.taskId), taskId: result.taskId, recipe },
          evidence: [`finding:${finding.id || 'unknown'}`],
          recommendedRepair: 'Reject unsupported finding, request concrete evidence, and add a regression fixture if a done child lane emitted vague output.',
          regressionCandidate: true,
        }));
      }
    }
  }

  if (run.finalDecision?.sendDecision === 'no-send') {
    events.push(event({
      id: `${run.runId}-no-send`,
      createdAt: now,
      trigger: 'no-send',
      severity: run.status === 'failed' ? 'high' : 'medium',
      sourceRun: source,
      affected: { lane: 'orchestrator', taskId: null, recipe },
      evidence: [run.finalDecision.reason, ...(run.finalSynthesis?.caveatsOrBlockers || [])].filter(Boolean),
      recommendedRepair: 'Review no-send reason, repair or escalate blocked lanes, and keep this feedback advisory until an operator chooses a policy change.',
      regressionCandidate: false,
    }));
  }

  if (run.status === 'failed' && !events.some((item) => item.trigger === 'child-failed')) {
    events.push(event({
      id: `${run.runId}-failed-run`,
      createdAt: now,
      trigger: 'run-failed',
      severity: 'high',
      sourceRun: source,
      affected: { lane: 'orchestrator', taskId: null, recipe },
      evidence: (run.blockers || []).map((blocker) => `${blocker.taskId || 'run'}: ${blocker.blocker || blocker}`),
      recommendedRepair: 'Classify the failure cause, add focused regression coverage, and rerun only after the blocker is addressed.',
      regressionCandidate: true,
    }));
  }

  return events;
}

const guardFeedback = {
  'reject-stale-evidence': {
    trigger: 'stale-evidence',
    severity: 'high',
    recommendedRepair: 'Reject decisions that review evidence not attached to the underlying finding; require fresh evidence before acceptance.',
  },
  'reject-unsupported-finding': {
    trigger: 'weak-worker-output',
    severity: 'medium',
    recommendedRepair: 'Reject unsupported child findings and require concrete evidence references before final acceptance.',
  },
  'force-no-send': {
    trigger: 'unsafe-send-attempt',
    severity: 'critical',
    recommendedRepair: 'Force no-send when any child lane is blocked or failed, then repair or escalate before normal final output.',
  },
  'defer-conflict': {
    trigger: 'conflicting-findings',
    severity: 'high',
    recommendedRepair: 'Defer conflicting accepted findings until the orchestrator resolves the target verdict with reviewed evidence.',
  },
  'reject-malformed-artifact': {
    trigger: 'malformed-artifact',
    severity: 'medium',
    recommendedRepair: 'Reject malformed artifact pointers and require id, type, path, producerTaskId, and createdAt before gate evidence can rely on them.',
  },
};

export function generateFeedbackFromCoordinationCases(inputCases, options = {}) {
  const cases = clone(inputCases);
  const now = options.now || new Date().toISOString();
  if (!Array.isArray(cases)) throw new Error('coordination cases must be an array');
  return cases.map((testCase) => {
    const guard = guardFeedback[testCase.expectedGuard];
    if (!guard) throw new Error(`unknown coordination feedback guard ${testCase.expectedGuard}`);
    return event({
      id: `${testCase.id}-${guard.trigger}`,
      createdAt: now,
      trigger: guard.trigger,
      severity: guard.severity,
      sourceRun: sourceRun(testCase.run || {}, options.sourcePath || null),
      affected: { lane: 'orchestrator', taskId: null, recipe: testCase.expectedGuard },
      evidence: [testCase.id, testCase.description].filter(Boolean),
      recommendedRepair: guard.recommendedRepair,
      regressionCandidate: true,
    });
  });
}

export function feedbackArtifact(events, options = {}) {
  return {
    schemaVersion: feedbackSchemaVersion,
    generatedAt: options.now || new Date().toISOString(),
    source: options.source || null,
    advisoryOnly: true,
    events: clone(events),
  };
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv);
  let source;
  let events;
  if (args.run) {
    source = { type: 'run', path: args.run };
    const run = JSON.parse(readFileSync(resolve(args.run), 'utf8'));
    events = generateFeedbackFromRun(run, { now: args.now, sourcePath: args.run });
  } else {
    source = { type: 'coordination-cases', path: args.coordinationCases };
    const cases = JSON.parse(readFileSync(resolve(args.coordinationCases), 'utf8'));
    events = generateFeedbackFromCoordinationCases(cases, { now: args.now, sourcePath: args.coordinationCases });
  }
  writeJson(resolve(args.out), feedbackArtifact(events, { now: args.now, source }));
  console.log(`generated ${events.length} advisory ReefRelay feedback event(s) -> ${args.out}`);
}

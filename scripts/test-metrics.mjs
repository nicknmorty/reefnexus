import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateFullBrief } from './reefrelay-full-run-generator.mjs';
import { compile } from './reefrelay-taskflow-stub.mjs';
import { dispatchFullRun } from './reefrelay-full-dispatcher.mjs';
import { finalizeFullRun } from './reefrelay-full-finalizer.mjs';
import { runLiteCommand } from './reefrelay-lite-runtime.mjs';
import { collectRunMetrics, annotateRunMetrics } from './reefrelay-metrics.mjs';

const fixtureNow = '2026-05-12T23:30:00.000Z';
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function compileFullFixture(goal, ownerSessionKey = 'session:metrics-fixture') {
  const fullModeGoal = `${goal}: coordinate implementation, review, verification evidence, gates, final synthesis, tests, and docs`;
  const brief = generateFullBrief(fullModeGoal, {
    ownerSessionKey,
    now: fixtureNow,
  });
  return compile(brief, { now: fixtureNow });
}

function fullRun(scenario = 'default') {
  const run = compileFullFixture('Implement an evidence-backed ReefRelay observability hardening fixture', `session:metrics-${scenario}`);
  const dispatched = dispatchFullRun(run, {
    scenario,
    now: fixtureNow,
    artifactDir: mkdtempSync(join(tmpdir(), `reef-metrics-${scenario}-`)),
  });
  return finalizeFullRun(dispatched, { now: fixtureNow });
}

function assertCommon(label, metrics) {
  assert(metrics.schemaVersion === 'reefrelay-run-metrics@0.1.0', `${label}: wrong schema version`);
  assert(metrics.runId, `${label}: missing runId`);
  assert(metrics.latency.runMs !== undefined, `${label}: missing run latency`);
  assert(metrics.tasks.total > 0, `${label}: missing task count`);
  assert(metrics.tasks.childResults.total >= 0, `${label}: missing child result count`);
  assert(metrics.artifacts.total >= 0, `${label}: missing artifact count`);
  assert(metrics.findings.decisions.accepted >= 0, `${label}: missing accepted finding count`);
  assert(metrics.findings.decisions.rejected >= 0, `${label}: missing rejected finding count`);
  assert(metrics.findings.decisions.deferred >= 0, `${label}: missing deferred finding count`);
  assert(metrics.costHints, `${label}: missing cost hints`);
}

const successRun = fullRun('default');
const successMetrics = collectRunMetrics(successRun, { now: fixtureNow });
assertCommon('success', successMetrics);
assert(successMetrics.status === 'completed', 'success: expected completed status');
assert(successMetrics.tasks.childResults.byStatus.done === successRun.childResults.length, 'success: expected all child results done');
assert(successMetrics.failures.noSend === false, 'success: expected send metrics');
assert(successMetrics.artifacts.byType.report >= 1, 'success: expected report artifacts');

const blockedRun = fullRun('phase2-dogfood');
const blockedMetrics = collectRunMetrics(blockedRun, { now: fixtureNow });
assertCommon('blocked', blockedMetrics);
assert(blockedMetrics.status === 'blocked', 'blocked: expected blocked final status');
assert(blockedMetrics.failures.blockedChildCount + blockedMetrics.failures.blockedTaskCount >= 1, 'blocked: expected blocked task or child count');
assert(blockedMetrics.failures.failedChildCount + blockedMetrics.failures.failedTaskCount >= 1, 'blocked: expected failed task or child count from malformed child output');
assert(blockedMetrics.failures.noSend === true, 'blocked: expected no-send metrics');
assert(blockedMetrics.blockers.total >= 1, 'blocked: expected blocker count');

const failedRun = dispatchFullRun(compileFullFixture('Create failed observability fixture', 'session:metrics-failed'), {
  now: fixtureNow,
  artifactDir: mkdtempSync(join(tmpdir(), 'reef-metrics-failed-')),
  childRunner: (task) => ({
    taskId: task.id,
    status: 'failed',
    summary: 'Deterministic metrics fixture forced a failed child lane.',
    findings: [],
    blockers: ['Forced failure for metrics fixture coverage.'],
    assumptions: [],
  }),
});
const failedMetrics = collectRunMetrics(failedRun, { now: fixtureNow });
assertCommon('failed', failedMetrics);
assert(failedMetrics.status === 'failed', 'failed: expected failed dispatch status');
assert(failedMetrics.tasks.childResults.byStatus.failed === failedRun.childResults.length, 'failed: expected all child results failed');
assert(failedMetrics.failures.failedTaskCount === failedRun.tasks.length, 'failed: expected failed task count');

const noSendRun = runLiteCommand('/reef_relay lite audit docs for blocked observability behavior', {
  scenario: 'blocked',
  now: fixtureNow,
  artifactDir: mkdtempSync(join(tmpdir(), 'reef-metrics-lite-blocked-')),
});
const noSendMetrics = collectRunMetrics(noSendRun, { now: fixtureNow });
assertCommon('no-send', noSendMetrics);
assert(noSendMetrics.mode === 'lite', 'no-send: expected lite mode');
assert(noSendMetrics.failures.noSend === true, 'no-send: expected no-send true');
assert(noSendMetrics.tasks.childResults.byStatus.blocked >= 1, 'no-send: expected blocked child result');

const annotated = annotateRunMetrics(successRun, { now: fixtureNow });
assert(annotated.metrics?.runId === successRun.runId, 'annotate: missing metrics on run');

const persistedFixtures = [
  ['fixture-success', 'runs/phase-4b-metrics/successful-run.json'],
  ['fixture-blocked', 'runs/phase-4b-metrics/blocked-no-send-run.json'],
  ['fixture-failed', 'runs/phase-4b-metrics/failed-run.json'],
  ['fixture-no-send', 'runs/phase-4b-metrics/lite-no-send-run.json'],
];
for (const [label, path] of persistedFixtures) {
  const fixture = JSON.parse(readFileSync(path, 'utf8'));
  assertCommon(label, fixture.metrics || collectRunMetrics(fixture, { now: fixtureNow }));
  assert(fixture.metrics?.runId === fixture.runId, `${label}: persisted fixture should be annotated`);
}

const cliDir = mkdtempSync(join(tmpdir(), 'reef-metrics-cli-'));
try {
  execFileSync('node', ['scripts/reefrelay-metrics.mjs', '--in', 'runs/phase-3/final-run.json', '--out', join(cliDir, 'annotated.json'), '--metrics-out', join(cliDir, 'metrics.json'), '--now', fixtureNow], { stdio: 'pipe' });
  const cliRun = JSON.parse(readFileSync(join(cliDir, 'annotated.json'), 'utf8'));
  const cliMetrics = JSON.parse(readFileSync(join(cliDir, 'metrics.json'), 'utf8'));
  assert(cliRun.metrics?.schemaVersion === 'reefrelay-run-metrics@0.1.0', 'cli: annotated run missing metrics');
  assert(cliMetrics.runId === cliRun.runId, 'cli: metrics/run mismatch');
} finally {
  rmSync(cliDir, { recursive: true, force: true });
}

if (failed) process.exit(1);
console.log('Metrics collector checks passed');

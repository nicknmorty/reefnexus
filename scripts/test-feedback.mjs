import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { feedbackArtifact, generateFeedbackFromCoordinationCases, generateFeedbackFromRun } from './reefrelay-feedback.mjs';

const fixtureNow = '2026-05-12T23:59:00.000Z';
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function canonical(value) {
  return JSON.stringify(value);
}

function assertEvent(label, event) {
  assert(event.schemaVersion === 'reefrelay-quality-feedback@0.1.0', `${label}: wrong schemaVersion`);
  assert(event.id?.startsWith('qf-'), `${label}: missing event id`);
  assert(event.createdAt, `${label}: missing createdAt`);
  assert(event.trigger, `${label}: missing trigger`);
  assert(['low', 'medium', 'high', 'critical'].includes(event.severity), `${label}: invalid severity`);
  assert(event.sourceRun?.runId, `${label}: missing source run`);
  assert(event.affected?.recipe, `${label}: missing affected recipe`);
  assert(event.recommendedRepair, `${label}: missing repair recommendation`);
  assert(typeof event.regressionCandidate === 'boolean', `${label}: regressionCandidate must be boolean`);
  assert(event.advisoryOnly === true, `${label}: feedback must be advisory-only`);
  assert(event.routingPolicyChange === null, `${label}: must not include routing policy changes`);
  assert(event.gatePolicyChange === null, `${label}: must not include gate policy changes`);
}

function assertArtifact(label, artifact) {
  assert(artifact.schemaVersion === 'reefrelay-quality-feedback@0.1.0', `${label}: wrong artifact schema`);
  assert(artifact.advisoryOnly === true, `${label}: artifact must be advisory-only`);
  assert(Array.isArray(artifact.events), `${label}: events must be array`);
  artifact.events.forEach((event, index) => assertEvent(`${label}[${index}]`, event));
}

const blocked = readJson('runs/phase-4b-metrics/blocked-no-send-run.json');
const blockedBefore = canonical(blocked);
const blockedEvents = generateFeedbackFromRun(blocked, { now: fixtureNow, sourcePath: 'runs/phase-4b-metrics/blocked-no-send-run.json' });
assert(canonical(blocked) === blockedBefore, 'blocked: generator mutated input run');
assert(blockedEvents.some((event) => event.trigger === 'child-blocked'), 'blocked: expected child-blocked feedback');
assert(blockedEvents.some((event) => event.trigger === 'child-failed'), 'blocked: expected child-failed feedback');
assert(blockedEvents.some((event) => event.trigger === 'no-send'), 'blocked: expected no-send feedback');
blockedEvents.forEach((event, index) => assertEvent(`blocked[${index}]`, event));
assert(canonical(blocked.routing) === canonical(readJson('runs/phase-4b-metrics/blocked-no-send-run.json').routing), 'blocked: routing changed');
assert(canonical(blocked.gates) === canonical(readJson('runs/phase-4b-metrics/blocked-no-send-run.json').gates), 'blocked: gates changed');

const failedRun = readJson('runs/phase-4b-metrics/failed-run.json');
const failedEvents = generateFeedbackFromRun(failedRun, { now: fixtureNow });
assert(failedEvents.filter((event) => event.trigger === 'child-failed').length >= 1, 'failed: expected failed-child feedback');
assert(failedEvents.every((event) => event.regressionCandidate), 'failed: failed child events should be regression candidates');

const liteNoSend = readJson('runs/phase-4b-metrics/lite-no-send-run.json');
const liteEvents = generateFeedbackFromRun(liteNoSend, { now: fixtureNow });
assert(liteEvents.some((event) => event.trigger === 'child-blocked'), 'lite no-send: expected blocked feedback');
assert(liteEvents.some((event) => event.trigger === 'no-send'), 'lite no-send: expected no-send feedback');

const successRun = readJson('runs/phase-4b-metrics/successful-run.json');
const successEvents = generateFeedbackFromRun(successRun, { now: fixtureNow });
assert(successEvents.length === 0, 'success: expected no feedback events for clean successful fixture');

const cases = readJson('specs/coordination-failure-cases.json');
const casesBefore = canonical(cases);
const caseEvents = generateFeedbackFromCoordinationCases(cases, { now: fixtureNow, sourcePath: 'specs/coordination-failure-cases.json' });
assert(canonical(cases) === casesBefore, 'coordination cases: generator mutated input cases');
assert(caseEvents.length === cases.length, 'coordination cases: expected one feedback event per case');
for (const trigger of ['stale-evidence', 'weak-worker-output', 'unsafe-send-attempt', 'conflicting-findings', 'malformed-artifact']) {
  assert(caseEvents.some((event) => event.trigger === trigger), `coordination cases: missing trigger ${trigger}`);
}
caseEvents.forEach((event, index) => assertEvent(`coordination[${index}]`, event));

const artifact = feedbackArtifact(blockedEvents, { now: fixtureNow, source: { type: 'run', path: 'runs/phase-4b-metrics/blocked-no-send-run.json' } });
assertArtifact('artifact', artifact);

for (const [label, path] of [
  ['persisted-blocked', 'runs/phase-4c-feedback/blocked-no-send-feedback.json'],
  ['persisted-failed', 'runs/phase-4c-feedback/failed-run-feedback.json'],
  ['persisted-lite-no-send', 'runs/phase-4c-feedback/lite-no-send-feedback.json'],
  ['persisted-coordination', 'runs/phase-4c-feedback/coordination-failure-feedback.json'],
]) {
  const persisted = readJson(path);
  assertArtifact(label, persisted);
  assert(persisted.events.length > 0, `${label}: expected persisted feedback events`);
}

const cliDir = mkdtempSync(join(tmpdir(), 'reef-feedback-cli-'));
try {
  execFileSync('node', ['scripts/reefrelay-feedback.mjs', '--run', 'runs/phase-4b-metrics/blocked-no-send-run.json', '--out', join(cliDir, 'run-feedback.json'), '--now', fixtureNow], { stdio: 'pipe' });
  execFileSync('node', ['scripts/reefrelay-feedback.mjs', '--coordination-cases', 'specs/coordination-failure-cases.json', '--out', join(cliDir, 'case-feedback.json'), '--now', fixtureNow], { stdio: 'pipe' });
  assertArtifact('cli-run', readJson(join(cliDir, 'run-feedback.json')));
  assertArtifact('cli-cases', readJson(join(cliDir, 'case-feedback.json')));
} finally {
  rmSync(cliDir, { recursive: true, force: true });
}

if (failed) process.exit(1);
console.log('Quality feedback checks passed');

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as ReefRelay from 'reefnexus';
import * as ReefRelaySubpath from 'reefnexus/reefrelay';

const fixtureNow = '2026-05-13T01:30:00.000Z';
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertFunction(name) {
  assert(typeof ReefRelay[name] === 'function', `public API missing function ${name}`);
  assert(ReefRelay[name] === ReefRelaySubpath[name], `root and subpath export mismatch for ${name}`);
}

[
  'routeRequest',
  'parseLiteCommand',
  'compileLiteRun',
  'dispatchLiteRun',
  'runLiteCommand',
  'parseFullCommand',
  'fullCommandRouting',
  'compileFullCommand',
  'runFullCommandPipeline',
  'generateFullBrief',
  'compileFullRun',
  'dispatchFullRun',
  'reviewFindings',
  'enforceGates',
  'createFinalSynthesis',
  'finalizeFullRun',
  'runFullPipeline',
  'collectRunMetrics',
  'annotateRunMetrics',
  'generateFeedbackFromRun',
  'generateFeedbackFromCoordinationCases',
  'feedbackArtifact',
].forEach(assertFunction);

const route = ReefRelay.routeRequest('Implement a runtime refactor, review it, and verify tests');
assert(route.mode === 'full', `routeRequest should preserve full routing behavior, got ${route.mode}`);

const liteRun = ReefRelay.runLiteCommand('/reef_relay lite --read-only audit docs for stable API mentions', { now: fixtureNow });
assert(liteRun.mode === 'lite', 'runLiteCommand should return a lite run');
assert(liteRun.status === 'completed', `lite run expected completed, got ${liteRun.status}`);
assert(liteRun.finalDecision?.sendDecision === 'send', 'lite run should preserve send decision contract');
assert(ReefRelay.collectRunMetrics(liteRun, { now: fixtureNow }).mode === 'lite', 'metrics should accept public lite run');

const fullCommand = ReefRelay.compileFullCommand('/reef_relay full implement a public API contract pass, review exported modules, and verify fixture compatibility', { now: fixtureNow });
assert(fullCommand.run.mode === 'full', 'compileFullCommand should return a full run');
assert(fullCommand.run.routing.operatorOverride === true, 'full command should preserve operator override');

const dir = mkdtempSync(join(tmpdir(), 'reef-public-api-'));
try {
  const pipeline = ReefRelay.runFullCommandPipeline('/reef_relay full implement a stable API pass, review the boundaries, and verify contract tests', {
    now: fixtureNow,
    artifactDir: join(dir, 'artifacts'),
    synthesisOut: join(dir, 'final-synthesis.md'),
  });
  assert(pipeline.finalizedRun.status === 'completed', `full public pipeline expected completed, got ${pipeline.finalizedRun.status}`);
  assert(pipeline.finalizedRun.finalDecision?.sendDecision === 'send', 'full public pipeline should send in default fixture path');
  assert(readFileSync(join(dir, 'final-synthesis.md'), 'utf8').includes('Send decision'), 'public pipeline should write synthesis artifact when requested');

  const metrics = ReefRelay.collectRunMetrics(pipeline.finalizedRun, { now: fixtureNow });
  assert(metrics.mode === 'full', 'metrics should accept public full run');
  assert(metrics.findings.evidenceReferenceCount > 0, 'public full run metrics should include evidence references');

  const feedback = ReefRelay.generateFeedbackFromRun(pipeline.finalizedRun, { now: fixtureNow });
  assert(Array.isArray(feedback), 'feedback generation should return an array');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failed) process.exit(1);
console.log('Public API contract checks passed');

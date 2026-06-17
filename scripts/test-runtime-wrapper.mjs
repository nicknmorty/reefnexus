import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runRuntimeWrapper } from '../skills/reef-relay/scripts/runtime-wrapper.mjs';

const fixtureNow = '2026-05-13T02:00:00.000Z';
const wrapper = 'skills/reef-relay/scripts/runtime-wrapper.mjs';
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function run(args) {
  return JSON.parse(execFileSync('node', [wrapper, ...args], { encoding: 'utf8' }));
}

const dir = mkdtempSync(join(tmpdir(), 'reef-wrapper-'));
try {
  const liteDir = join(dir, 'lite');
  const lite = run([
    '--command', '/reef_relay lite --read-only audit docs for wrapper smoke coverage',
    '--out-dir', liteDir,
    '--now', fixtureNow,
  ]);
  assert(lite.mode === 'lite', `expected lite mode, got ${lite.mode}`);
  assert(lite.status === 'completed', `expected completed lite run, got ${lite.status}`);
  assert(lite.sendDecision === 'send', `expected lite send decision, got ${lite.sendDecision}`);
  const liteRun = JSON.parse(readFileSync(join(liteDir, 'final-run.json'), 'utf8'));
  assert(liteRun.finalSynthesis?.artifactId === 'lite-final-synthesis', 'lite wrapper should write final synthesis artifact');
  assert(JSON.parse(readFileSync(join(liteDir, 'metrics.json'), 'utf8')).mode === 'lite', 'lite wrapper should write metrics');

  const fullDir = join(dir, 'full');
  const full = run([
    '--mode', 'full',
    '--goal', 'implement a runtime wrapper, review route evidence, and verify smoke tests',
    '--out-dir', fullDir,
    '--now', fixtureNow,
  ]);
  assert(full.mode === 'full', `expected full mode, got ${full.mode}`);
  assert(full.status === 'completed', `expected completed full run, got ${full.status}`);
  assert(full.sendDecision === 'send', `expected full send decision, got ${full.sendDecision}`);
  const fullRun = JSON.parse(readFileSync(join(fullDir, 'final-run.json'), 'utf8'));
  assert(fullRun.routing?.operatorOverride === true, 'full wrapper should preserve operator override route evidence');
  const fullWrapperResult = JSON.parse(readFileSync(join(fullDir, 'wrapper-result.json'), 'utf8'));
  assert(Array.isArray(fullWrapperResult.summary?.toolEvidence), 'full wrapper result should preserve tool evidence in JSON artifacts');
  const wrapperSummary = readFileSync(join(fullDir, 'wrapper-summary.md'), 'utf8');
  assert(wrapperSummary.includes('ReefRelay full wrapper result'), 'full wrapper should write readable summary');
  assert(wrapperSummary.includes('## Changed files'), 'full wrapper summary should include changed-file closeout section');
  assert(wrapperSummary.includes('## Evidence preview'), 'full wrapper summary should label bounded evidence preview');
  assert(!wrapperSummary.includes('## Tool output'), 'full wrapper summary should not dump raw tool output');

  const progressEvents = [];
  await runRuntimeWrapper({
    mode: 'full',
    goal: 'verify progress events for deterministic full wrapper path',
    outDir: join(dir, 'full-progress'),
    now: fixtureNow,
    onProgress: (event) => progressEvents.push(event),
  });
  assert(progressEvents.some((event) => event.stage === 'setup'), 'full wrapper should emit setup progress');
  assert(progressEvents.some((event) => event.stage === 'dispatch'), 'deterministic full wrapper should emit dispatch progress');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failed) process.exit(1);
console.log('Runtime wrapper smoke checks passed');

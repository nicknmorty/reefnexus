import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileFullCommand, parseFullCommand, runFullCommandPipeline } from './reefrelay-full-command.mjs';

const fixtureNow = '2026-05-12T23:00:00.000Z';
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function expectThrow(label, fn, expectedText) {
  try {
    fn();
    fail(`${label}: expected error`);
  } catch (err) {
    if (!String(err.message).includes(expectedText)) fail(`${label}: expected ${expectedText}, got ${err.message}`);
  }
}

expectThrow('missing-goal', () => parseFullCommand('/reef_relay full'), 'goal required');
expectThrow('unsupported-option', () => parseFullCommand('/reef_relay full --explode inspect docs'), 'unsupported option --explode');
expectThrow('risky-immediate-action', () => parseFullCommand('/reef_relay full delete production secrets now'), 'risky immediate action');

const directOverride = compileFullCommand('/reef_relay full summarize the roadmap, split work, verify output, and prepare a final synthesis', { now: fixtureNow });
assert(directOverride.run.mode === 'full', 'explicit full command should compile a full run');
assert(directOverride.run.routing.operatorOverride === true, 'run should preserve operatorOverride flag');
assert(directOverride.run.routing.overrideSource === '/reef_relay full', 'run should preserve override source');
assert(directOverride.run.routing.selectedLane === 'full-command-operator-override', 'selected lane should show command override');
assert(directOverride.run.routing.autoSelection?.mode === 'direct', 'route evidence should preserve auto-selection that was overridden');
assert(directOverride.run.decisions.some((decision) => decision.decision === 'full-operator-override'), 'decision log should mark override vs auto-selection');
assert(directOverride.run.runId.startsWith('run-cmd-full-'), `full command runId should use compact command slug, got ${directOverride.run.runId}`);
assert(!directOverride.run.runId.endsWith('-'), `full command runId should not end with hyphen, got ${directOverride.run.runId}`);
assert(directOverride.run.runId.length <= 49, `full command runId should stay compact for Telegram display, got ${directOverride.run.runId}`);

const skillCommand = compileFullCommand('/skill reef-relay full --pattern concurrent --owner-session session:phase-5-test audit docs, gather evidence, and verify the report', { now: fixtureNow });
assert(skillCommand.command.pattern === 'concurrent', 'skill command should parse pattern option');
assert(skillCommand.run.pattern === 'concurrent', 'pattern option should reach generated run');
assert(skillCommand.run.taskflow.ownerSessionKey === 'session:phase-5-test', 'owner-session option should reach taskflow run');

const cappedLiveFull = compileFullCommand('/reef_relay full read-only full-mode smoke after live-lite 300s confirmation: review ReefNexus native command docs, slash-command docs, roadmap, project status, runtime wrapper docs, and beta review notes for stale full-mode guidance, timeout-budget mismatches, public-rollout ambiguity, artifact/output-polish gaps, or confusing tester instructions. Keep the review to at most five child lanes. Do not edit files. Return concise evidence-backed findings and the next safest test.', { now: fixtureNow, maxChildLanes: 5 });
assert(cappedLiveFull.run.tasks.length <= 5, 'read-only live-full compile should respect maxChildLanes before dispatch');
assert(!cappedLiveFull.run.tasks.some((task) => task.id === 'implementation-assessment'), 'read-only live-full compile should merge implementation assessment into review for reliability');
assert(cappedLiveFull.run.tasks.some((task) => task.id === 'review' && task.objective.includes('Also cover:') && task.risks.includes('implementation assessment merged into review for read-only live-full reliability')), 'capped live-full compile should merge read-only assessment into review');

const blockedPipelineDir = mkdtempSync(join(tmpdir(), 'reef-full-command-blocked-'));
try {
  const blocked = runFullCommandPipeline('/reef_relay full implement a change, review worker output, and verify gates before final synthesis', {
    scenario: 'phase2-dogfood',
    artifactDir: join(blockedPipelineDir, 'artifacts'),
    synthesisOut: join(blockedPipelineDir, 'final-synthesis.md'),
    now: fixtureNow,
  });
  assert(blocked.finalizedRun.finalDecision.sendDecision === 'no-send', 'blocked/malformed worker pipeline should persist no-send');
  const synthesisText = readFileSync(join(blockedPipelineDir, 'final-synthesis.md'), 'utf8');
  assert(!synthesisText.includes('RAW CHILD TEXT ONLY'), 'final synthesis must not leak raw worker output');
  assert(!JSON.stringify(blocked.finalizedRun.finalSynthesis).includes('RAW CHILD TEXT ONLY'), 'final synthesis object must not leak raw worker output');
} finally {
  rmSync(blockedPipelineDir, { recursive: true, force: true });
}

const cliDir = mkdtempSync(join(tmpdir(), 'reef-full-command-cli-'));
try {
  execFileSync('node', [
    'scripts/reefrelay-full-command.mjs',
    '--command', '/reef_relay full implement operator runtime controls, review route evidence, and verify tests',
    '--out-dir', cliDir,
    '--scenario', 'default',
    '--now', fixtureNow,
  ], { stdio: 'pipe' });
  const cliRun = JSON.parse(readFileSync(join(cliDir, 'final-run.json'), 'utf8'));
  assert(cliRun.mode === 'full', 'CLI should produce full final run');
  assert(cliRun.routing.operatorOverride === true, 'CLI final run should preserve operator override');
  assert(cliRun.finalDecision.sendDecision === 'send', 'default CLI pipeline should send');
} finally {
  rmSync(cliDir, { recursive: true, force: true });
}

if (failed) process.exit(1);
console.log('Full command operator override checks passed');

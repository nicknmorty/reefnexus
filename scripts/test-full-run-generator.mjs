import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { route } from './reefrelay-auto-router.mjs';
import { generateFullBrief } from './reefrelay-full-run-generator.mjs';
import { compile } from './reefrelay-taskflow-stub.mjs';

const fixtureNow = '2026-05-12T00:00:00.000Z';
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function assertFullRun(label, request, expectedRiskClass) {
  const routing = route(request);
  const brief = generateFullBrief(request, { routing, ownerSessionKey: 'session:phase-1-test', now: fixtureNow });
  const run = compile(brief, { now: fixtureNow });

  if (run.mode !== 'full') fail(`${label}: expected full mode`);
  if (run.goal !== request) fail(`${label}: goal mismatch`);
  if (run.riskClass !== expectedRiskClass) fail(`${label}: expected risk ${expectedRiskClass}, got ${run.riskClass}`);
  if (run.taskflow.ownerSessionKey !== 'session:phase-1-test') fail(`${label}: owner session mismatch`);
  if (!run.pattern) fail(`${label}: missing pattern`);
  if (!Array.isArray(run.tasks) || run.tasks.length < 2) fail(`${label}: expected at least two child contracts`);
  if (!Array.isArray(run.childResults) || run.childResults.length !== 0) fail(`${label}: childResults should initialize empty`);
  if (!Array.isArray(run.findingDecisions) || run.findingDecisions.length !== 0) fail(`${label}: findingDecisions should initialize empty`);
  if (!run.gates?.safety || !run.gates?.verification || !run.gates?.finalAcceptance) fail(`${label}: missing gates`);
  if (run.routing.routeOutcome !== routing.routeOutcome) fail(`${label}: routeOutcome not preserved`);
  if (run.routing.confidence !== routing.confidence) fail(`${label}: confidence not preserved`);
  if (run.routing.selectedLane !== routing.selectedLane) fail(`${label}: selectedLane not preserved`);
  if (run.routing.fallbackUsed !== routing.fallbackUsed) fail(`${label}: fallbackUsed not preserved`);
  if (run.routing.clarificationAsked !== routing.clarificationAsked) fail(`${label}: clarificationAsked not preserved`);
  if (run.routing.escalationTriggered !== routing.escalationTriggered) fail(`${label}: escalationTriggered not preserved`);
  if (!Array.isArray(run.routing.reasons) || run.routing.reasons.length === 0) fail(`${label}: route reasons missing`);
  if (!run.taskflow.childTaskIds.every((id) => run.tasks.some((task) => task.id === id))) fail(`${label}: childTaskIds not linked to tasks`);
  if (!run.tasks.every((task) => task.verification?.checks?.length > 0)) fail(`${label}: every task needs verification checks`);
  if (!run.tasks.every((task) => Array.isArray(task.boundaries) && task.boundaries.length > 0)) fail(`${label}: every task needs boundaries`);
  if (!run.tasks.every((task) => task.escalationCondition)) fail(`${label}: every task needs an escalation condition`);
}

function assertNoFullRun(label, request, expectedMode, expectedBehavior = null) {
  const routing = route(request);
  if (routing.mode !== expectedMode) fail(`${label}: expected router mode ${expectedMode}, got ${routing.mode}`);
  if (expectedBehavior && routing.expectedBehavior !== expectedBehavior) fail(`${label}: expected behavior ${expectedBehavior}, got ${routing.expectedBehavior}`);
  try {
    generateFullBrief(request, { routing, now: fixtureNow });
    fail(`${label}: expected generator to reject non-full/non-proceed route`);
  } catch (err) {
    if (!String(err.message).includes('full run artifact not generated')) fail(`${label}: unexpected generator error ${err.message}`);
  }
}

assertNoFullRun('direct-request', 'Summarize this short markdown file', 'direct');
assertNoFullRun('lite-request', 'Run a read-only audit of the docs for stale references', 'lite');
assertNoFullRun('risky-immediate-request', 'Delete the old deployment secrets now', 'direct', 'clarify_or_escalate');
assertFullRun('normal-full-request', 'Implement the runtime dispatcher, add tests, review the changes, update docs, and push the branch', 'normal');
assertFullRun('config-full-request', 'Debug the gateway config issue, inspect logs, propose a safe fix, run verification, and prepare a final report', 'config');
{
  const request = 'Create a tiny proof artifact in scratch, implement it, review it, and verification must run one command proving the file exists and include stdout.';
  const routing = route(request);
  const brief = generateFullBrief(request, { routing, ownerSessionKey: 'session:phase-1-test', now: fixtureNow });
  const ids = brief.contracts.map((contract) => contract.taskId);
  if (!ids.includes('verification')) fail('verification-word-request: expected verification lane when request says verification/proving');
}
{
  const request = 'read-only trusted beta test: spawn real ReefRelay child lanes to review prod-runtime smoke evidence, identify remaining rollout risks, and recommend the next safe gate without changing files';
  const routing = route(request);
  const brief = generateFullBrief(request, { routing, ownerSessionKey: 'session:phase-1-test', now: fixtureNow });
  const ids = brief.contracts.map((contract) => contract.taskId);
  if (ids.includes('implementation')) fail('read-only-full-request: should not generate mutating implementation lane');
  if (!ids.includes('implementation-assessment')) fail('read-only-full-request: expected non-mutating implementation-assessment lane');
  const assessment = brief.contracts.find((contract) => contract.taskId === 'implementation-assessment');
  if (!assessment.riskNotes.some((note) => note.includes('read-only request'))) fail('read-only-full-request: missing read-only risk note');
}
assertFullRun('security-full-request', 'Update gateway security policy and remove old admins', 'security');

const dir = mkdtempSync(join(tmpdir(), 'reef-full-generator-'));
try {
  const outPath = join(dir, 'run.json');
  const briefPath = join(dir, 'brief.json');
  execFileSync('node', [
    'scripts/reefrelay-full-run-generator.mjs',
    '--input', 'Use full ReefRelay to investigate failing tests, patch the code, have a reviewer inspect it, and verify before final answer',
    '--out', outPath,
    '--brief-out', briefPath,
    '--owner-session', 'session:phase-1-cli',
    '--now', fixtureNow,
  ], { stdio: 'pipe' });
  const run = JSON.parse(readFileSync(outPath, 'utf8'));
  const brief = JSON.parse(readFileSync(briefPath, 'utf8'));
  if (run.mode !== 'full') fail('cli-demo: expected full run');
  if (run.taskflow.ownerSessionKey !== 'session:phase-1-cli') fail('cli-demo: owner session mismatch');
  if (!Array.isArray(brief.contracts) || brief.contracts.length < 2) fail('cli-demo: brief contracts missing');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failed) process.exit(1);
console.log('Full run generator checks passed');

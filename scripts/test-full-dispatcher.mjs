import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateFullBrief } from './reefrelay-full-run-generator.mjs';
import { compile } from './reefrelay-taskflow-stub.mjs';
import { dispatchFullRun } from './reefrelay-full-dispatcher.mjs';

const fixtureNow = '2026-05-12T00:00:00.000Z';
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function buildRun() {
  const request = 'Implement the full-run dispatcher, review malformed child output handling, test blocked children, and verify before synthesis';
  const brief = generateFullBrief(request, { ownerSessionKey: 'session:phase-2-test', now: fixtureNow });
  return compile(brief, { now: fixtureNow });
}

function assertNormalizedRun(label, run) {
  if (!Array.isArray(run.tasks) || run.tasks.length < 2 || run.tasks.length > 5) fail(`${label}: expected 2-5 child tasks`);
  if (!Array.isArray(run.childResults) || run.childResults.length !== run.tasks.length) fail(`${label}: childResults should match task count`);
  if (run.finalSynthesis !== undefined) fail(`${label}: dispatcher must not emit final synthesis`);

  const taskIds = new Set(run.tasks.map((task) => task.id));
  const artifactIds = new Set((run.artifacts || []).map((artifact) => artifact.id));
  for (const task of run.tasks) {
    if (!taskIds.has(task.id)) fail(`${label}: impossible task id state`);
    if (!['done', 'blocked', 'failed'].includes(task.status)) fail(`${label}: task ${task.id} not terminal after dispatch`);
    if (!task.evidence?.some((id) => artifactIds.has(id))) fail(`${label}: task ${task.id} missing raw artifact evidence link`);
  }
  for (const result of run.childResults) {
    if (!taskIds.has(result.taskId)) fail(`${label}: child result references unknown task ${result.taskId}`);
    if (!['done', 'blocked', 'failed'].includes(result.status)) fail(`${label}: invalid child status ${result.status}`);
    if (!artifactIds.has(result.rawArtifact)) fail(`${label}: result ${result.taskId} missing raw artifact pointer`);
    if (!Array.isArray(result.findings)) fail(`${label}: result ${result.taskId} findings missing`);
    if (!Array.isArray(result.blockers)) fail(`${label}: result ${result.taskId} blockers missing`);
    if (!Array.isArray(result.assumptions)) fail(`${label}: result ${result.taskId} assumptions missing`);
    if (result.status === 'done' && result.findings.length === 0) fail(`${label}: done result ${result.taskId} needs findings`);
    if ((result.status === 'blocked' || result.status === 'failed') && result.blockers.length === 0) fail(`${label}: ${result.status} result ${result.taskId} needs blockers`);
    for (const finding of result.findings) {
      if (!Array.isArray(finding.evidence) || finding.evidence.length === 0) fail(`${label}: finding ${finding.id} missing evidence`);
    }
  }
}

const successRun = dispatchFullRun(buildRun(), { scenario: 'default', now: fixtureNow, artifactDir: mkdtempSync(join(tmpdir(), 'reef-dispatch-success-')) });
assertNormalizedRun('success', successRun);
if (successRun.status !== 'completed') fail(`success: expected completed, got ${successRun.status}`);
if (!successRun.childResults.every((result) => result.status === 'done')) fail('success: expected every child result done');

const dogfoodArtifactDir = mkdtempSync(join(tmpdir(), 'reef-dispatch-dogfood-'));
const dogfoodRun = dispatchFullRun(buildRun(), { scenario: 'phase2-dogfood', now: fixtureNow, artifactDir: dogfoodArtifactDir });
assertNormalizedRun('dogfood', dogfoodRun);
if (!dogfoodRun.childResults.some((result) => result.status === 'blocked')) fail('dogfood: expected blocked child result persistence');
if (!dogfoodRun.childResults.some((result) => result.status === 'failed')) fail('dogfood: expected malformed raw text to be rejected as failed result');
if (!dogfoodRun.decisions.some((decision) => decision.decision === 'repaired')) fail('dogfood: expected repair decision for malformed-but-repairable output');
if (!dogfoodRun.decisions.some((decision) => decision.decision === 'rejected')) fail('dogfood: expected rejected decision for raw malformed output');
if (!dogfoodRun.blockers.some((blocker) => blocker.taskId === 'verification')) fail('dogfood: expected verification blocker persisted at run level');

const dir = mkdtempSync(join(tmpdir(), 'reef-dispatch-cli-'));
try {
  const inputPath = join(dir, 'input.json');
  const outputPath = join(dir, 'output.json');
  const artifactDir = join(dir, 'artifacts');
  writeFileSync(inputPath, `${JSON.stringify(buildRun(), null, 2)}\n`);
  execFileSync('node', [
    'scripts/reefrelay-full-dispatcher.mjs',
    '--in', inputPath,
    '--out', outputPath,
    '--artifact-dir', artifactDir,
    '--scenario', 'phase2-dogfood',
    '--now', fixtureNow,
  ], { stdio: 'pipe' });
  const cliRun = JSON.parse(readFileSync(outputPath, 'utf8'));
  assertNormalizedRun('cli', cliRun);
  if (!cliRun.artifacts.every((artifact) => artifact.path.startsWith(artifactDir))) fail('cli: raw artifacts should be stored under artifact dir');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

rmSync(dogfoodArtifactDir, { recursive: true, force: true });

if (failed) process.exit(1);
console.log('Full dispatcher checks passed');

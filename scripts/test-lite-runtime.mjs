import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runLiteCommand } from './reefrelay-lite-runtime.mjs';

const fixtureNow = '2026-05-12T22:00:00.000Z';

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function validateCompletedRun(run) {
  assert(run.mode === 'lite', 'runtime should preserve lite mode');
  assert(run.status === 'completed', `expected completed run, got ${run.status}`);
  assert(run.finalDecision?.sendDecision === 'send', 'completed lite runtime should persist send decision');
  assert(run.gates?.safety?.result === 'passed', 'safety gate should pass');
  assert(run.gates?.verification?.result === 'passed', 'verification gate should pass');
  assert(run.gates?.finalAcceptance?.result === 'passed', 'final acceptance gate should pass');
  assert(Array.isArray(run.childResults) && run.childResults.length === run.tasks.length, 'child results should match task count');
  assert(Array.isArray(run.findingDecisions) && run.findingDecisions.length > 0, 'finding decisions required');
  assert(run.finalSynthesis?.sendDecision === 'send', 'final synthesis should carry send decision');

  const knownTaskIds = new Set(run.tasks.map((task) => task.id));
  const knownFindingIds = new Set();
  for (const result of run.childResults) {
    assert(knownTaskIds.has(result.taskId), `unknown child result task ${result.taskId}`);
    assert(result.status === 'done', `expected done child result for ${result.taskId}`);
    assert(result.rawArtifact, `child result ${result.taskId} missing raw artifact pointer`);
    for (const finding of result.findings) {
      knownFindingIds.add(finding.id);
      assert(Array.isArray(finding.evidence) && finding.evidence.length > 0, `finding ${finding.id} missing evidence`);
      assert(finding.doNotMutate === true, `finding ${finding.id} must preserve doNotMutate`);
    }
  }
  for (const decision of run.findingDecisions) {
    assert(knownFindingIds.has(decision.findingId), `decision references unknown finding ${decision.findingId}`);
    assert(decision.decider === 'orchestrator', 'finding decisions must be orchestrator-owned');
    assert(Array.isArray(decision.evidenceReviewed) && decision.evidenceReviewed.length > 0, `decision ${decision.findingId} missing reviewed evidence`);
  }
}

const commandRun = runLiteCommand('/reef_relay lite --read-only audit docs for stale roadmap items', { now: fixtureNow });
validateCompletedRun(commandRun);
assert(commandRun.goal === 'audit docs for stale roadmap items', 'command goal should survive parse/dispatch');
assert(commandRun.lite.mutationPolicy === 'none', 'read-only command should set mutation policy none');
assert(commandRun.finalSynthesis.summary.includes('Highlights:'), 'completed lite summary should include human-readable highlights');
assert(!commandRun.finalSynthesis.summary.endsWith('accepted findings.'), 'completed lite summary should not stop at a generic finding count');
assert(!commandRun.finalSynthesis.summary.includes('…'), 'completed lite summary should not truncate highlight text with ellipses');

const dir = mkdtempSync(join(tmpdir(), 'reef-lite-runtime-'));
try {
  const outPath = join(dir, 'command-runtime.json');
  const synthesisPath = join(dir, 'synthesis.md');
  const artifactDir = join(dir, 'artifacts');
  execFileSync('node', [
    'scripts/reefrelay-lite-runtime.mjs',
    '--command', '/reef_relay lite --read-only inspect docs for gaps',
    '--out', outPath,
    '--synthesis-out', synthesisPath,
    '--artifact-dir', artifactDir,
    '--now', fixtureNow,
  ], { stdio: 'pipe' });
  const cliRun = JSON.parse(readFileSync(outPath, 'utf8'));
  validateCompletedRun(cliRun);
  assert(cliRun.finalSynthesis?.artifactId === 'lite-final-synthesis', 'CLI run should persist final synthesis artifact');

  const blockedOut = join(dir, 'blocked-runtime.json');
  execFileSync('node', [
    'scripts/reefrelay-lite-runtime.mjs',
    '--in', 'specs/lite-briefs/memory-cleanup-readonly-audit.json',
    '--out', blockedOut,
    '--artifact-dir', join(dir, 'blocked-artifacts'),
    '--scenario', 'blocked',
    '--now', fixtureNow,
  ], { stdio: 'pipe' });
  const blockedRun = JSON.parse(readFileSync(blockedOut, 'utf8'));
  assert(blockedRun.status === 'blocked', 'blocked scenario should persist blocked run status');
  assert(blockedRun.finalDecision?.sendDecision === 'no-send', 'blocked scenario should persist no-send decision');
  assert(blockedRun.blockers.length > 0, 'blocked scenario should preserve blockers');

  const malformedOut = join(dir, 'malformed-runtime.json');
  execFileSync('node', [
    'scripts/reefrelay-lite-runtime.mjs',
    '--in', 'specs/lite-briefs/memory-cleanup-readonly-audit.json',
    '--out', malformedOut,
    '--artifact-dir', join(dir, 'malformed-artifacts'),
    '--scenario', 'malformed',
    '--now', fixtureNow,
  ], { stdio: 'pipe' });
  const malformedRun = JSON.parse(readFileSync(malformedOut, 'utf8'));
  assert(malformedRun.status === 'blocked', 'malformed scenario should block final send');
  assert(malformedRun.finalDecision?.sendDecision === 'no-send', 'malformed scenario should persist no-send decision');
  assert(malformedRun.childResults.some((result) => result.status === 'failed'), 'malformed scenario should reject raw child output as failed result');
  assert(malformedRun.decisions.some((decision) => decision.decision === 'rejected'), 'malformed scenario should record normalization rejection');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (process.exitCode) process.exit(process.exitCode);
console.log('Lite runtime dispatch checks passed');

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateFullBrief } from './reefrelay-full-run-generator.mjs';
import { compile } from './reefrelay-taskflow-stub.mjs';
import { dispatchFullRun } from './reefrelay-full-dispatcher.mjs';
import { createFinalSynthesis, enforceGates, finalizeFullRun, reviewFindings } from './reefrelay-full-finalizer.mjs';
import { runFullPipeline } from './reefrelay-full-pipeline.mjs';

const fixtureNow = '2026-05-12T00:00:00.000Z';
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function expectThrow(label, fn, expectedText) {
  try {
    fn();
    fail(`${label}: expected error`);
  } catch (err) {
    if (!String(err.message).includes(expectedText)) fail(`${label}: expected ${expectedText}, got ${err.message}`);
  }
}

function buildDispatchedRun(scenario = 'default') {
  const request = 'Implement gates, final synthesis, dogfood evidence, tests, and documentation for ReefNexus MVP Phase 3';
  const brief = generateFullBrief(request, { ownerSessionKey: 'session:phase-3-test', now: fixtureNow });
  const run = compile(brief, { now: fixtureNow });
  return dispatchFullRun(run, { scenario, now: fixtureNow, artifactDir: mkdtempSync(join(tmpdir(), `reef-finalizer-${scenario}-`)) });
}

function assertFinalRun(label, run) {
  if (!Array.isArray(run.findingDecisions) || run.findingDecisions.length === 0) fail(`${label}: missing finding decisions`);
  if (!run.gateRecords || run.gateRecords.length !== 3) fail(`${label}: expected three gate records`);
  for (const gate of ['safety', 'verification', 'finalAcceptance']) {
    if (!run.gates?.[gate]?.result) fail(`${label}: missing ${gate} gate`);
  }
  if (!run.finalDecision?.sendDecision) fail(`${label}: missing persisted send/no-send decision`);
  if (!run.finalSynthesis) fail(`${label}: missing final synthesis`);
  if (!Array.isArray(run.finalSynthesis.evidenceReferences) || run.finalSynthesis.evidenceReferences.length === 0) fail(`${label}: final synthesis needs evidence references`);
  if (!['send', 'no-send'].includes(run.finalSynthesis.sendDecision)) fail(`${label}: invalid synthesis send decision`);
}

const dispatched = buildDispatchedRun('default');
expectThrow('pending-gates', () => createFinalSynthesis(dispatched, { now: fixtureNow }), 'safety gate must be passed');

const unsupportedRun = reviewFindings(dispatched, { now: fixtureNow });
unsupportedRun.childResults[0].findings[0].evidence = [];
unsupportedRun.findingDecisions[0].decision = 'accepted';
unsupportedRun.findingDecisions[0].evidenceReviewed = [];
expectThrow('unsupported-accepted-finding', () => enforceGates(unsupportedRun, { now: fixtureNow }), 'unsupported child finding');

const noEvidenceRun = enforceGates(reviewFindings(dispatched, { now: fixtureNow }), { now: fixtureNow });
noEvidenceRun.findingDecisions = [];
noEvidenceRun.childResults.forEach((result) => { result.findings = []; result.toolOutputs = []; result.changedFiles = []; });
noEvidenceRun.gates.safety = { result: 'passed', notes: 'test' };
noEvidenceRun.gates.verification = { result: 'passed', notes: 'test' };
noEvidenceRun.gates.finalAcceptance = { result: 'passed', notes: 'test' };
noEvidenceRun.finalDecision = { sendDecision: 'send', persistedAt: fixtureNow, reason: 'test' };
noEvidenceRun.gateRecords = [];
expectThrow('final-acceptance-evidence', () => createFinalSynthesis(noEvidenceRun, { now: fixtureNow }), 'final acceptance requires evidence references');

const finalRun = finalizeFullRun(dispatched, { now: fixtureNow, synthesisOut: join(mkdtempSync(join(tmpdir(), 'reef-finalizer-synthesis-')), 'final.md') });
assertFinalRun('success-final', finalRun);
if (finalRun.finalDecision.sendDecision !== 'send') fail(`success-final: expected send, got ${finalRun.finalDecision.sendDecision}`);
if (finalRun.status !== 'completed') fail(`success-final: expected completed, got ${finalRun.status}`);
if (!finalRun.artifacts.some((artifact) => artifact.id === 'final-synthesis')) fail('success-final: missing final synthesis artifact');
if (!finalRun.finalSynthesis.toolEvidence?.some((item) => item.includes('deterministic verification fixture'))) fail('success-final: final synthesis should include verification tool output evidence');
if (finalRun.finalSynthesis.evidenceReferences.some((item) => item.includes('deterministic verification fixture'))) fail('success-final: evidence references should not duplicate raw tool output evidence');
if (finalRun.finalSynthesis.summary.includes(finalRun.goal)) fail('success-final: final synthesis summary should not paste the raw objective');
if (!finalRun.finalSynthesis.summary.includes(finalRun.runId)) fail('success-final: final synthesis summary should identify the run');
if (!finalRun.finalSynthesis.summary.includes('Highlights:')) fail('success-final: completed summary should include human-readable highlights');
if (finalRun.finalSynthesis.summary.endsWith('accepted findings.')) fail('success-final: completed summary should not stop at a generic finding count');
if (finalRun.finalSynthesis.summary.includes('…')) fail('success-final: completed summary should not truncate highlight text with ellipses');
if (!finalRun.finalSynthesis.caveatsOrBlockers.some((item) => /Changed files reported/.test(item))) fail('success-final: changed files should create an explicit closeout caveat');

const caveatRunInput = JSON.parse(JSON.stringify(dispatched));
caveatRunInput.childResults[0].assumptions.push('Partial pass: remaining files need follow-up and the workspace is still dirty.');
caveatRunInput.childResults[0].toolOutputs = [{ command: 'git status --short', exitCode: 0, stdout: '?? untracked-file.md', stderr: '', evidence: 'Dirty workspace fixture.' }];
const caveatRun = finalizeFullRun(caveatRunInput, { now: fixtureNow });
if (!caveatRun.finalSynthesis.caveatsOrBlockers.some((item) => /Partial pass/.test(item))) fail('caveat-final: child partial assumptions should appear in caveats');
if (!caveatRun.finalSynthesis.caveatsOrBlockers.some((item) => /dirty|incomplete closeout|residual state/i.test(item))) fail('caveat-final: dirty workspace tool output should appear in caveats');

const duplicateRunInput = JSON.parse(JSON.stringify(dispatched));
duplicateRunInput.childResults[0].findings.push(
  { ...duplicateRunInput.childResults[0].findings[0], id: 'duplicate-polish-1' },
  { ...duplicateRunInput.childResults[0].findings[0], id: 'duplicate-polish-2', claim: `${duplicateRunInput.childResults[0].findings[0].claim} ` },
);
const duplicateRun = finalizeFullRun(duplicateRunInput, { now: fixtureNow });
const duplicateClaim = duplicateRunInput.childResults[0].findings[0].claim;
if (duplicateRun.finalSynthesis.whatChangedOrFound.filter((item) => item === duplicateClaim).length !== 1) fail('duplicate-final: repeated equivalent findings should appear once in final synthesis');

const blockedRun = finalizeFullRun(buildDispatchedRun('phase2-dogfood'), { now: fixtureNow });
assertFinalRun('blocked-final', blockedRun);
if (blockedRun.finalDecision.sendDecision !== 'no-send') fail(`blocked-final: expected no-send, got ${blockedRun.finalDecision.sendDecision}`);
if (blockedRun.gates.verification.result !== 'blocked') fail('blocked-final: expected verification gate blocked');
if (blockedRun.finalSynthesis.summary.includes(blockedRun.goal)) fail('blocked-final: final synthesis summary should not paste the raw objective');

const pipelineDir = mkdtempSync(join(tmpdir(), 'reef-pipeline-'));
const pipeline = runFullPipeline('Implement the end-to-end full ReefRelay MVP pipeline with child dispatch, gates, final synthesis, tests, and docs', {
  ownerSessionKey: 'session:phase-3-pipeline',
  scenario: 'default',
  artifactDir: join(pipelineDir, 'artifacts'),
  synthesisOut: join(pipelineDir, 'final-synthesis.md'),
  now: fixtureNow,
});
assertFinalRun('pipeline', pipeline.finalizedRun);
if (pipeline.generatedRun.childResults.length !== 0) fail('pipeline: generated run should begin with empty childResults');
if (pipeline.dispatchedRun.childResults.length === 0) fail('pipeline: dispatched run should have childResults');
if (pipeline.finalizedRun.finalDecision.sendDecision !== 'send') fail('pipeline: expected send final decision');

const cliDir = mkdtempSync(join(tmpdir(), 'reef-pipeline-cli-'));
try {
  execFileSync('node', [
    'scripts/reefrelay-full-pipeline.mjs',
    '--input', 'Implement an evidence-backed full ReefRelay pipeline and verify it before final answer',
    '--out-dir', cliDir,
    '--owner-session', 'session:phase-3-cli',
    '--scenario', 'default',
    '--now', fixtureNow,
  ], { stdio: 'pipe' });
  const cliRun = JSON.parse(readFileSync(join(cliDir, 'final-run.json'), 'utf8'));
  assertFinalRun('cli-pipeline', cliRun);
} finally {
  rmSync(cliDir, { recursive: true, force: true });
}

rmSync(pipelineDir, { recursive: true, force: true });

if (failed) process.exit(1);
console.log('Full finalizer/pipeline checks passed');

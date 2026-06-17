import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const inDir = 'specs/lite-briefs';
const outDir = 'runs/lite-samples';
const fixtureNow = '2026-05-12T00:00:00.000Z';

const enumValues = {
  confidence: new Set(['low', 'medium', 'high']),
  risk: new Set(['low', 'medium', 'high']),
  recommendedAction: new Set(['accept', 'reject', 'defer']),
  decision: new Set(['accepted', 'rejected', 'deferred']),
};

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function compileBrief(inPath, outPath) {
  execFileSync('node', ['scripts/reefrelay-lite-stub.mjs', '--in', inPath, '--out', outPath, '--now', fixtureNow], { stdio: 'pipe' });
}

function compileCommand(command, outPath) {
  execFileSync('node', ['scripts/reefrelay-lite-stub.mjs', '--command', command, '--out', outPath, '--now', fixtureNow], { stdio: 'pipe' });
}

function expectCommandFailure(name, command, expectedMessage) {
  const dir = mkdtempSync(join(tmpdir(), 'reef-lite-command-negative-'));
  const outPath = join(dir, `${name}.out.json`);
  try {
    compileCommand(command, outPath);
    fail(`${name}: expected command compile failure`);
  } catch (err) {
    const text = `${err.stderr || ''}${err.stdout || ''}${err.message || ''}`;
    if (!text.includes(expectedMessage)) {
      fail(`${name}: expected error containing "${expectedMessage}", got ${JSON.stringify(text)}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function expectCompileFailure(name, brief, expectedMessage) {
  const dir = mkdtempSync(join(tmpdir(), 'reef-lite-negative-'));
  const inPath = join(dir, `${name}.json`);
  const outPath = join(dir, `${name}.out.json`);
  writeFileSync(inPath, `${JSON.stringify(brief, null, 2)}\n`);
  try {
    compileBrief(inPath, outPath);
    fail(`${name}: expected compile failure`);
  } catch (err) {
    const text = `${err.stderr || ''}${err.stdout || ''}${err.message || ''}`;
    if (!text.includes(expectedMessage)) {
      fail(`${name}: expected error containing "${expectedMessage}", got ${JSON.stringify(text)}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function validateChildResult(result) {
  for (const key of ['taskId', 'status', 'summary', 'findings', 'blockers', 'assumptions']) {
    if (result[key] === undefined || result[key] === null) throw new Error(`child result missing ${key}`);
  }
  if (!['done', 'blocked', 'failed'].includes(result.status)) throw new Error(`invalid child result status ${result.status}`);
  if (!Array.isArray(result.findings)) throw new Error('child result findings must be an array');
  if (!Array.isArray(result.blockers)) throw new Error('child result blockers must be an array');
  if (!Array.isArray(result.assumptions)) throw new Error('child result assumptions must be an array');
  for (const finding of result.findings) {
    for (const key of ['id', 'claim', 'evidence', 'confidence', 'risk', 'recommendedAction', 'doNotMutate']) {
      if (finding[key] === undefined || finding[key] === null) throw new Error(`finding missing ${key}`);
    }
    if (!Array.isArray(finding.evidence) || finding.evidence.length === 0) throw new Error(`finding ${finding.id} needs evidence`);
    if (!enumValues.confidence.has(finding.confidence)) throw new Error(`invalid confidence ${finding.confidence}`);
    if (!enumValues.risk.has(finding.risk)) throw new Error(`invalid risk ${finding.risk}`);
    if (!enumValues.recommendedAction.has(finding.recommendedAction)) throw new Error(`invalid recommendedAction ${finding.recommendedAction}`);
    if (finding.doNotMutate !== true) throw new Error(`finding ${finding.id} must set doNotMutate true`);
  }
}

function validateFindingDecision(decision, knownFindingIds) {
  for (const key of ['findingId', 'decision', 'reason', 'decider', 'evidenceReviewed']) {
    if (decision[key] === undefined || decision[key] === null) throw new Error(`finding decision missing ${key}`);
  }
  if (!knownFindingIds.has(decision.findingId)) throw new Error(`decision references unknown finding ${decision.findingId}`);
  if (!enumValues.decision.has(decision.decision)) throw new Error(`invalid decision ${decision.decision}`);
  if (decision.decider !== 'orchestrator') throw new Error('finding decision decider must be orchestrator');
  if (!Array.isArray(decision.evidenceReviewed) || decision.evidenceReviewed.length === 0) throw new Error(`decision ${decision.findingId} needs reviewed evidence`);
}

if (!existsSync(inDir)) {
  console.error('missing fixture dir specs/lite-briefs');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const files = readdirSync(inDir).filter((f) => f.endsWith('.json')).sort();
if (files.length === 0) {
  console.error('no lite brief fixtures found');
  process.exit(1);
}

for (const f of files) {
  const inPath = `${inDir}/${f}`;
  const outPath = `${outDir}/${f}`;
  compileBrief(inPath, outPath);

  const run = JSON.parse(readFileSync(outPath, 'utf8'));
  const requiredTop = ['schemaVersion', 'runId', 'mode', 'goal', 'pattern', 'riskClass', 'status', 'routing', 'lite', 'tasks', 'childResults', 'findingDecisions', 'gates'];
  for (const key of requiredTop) {
    if (run[key] === undefined || run[key] === null) fail(`${f}: missing ${key}`);
  }
  for (const key of ['routeOutcome', 'confidence', 'selectedLane', 'fallbackUsed', 'clarificationAsked', 'escalationTriggered']) {
    if (run.routing?.[key] === undefined || run.routing?.[key] === null) fail(`${f}: routing missing ${key}`);
  }
  if (run.mode !== 'lite') fail(`${f}: run mode is not lite`);
  if (run.lite?.durableTaskflow !== false) fail(`${f}: lite runs must not claim durable TaskFlow state`);
  if (!['none', 'orchestrator-only'].includes(run.lite?.mutationPolicy)) fail(`${f}: invalid mutation policy`);
  if (!Array.isArray(run.tasks) || run.tasks.length === 0 || run.tasks.length > run.lite.maxChildLanes) fail(`${f}: invalid task count`);
  for (const task of run.tasks) {
    if (task.mode === 'read-only' && task.mutationAllowed) fail(`${f}: read-only task allows mutation: ${task.id}`);
    if (task.mode === 'orchestrator-write' && !task.mutationAllowed) fail(`${f}: orchestrator-write task must explicitly allow mutation: ${task.id}`);
    if (task.resultSchema !== run.lite.childResultSchema) fail(`${f}: task result schema mismatch: ${task.id}`);
  }
  for (const state of ['accepted', 'rejected', 'deferred']) {
    if (!run.lite.findingDecisionStates.includes(state)) fail(`${f}: missing finding decision state ${state}`);
  }
}

const validChildResult = {
  taskId: 'audit-docs',
  status: 'done',
  summary: 'Found one evidence-backed candidate.',
  findings: [{
    id: 'finding-1',
    claim: 'Docs drift exists.',
    evidence: ['docs/example.md:12'],
    confidence: 'high',
    risk: 'low',
    recommendedAction: 'accept',
    doNotMutate: true,
  }],
  blockers: [],
  assumptions: [],
};
validateChildResult(validChildResult);
const knownFindingIds = new Set(validChildResult.findings.map((f) => f.id));
validateFindingDecision({
  findingId: 'finding-1',
  decision: 'accepted',
  reason: 'Evidence supports it.',
  decider: 'orchestrator',
  evidenceReviewed: ['docs/example.md:12'],
}, knownFindingIds);

for (const [name, result, expected] of [
  ['child-result-no-evidence', { ...validChildResult, findings: [{ ...validChildResult.findings[0], evidence: [] }] }, 'needs evidence'],
  ['child-result-may-mutate', { ...validChildResult, findings: [{ ...validChildResult.findings[0], doNotMutate: false }] }, 'doNotMutate true'],
]) {
  try {
    validateChildResult(result);
    fail(`${name}: expected validation failure`);
  } catch (err) {
    if (!String(err.message).includes(expected)) fail(`${name}: unexpected validation error ${err.message}`);
  }
}

validateFindingDecision({
  findingId: 'finding-1',
  decision: 'deferred',
  reason: 'Needs more evidence.',
  decider: 'orchestrator',
  evidenceReviewed: ['docs/example.md:12'],
}, knownFindingIds);
try {
  validateFindingDecision({
    findingId: 'missing-finding',
    decision: 'accepted',
    reason: 'Bad reference.',
    decider: 'orchestrator',
    evidenceReviewed: ['docs/example.md:12'],
  }, knownFindingIds);
  fail('finding-decision-unknown-id: expected validation failure');
} catch (err) {
  if (!String(err.message).includes('unknown finding')) fail(`finding-decision-unknown-id: unexpected validation error ${err.message}`);
}

const baseBrief = JSON.parse(readFileSync(`${inDir}/${files[0]}`, 'utf8'));
expectCompileFailure('missing-goal', { ...baseBrief, goal: '' }, 'brief.goal required');
expectCompileFailure('invalid-pattern', { ...baseBrief, pattern: 'magentic' }, 'invalid brief.pattern');
expectCompileFailure('invalid-risk', { ...baseBrief, riskClass: 'security' }, 'lite mode only accepts normal or sensitive risk');
expectCompileFailure('too-many-lanes', { ...baseBrief, contracts: [1, 2, 3, 4, 5].map((n) => ({ taskId: `lane-${n}`, mode: 'read-only' })) }, 'lite mode allows at most 4 child lanes');
expectCompileFailure('read-only-mutation', { ...baseBrief, contracts: [{ taskId: 'bad', mode: 'read-only', mutationAllowed: true }] }, 'read-only contract cannot allow mutation');
expectCompileFailure('mutation-policy-none', { ...baseBrief, mutationPolicy: 'none', contracts: [{ taskId: 'write', mode: 'orchestrator-write', mutationAllowed: true }] }, 'mutationPolicy none cannot include mutationAllowed tasks');

const commandDir = mkdtempSync(join(tmpdir(), 'reef-lite-command-'));
try {
  const outPath = join(commandDir, 'command.out.json');
  compileCommand('/reef_relay lite --read-only audit docs for stale status', outPath);
  const commandRun = JSON.parse(readFileSync(outPath, 'utf8'));
  if (commandRun.goal !== 'audit docs for stale status') fail('command parser: goal mismatch');
  if (commandRun.pattern !== 'concurrent') fail('command parser: default pattern mismatch');
  if (commandRun.riskClass !== 'normal') fail('command parser: default risk mismatch');
  if (commandRun.lite.mutationPolicy !== 'none') fail('command parser: --read-only did not set mutationPolicy none');
  if (commandRun.tasks.length !== 1 || commandRun.tasks[0].mode !== 'read-only') fail('command parser: expected one read-only task');
  if (commandRun.runId !== 'lite-cmd-audit-docs-for-stale-status') fail(`command parser: expected compact runId, got ${commandRun.runId}`);

  const longSlugOutPath = join(commandDir, 'long-slug-command.out.json');
  compileCommand('/reef_relay lite verify the ReefRelay Telegram-facing completion output and run slug display', longSlugOutPath);
  const longSlugRun = JSON.parse(readFileSync(longSlugOutPath, 'utf8'));
  if (longSlugRun.runId.endsWith('-')) fail(`command parser: runId should not end with hyphen: ${longSlugRun.runId}`);
  if (longSlugRun.runId.length > 49) fail(`command parser: runId should stay compact for Telegram display: ${longSlugRun.runId}`);
  if (longSlugRun.runId !== 'lite-cmd-verify-the-reefrelay-telegram-facing') fail(`command parser: unexpected compact long runId ${longSlugRun.runId}`);

  const skillOutPath = join(commandDir, 'skill-command.out.json');
  compileCommand('/skill reef-relay lite --pattern hierarchical --risk sensitive "check safe config drift"', skillOutPath);
  const skillCommandRun = JSON.parse(readFileSync(skillOutPath, 'utf8'));
  if (skillCommandRun.goal !== 'check safe config drift') fail('skill command parser: quoted goal mismatch');
  if (skillCommandRun.pattern !== 'hierarchical') fail('skill command parser: pattern option mismatch');
  if (skillCommandRun.riskClass !== 'sensitive') fail('skill command parser: risk option mismatch');
} finally {
  rmSync(commandDir, { recursive: true, force: true });
}
expectCommandFailure('unsupported-command', '/reef lite audit docs', 'unsupported command');
expectCommandFailure('missing-command-goal', '/reef_relay lite', 'expected /reef_relay lite <goal>');
expectCommandFailure('unsupported-command-option', '/reef_relay lite --wat audit docs', 'unsupported option --wat');

if (process.exitCode) process.exit(process.exitCode);
console.log(`Lite mode stub checks passed (${files.length} fixtures + negative/schema/command checks)`);

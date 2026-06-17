import { existsSync, mkdirSync, readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const fixtureNow = '2026-05-12T00:00:00.000Z';
const inDir = 'specs/taskflow-briefs';
const outDir = 'runs/samples';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function compileBrief(inPath, outPath) {
  execFileSync('node', ['scripts/reefrelay-taskflow-stub.mjs', '--in', inPath, '--out', outPath, '--now', fixtureNow], { stdio: 'pipe' });
}

function expectCompileFailure(name, brief, expectedMessage) {
  const dir = mkdtempSync(join(tmpdir(), 'reef-taskflow-negative-'));
  const inPath = join(dir, `${name}.json`);
  const outPath = join(dir, `${name}.out.json`);
  writeFileSync(inPath, `${JSON.stringify(brief, null, 2)}\n`);
  try {
    compileBrief(inPath, outPath);
    fail(`${name}: expected compile failure`);
  } catch (err) {
    const text = `${err.stderr || ''}${err.stdout || ''}${err.message || ''}`;
    if (!text.includes(expectedMessage)) fail(`${name}: expected error containing "${expectedMessage}", got ${JSON.stringify(text)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (!existsSync(inDir)) {
  fail('missing fixture dir specs/taskflow-briefs');
}
mkdirSync(outDir, { recursive: true });

const files = readdirSync(inDir).filter((f) => f.endsWith('.json')).sort();
if (files.length === 0) {
  fail('no taskflow brief fixtures found');
}

for (const f of files) {
  const inPath = `${inDir}/${f}`;
  const outPath = `${outDir}/${f}`;
  compileBrief(inPath, outPath);

  const run = JSON.parse(readFileSync(outPath, 'utf8'));
  const requiredTop = ['schemaVersion', 'runId', 'mode', 'goal', 'pattern', 'riskClass', 'status', 'routing', 'taskflow', 'tasks', 'childResults', 'findingDecisions', 'gates'];
  for (const key of requiredTop) {
    if (run[key] === undefined || run[key] === null) fail(`${f}: missing ${key}`);
  }
  if (run.mode !== 'full') fail(`${f}: expected full mode`);
  if (!Array.isArray(run.tasks) || run.tasks.length === 0) fail(`${f}: tasks missing/empty`);
  if (!run.taskflow.jobId || !Array.isArray(run.taskflow.childTaskIds)) fail(`${f}: taskflow mapping invalid`);
  if (run.taskflow.childTaskIds.length !== run.tasks.length) fail(`${f}: childTaskIds/task count mismatch`);

  const taskIds = new Set(run.tasks.map((task) => task.id));
  const findingIds = new Set();
  for (const result of run.childResults) {
    if (!taskIds.has(result.taskId)) fail(`${f}: child result references unknown task ${result.taskId}`);
    for (const finding of result.findings) {
      if (!Array.isArray(finding.evidence) || finding.evidence.length === 0) fail(`${f}: finding ${finding.id} missing evidence`);
      findingIds.add(finding.id);
    }
  }
  for (const decision of run.findingDecisions) {
    if (!findingIds.has(decision.findingId)) fail(`${f}: decision references unknown finding ${decision.findingId}`);
    if (!['accepted', 'rejected', 'deferred'].includes(decision.decision)) fail(`${f}: invalid decision ${decision.decision}`);
    if (decision.decider !== 'orchestrator') fail(`${f}: decision decider must be orchestrator`);
    if (!Array.isArray(decision.evidenceReviewed) || decision.evidenceReviewed.length === 0) fail(`${f}: decision ${decision.findingId} missing reviewed evidence`);
  }
}

const baseBrief = JSON.parse(readFileSync(`${inDir}/${files[0]}`, 'utf8'));
expectCompileFailure('unknown-child-task', {
  ...baseBrief,
  childResults: [{ taskId: 'missing-task', status: 'done', summary: 'bad', findings: [], blockers: [], assumptions: [] }],
}, 'unknown task');
expectCompileFailure('finding-without-evidence', {
  ...baseBrief,
  childResults: [{
    taskId: baseBrief.contracts[0].taskId,
    status: 'done',
    summary: 'bad',
    findings: [{ id: 'bad-finding', claim: 'unsupported', evidence: [], confidence: 'high', severity: 'low', recommendedAction: 'accept' }],
    blockers: [],
    assumptions: [],
  }],
}, 'needs evidence');
expectCompileFailure('unknown-finding-decision', {
  ...baseBrief,
  childResults: [{ taskId: baseBrief.contracts[0].taskId, status: 'done', summary: 'ok', findings: [], blockers: [], assumptions: [] }],
  findingDecisions: [{ findingId: 'missing-finding', decision: 'accepted', reason: 'bad', decider: 'orchestrator', evidenceReviewed: ['artifact:one'] }],
}, 'unknown finding');

console.log(`TaskFlow stub checks passed (${files.length} fixtures + negative/schema checks)`);

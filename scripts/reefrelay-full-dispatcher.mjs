import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const childStatuses = new Set(['done', 'blocked', 'failed']);
const confidenceLevels = new Set(['low', 'medium', 'high']);
const severityLevels = new Set(['low', 'medium', 'high', 'critical']);
const recommendedActions = new Set(['accept', 'reject', 'defer']);
const taskTerminalStatuses = new Set(['done', 'blocked', 'failed']);

function parseArgs(argv) {
  const args = { in: null, out: null, artifactDir: null, scenario: 'default', now: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--in') args.in = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--artifact-dir') args.artifactDir = argv[++i];
    else if (argv[i] === '--scenario') args.scenario = argv[++i];
    else if (argv[i] === '--now') args.now = argv[++i];
  }
  if (!args.in || !args.out) {
    console.error('usage: node scripts/reefrelay-full-dispatcher.mjs --in <run.json> --out <run.json> [--artifact-dir <dir>] [--scenario default|phase2-dogfood] [--now <iso>]');
    process.exit(1);
  }
  return args;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slug(input) {
  return String(input || 'artifact')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72) || 'artifact';
}

function ensureFullRun(run) {
  if (!run || run.mode !== 'full') throw new Error('dispatcher requires a full-mode run artifact');
  if (!Array.isArray(run.tasks) || run.tasks.length < 2) throw new Error('dispatcher requires at least two child tasks');
  if (run.tasks.length > 5) throw new Error('dispatcher prototype supports 2-5 child tasks per run');
  const ids = new Set();
  for (const task of run.tasks) {
    if (!task.id) throw new Error('task missing id');
    if (ids.has(task.id)) throw new Error(`duplicate task id ${task.id}`);
    ids.add(task.id);
    if (!task.objective) throw new Error(`task ${task.id} missing objective`);
    if (!Array.isArray(task.boundaries) || task.boundaries.length === 0) throw new Error(`task ${task.id} missing boundaries`);
    if (!Array.isArray(task.inputs) || task.inputs.length === 0) throw new Error(`task ${task.id} missing inputs`);
    if (!Array.isArray(task.outputs) || task.outputs.length === 0) throw new Error(`task ${task.id} missing expected outputs`);
    if (!Array.isArray(task.verification?.checks) || task.verification.checks.length === 0) throw new Error(`task ${task.id} missing evidence requirements`);
    if (!task.escalationCondition) throw new Error(`task ${task.id} missing escalation/blocker rules`);
  }
}

function makeFinding(task, index, now) {
  return {
    id: `${task.id}-finding-${index + 1}`,
    claim: `${task.id} completed its bounded contract for ${task.role || 'custom'} lane`,
    evidence: [`artifact:raw-${task.id}`, `task:${task.id}:objective`],
    confidence: 'high',
    severity: 'low',
    recommendedAction: 'accept',
    observedAt: now,
  };
}

function simulatedChildOutput(task, index, run, options) {
  const scenario = options.scenario || 'default';
  if (scenario === 'phase2-dogfood' && task.id === 'review') {
    return {
      taskId: task.id,
      status: 'done',
      summary: 'Review lane produced a repairable finding packet with scalar evidence.',
      findings: [{
        id: `${task.id}-finding-${index + 1}`,
        claim: 'Dispatcher normalization should repair scalar evidence into an evidence list.',
        evidence: `artifact:raw-${task.id}`,
        confidence: 'medium',
        severity: 'low',
        recommendedAction: 'accept',
      }],
      blockers: [],
      assumptions: ['Repairable malformed output is acceptable only after normalized shape validation.'],
    };
  }
  if (scenario === 'phase2-dogfood' && task.role === 'synthesizer') {
    return `RAW CHILD TEXT ONLY: ${task.id} cannot synthesize before gates and finding decisions exist.`;
  }
  if (scenario === 'phase2-dogfood' && task.id === 'verification') {
    return {
      taskId: task.id,
      status: 'blocked',
      summary: 'Verification lane is blocked until implementation artifacts exist in the real runtime.',
      findings: [],
      blockers: ['No live implementation diff was provided to execute tests against in deterministic dispatcher mode.'],
      assumptions: ['This fixture intentionally persists a blocked child result.'],
    };
  }
  const output = {
    taskId: task.id,
    status: 'done',
    summary: `${task.role || 'custom'} lane completed bounded dispatch for ${run.runId}.`,
    findings: [makeFinding(task, index, options.now)],
    blockers: [],
    assumptions: ['Deterministic dispatcher used a mock child runner with real child-result contract shape.'],
  };
  if (task.role === 'implementer') output.changedFiles = [`artifact:${task.id}:deterministic-change-summary`];
  if (task.id === 'verification') {
    output.toolOutputs = [{
      command: 'deterministic verification fixture',
      exitCode: 0,
      stdout: `verified ${run.runId} child-result contract`,
      stderr: '',
      evidence: 'Deterministic fixture proves verification output plumbing is present.',
    }];
  }
  return output;
}

function assertKnownTask(result, taskId) {
  if (result.taskId !== taskId) throw new Error(`child result taskId mismatch: expected ${taskId}, got ${result.taskId}`);
}

function normalizeFinding(finding, taskId, index, repairs) {
  if (!finding || typeof finding !== 'object') throw new Error(`finding ${index + 1} for ${taskId} is not an object`);
  const normalized = { ...finding };
  if (!normalized.id) normalized.id = `${taskId}-finding-${index + 1}`;
  if (!normalized.claim) throw new Error(`finding ${normalized.id} missing claim`);
  if (typeof normalized.evidence === 'string') {
    normalized.evidence = [normalized.evidence];
    repairs.push(`finding ${normalized.id}: scalar evidence repaired to evidence[]`);
  }
  if (!Array.isArray(normalized.evidence) || normalized.evidence.length === 0) throw new Error(`finding ${normalized.id} needs evidence`);
  if (!confidenceLevels.has(normalized.confidence)) throw new Error(`finding ${normalized.id} invalid confidence ${normalized.confidence}`);
  if (!severityLevels.has(normalized.severity)) throw new Error(`finding ${normalized.id} invalid severity ${normalized.severity}`);
  if (!recommendedActions.has(normalized.recommendedAction)) throw new Error(`finding ${normalized.id} invalid recommendedAction ${normalized.recommendedAction}`);
  return normalized;
}

function normalizeStringArray(value, fieldName, taskId) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`child result ${taskId} ${fieldName} must be an array`);
  return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
}


function pathWithin(pathname, root) {
  const resolvedPath = resolve(pathname);
  const resolvedRoot = resolve(root);
  return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}/`);
}

function validateChangedFiles(changedFiles, task, options = {}) {
  const roots = [options.scratchWorkspace, options.artifactDir].filter(Boolean).map((item) => resolve(item));
  const diagnostics = [];
  for (const file of changedFiles) {
    if (!isAbsolute(file)) {
      if (options.requireMaterializedChangedFiles) diagnostics.push(`Reported changed file must be an absolute materialized path for ${task.id}: ${file}`);
      continue;
    }
    const resolved = resolve(file);
    const isManagedPath = roots.length > 0 && roots.some((root) => pathWithin(resolved, root));
    if (task.role !== 'implementer') {
      diagnostics.push(`Non-implementer task ${task.id} is not allowed to report changed file: ${file}`);
      continue;
    }
    if (!isManagedPath) {
      diagnostics.push(`Changed file is outside the approved artifact/scratch workspace for ${task.id}: ${file}`);
      continue;
    }
    if (!existsSync(resolved)) diagnostics.push(`Reported changed file is missing on disk: ${file}`);
  }
  return diagnostics;
}

function normalizeToolOutputs(value, taskId) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`child result ${taskId} toolOutputs must be an array`);
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`toolOutputs[${index}] for ${taskId} must be an object`);
    const command = typeof item.command === 'string' ? item.command.trim() : '';
    if (!command) throw new Error(`toolOutputs[${index}] for ${taskId} missing command`);
    const normalized = { command };
    if (item.exitCode !== undefined) normalized.exitCode = Number(item.exitCode);
    if (typeof item.stdout === 'string') normalized.stdout = item.stdout.slice(0, 4000);
    if (typeof item.stderr === 'string') normalized.stderr = item.stderr.slice(0, 4000);
    if (typeof item.evidence === 'string') normalized.evidence = item.evidence;
    if (typeof item.path === 'string') normalized.path = item.path;
    return normalized;
  });
}

function normalizeChildOutput(raw, task, artifactId, options) {
  const repairs = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      result: {
        taskId: task.id,
        status: 'failed',
        summary: 'Malformed child output rejected; raw text retained only as an artifact.',
        findings: [],
        blockers: ['Child output was not a structured result object.'],
        assumptions: [],
        rawArtifact: artifactId,
        normalizedAt: options.now,
      },
      normalization: 'rejected',
      repairs,
    };
  }

  const normalized = { ...raw };
  assertKnownTask(normalized, task.id);
  if (!childStatuses.has(normalized.status)) throw new Error(`invalid child status ${normalized.status} for ${task.id}`);
  if (!normalized.summary) throw new Error(`child result ${task.id} missing summary`);
  if (!Array.isArray(normalized.findings)) throw new Error(`child result ${task.id} findings must be an array`);
  if (!Array.isArray(normalized.blockers)) throw new Error(`child result ${task.id} blockers must be an array`);
  if (!Array.isArray(normalized.assumptions)) throw new Error(`child result ${task.id} assumptions must be an array`);
  normalized.findings = normalized.findings.map((finding, index) => normalizeFinding(finding, task.id, index, repairs));
  normalized.changedFiles = normalizeStringArray(normalized.changedFiles, 'changedFiles', task.id);
  normalized.toolOutputs = normalizeToolOutputs(normalized.toolOutputs, task.id);
  const changedFileDiagnostics = normalized.status === 'done' ? validateChangedFiles(normalized.changedFiles, task, options) : [];
  if (changedFileDiagnostics.length > 0) {
    return {
      result: {
        taskId: task.id,
        status: 'failed',
        summary: 'Child reported changed files outside its allowed live-lane authority or missing from disk.',
        findings: [],
        blockers: changedFileDiagnostics,
        assumptions: [...(normalized.assumptions || []), 'Only implementer lanes may report materialized changedFiles, and live-mode changed files must live under the managed artifact/scratch workspace.'],
        changedFiles: normalized.changedFiles,
        toolOutputs: normalized.toolOutputs,
        rawArtifact: artifactId,
        normalizedAt: options.now,
      },
      normalization: 'rejected',
      repairs,
    };
  }
  if (normalized.status === 'done' && normalized.findings.length === 0) throw new Error(`done child result ${task.id} needs at least one evidence-backed finding`);
  if (normalized.status === 'done' && task.id === 'verification' && normalized.toolOutputs.length === 0) throw new Error('done verification child result needs at least one toolOutputs command record');
  if ((normalized.status === 'blocked' || normalized.status === 'failed') && normalized.blockers.length === 0) throw new Error(`${normalized.status} child result ${task.id} needs blocker details`);
  normalized.rawArtifact = artifactId;
  normalized.normalizedAt = options.now;
  return { result: normalized, normalization: repairs.length > 0 ? 'repaired' : 'accepted', repairs };
}

function artifactRecord(task, artifactPath, now) {
  return {
    id: `raw-${task.id}`,
    type: 'report',
    path: artifactPath,
    producerTaskId: task.id,
    createdAt: now,
  };
}

function writeRawArtifact(raw, task, run, artifactDir, now) {
  const dir = artifactDir || join('runs', 'dispatch-artifacts', slug(run.runId));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${slug(task.id)}.raw.json`);
  writeFileSync(path, `${JSON.stringify({ taskId: task.id, producedAt: now, raw }, null, 2)}\n`);
  return path;
}

function taskStatusFromResult(result) {
  if (!taskTerminalStatuses.has(result.status)) throw new Error(`cannot map child status ${result.status}`);
  return result.status;
}

export function dispatchFullRun(inputRun, options = {}) {
  const run = clone(inputRun);
  const now = options.now || new Date().toISOString();
  ensureFullRun(run);

  run.status = 'running';
  run.updatedAt = now;
  run.taskflow = { ...(run.taskflow || {}), lifecycle: 'dispatching', revision: (run.taskflow?.revision || 1) + 1 };
  run.childResults = [];
  run.artifacts = Array.isArray(run.artifacts) ? run.artifacts : [];
  run.decisions = Array.isArray(run.decisions) ? run.decisions : [];
  run.blockers = [];

  const runner = options.childRunner || simulatedChildOutput;

  for (let index = 0; index < run.tasks.length; index++) {
    const task = run.tasks[index];
    task.status = 'running';
    task.startedAt = task.startedAt || now;

    const raw = runner(task, index, run, { ...options, now });
    const rawPath = writeRawArtifact(raw, task, run, options.artifactDir, now);
    const artifact = artifactRecord(task, rawPath, now);
    run.artifacts.push(artifact);
    task.evidence = [...(task.evidence || []), artifact.id];

    const normalized = normalizeChildOutput(raw, task, artifact.id, { ...options, now });
    run.childResults.push(normalized.result);
    task.status = taskStatusFromResult(normalized.result);
    task.endedAt = now;
    task.verification = {
      ...(task.verification || {}),
      result: normalized.result.status === 'done' ? 'passed' : 'failed',
    };

    run.decisions.push({
      id: `normalize-${task.id}`,
      decision: normalized.normalization,
      reason: normalized.normalization === 'accepted'
        ? 'Structured child output matched full child-result schema.'
        : normalized.normalization === 'repaired'
          ? `Repairable child output normalized: ${normalized.repairs.join('; ')}`
          : 'Malformed child output rejected and persisted as failed child result.',
      timestamp: now,
      taskId: task.id,
      artifactId: artifact.id,
    });
  }

  run.blockers = run.childResults.flatMap((result) => result.blockers.map((blocker) => ({ taskId: result.taskId, blocker })));
  run.status = run.childResults.some((result) => result.status === 'failed')
    ? 'failed'
    : run.childResults.some((result) => result.status === 'blocked')
      ? 'blocked'
      : 'completed';
  run.taskflow.lifecycle = run.status;
  run.updatedAt = now;
  return run;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv);
  const inPath = resolve(args.in);
  const outPath = resolve(args.out);
  const run = JSON.parse(readFileSync(inPath, 'utf8'));
  const dispatched = dispatchFullRun(run, {
    artifactDir: args.artifactDir,
    scenario: args.scenario,
    now: args.now,
  });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(dispatched, null, 2)}\n`);
  console.log(`dispatched full ReefRelay run -> ${outPath}`);
}

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { cpus, loadavg, totalmem } from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { dispatchLiteRun } from './reefrelay-lite-runtime.mjs';
import { dispatchFullRun } from './reefrelay-full-dispatcher.mjs';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_CHILD_LANES = 5;
const DEFAULT_MAX_CONCURRENT_CHILD_LANES = 1;
const DEFAULT_RESOURCE_GUARD = Object.freeze({
  enabled: true,
  minAvailableMemoryMb: 2048,
  maxLoad1: 4,
  maxLoadPerCpu: 0.8,
  maxOpenClawHooks: 0,
});
const modes = new Set(['lite', 'full']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertLiveOptions(run, options) {
  if (!run || !modes.has(run.mode)) throw new Error('live dispatcher requires a lite or full run artifact');
  if (!Array.isArray(run.tasks) || run.tasks.length === 0) throw new Error('live dispatcher requires child tasks');
  const maxChildLanes = options.maxChildLanes || run.lite?.maxChildLanes || DEFAULT_MAX_CHILD_LANES;
  if (run.tasks.length > maxChildLanes) throw new Error(`live dispatcher refused ${run.tasks.length} child lanes; maxChildLanes is ${maxChildLanes}`);
  if (!options.adapter || typeof options.adapter.spawnChildTask !== 'function') throw new Error('live dispatcher requires an adapter with spawnChildTask(input)');
  return { maxChildLanes };
}

function maxConcurrentChildLanes(options = {}) {
  const requested = Number(options.maxConcurrentChildLanes || options.maxConcurrentLiveChildLanes || DEFAULT_MAX_CONCURRENT_CHILD_LANES);
  if (!Number.isFinite(requested) || requested < 1) return DEFAULT_MAX_CONCURRENT_CHILD_LANES;
  return Math.max(1, Math.floor(requested));
}

function readMemAvailableMb() {
  try {
    const text = readFileSync('/proc/meminfo', 'utf8');
    const match = text.match(/^MemAvailable:\s+(\d+)\s+kB$/m);
    if (match) return Math.round(Number(match[1]) / 1024);
  } catch {}
  return Math.round(totalmem() / (1024 * 1024));
}

function countProcessesByComm(name) {
  let count = 0;
  try {
    for (const entry of readdirSync('/proc', { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
      try {
        if (readFileSync(`/proc/${entry.name}/comm`, 'utf8').trim() === name) count += 1;
      } catch {}
    }
  } catch {}
  return count;
}

function liveResourceSnapshot() {
  const loads = loadavg();
  const cpuCount = Math.max(1, cpus().length || 1);
  return {
    load1: Number(loads[0].toFixed(2)),
    loadPerCpu: Number((loads[0] / cpuCount).toFixed(2)),
    cpuCount,
    availableMemoryMb: readMemAvailableMb(),
    openclawHooks: countProcessesByComm('openclaw-hooks'),
  };
}

function resourceGuardOptions(options = {}) {
  const overrides = options.resourceGuard && typeof options.resourceGuard === 'object' ? options.resourceGuard : {};
  return {
    ...DEFAULT_RESOURCE_GUARD,
    ...overrides,
    enabled: overrides.enabled ?? options.resourceGuardEnabled ?? DEFAULT_RESOURCE_GUARD.enabled,
  };
}

function assertLiveResourceGuard(options = {}) {
  const guard = resourceGuardOptions(options);
  if (!guard.enabled) return null;
  const snapshot = typeof options.resourceSnapshot === 'function' ? options.resourceSnapshot() : liveResourceSnapshot();
  const failures = [];
  if (snapshot.availableMemoryMb < guard.minAvailableMemoryMb) {
    failures.push(`available memory ${snapshot.availableMemoryMb}MiB is below ${guard.minAvailableMemoryMb}MiB`);
  }
  if (snapshot.load1 > guard.maxLoad1) {
    failures.push(`1m load ${snapshot.load1} is above ${guard.maxLoad1}`);
  }
  if (snapshot.loadPerCpu > guard.maxLoadPerCpu) {
    failures.push(`load per CPU ${snapshot.loadPerCpu} is above ${guard.maxLoadPerCpu}`);
  }
  if (snapshot.openclawHooks > guard.maxOpenClawHooks) {
    failures.push(`openclaw-hooks process count ${snapshot.openclawHooks} is above ${guard.maxOpenClawHooks}`);
  }
  if (failures.length) {
    const details = `snapshot=${JSON.stringify(snapshot)}, thresholds=${JSON.stringify(guard)}`;
    throw new Error(`live resource guard refused child dispatch: ${failures.join('; ')}; ${details}`);
  }
  return snapshot;
}

function isImplementationRole(task) {
  return task?.role === 'implementer';
}

function isOrchestratorOnlyTask(task) {
  return task?.role === 'synthesizer' || task?.id === 'synthesis';
}

function buildPrompt(task, run, options = {}) {
  const artifactDir = options.artifactDir ? resolve(options.artifactDir) : null;
  const scratchWorkspace = options.scratchWorkspace ? resolve(options.scratchWorkspace) : artifactDir ? resolve(artifactDir, 'scratch-workspace') : null;
  const mutationPolicy = run.mode === 'lite'
    ? 'Mutation policy: read-only. Do not mutate files or external systems.'
    : isImplementationRole(task)
      ? [
          'Mutation policy: this implementer lane may create or modify files ONLY inside the shared artifact/scratch paths listed below.',
          'Do not perform destructive, external, credential, access-control, service, git commit/push, or public-send actions. If the task needs those, block with a clear blocker.',
          'For zero-risk greenfield/prototype requests, choose reasonable defaults and build inside the scratch workspace instead of blocking only because no repo/path/spec was supplied.',
          'For implementer lanes on greenfield prototypes: keep scope intentionally tiny, prefer dependency-free static HTML/CSS/JS or one small script, write the minimal files, and return promptly with exact paths. Do not install packages, scaffold frameworks, or wait for a server unless explicitly required.',
        ].join(' ')
      : [
          'Mutation policy: this is a non-implementation lane. Do not create, modify, move, delete, commit, push, or otherwise mutate files or external systems.',
          'Use read-only inspection and real verification commands only. The dispatcher will persist your JSON report as an artifact; do not write separate report files yourself.',
          'If correctness requires mutation, return status blocked with a blocker that names the needed implementer/orchestrator action.',
        ].join(' ');
  const priorResults = Array.isArray(options.priorChildResults) && options.priorChildResults.length
    ? `Prior child results available to this lane:\n${JSON.stringify(options.priorChildResults, null, 2)}`
    : '';
  return [
    'You are a bounded ReefRelay child worker. Return ONLY one JSON object matching this contract:',
    '{"taskId":"<task id>","status":"done|blocked|failed","summary":"short summary","findings":[{"id":"optional","claim":"evidence-backed claim","evidence":["specific reference"],"confidence":"low|medium|high","risk":"low|medium|high","severity":"low|medium|high|critical","recommendedAction":"accept|reject|defer","doNotMutate":true}],"blockers":[],"assumptions":[],"changedFiles":["optional paths"],"toolOutputs":[{"command":"exact command or tool action","exitCode":0,"stdout":"short relevant stdout","stderr":"short relevant stderr","evidence":"why this output matters"}]}',
    'For lite mode, every finding MUST include risk and doNotMutate:true. For full mode, every finding MUST include severity.',
    'recommendedAction is the orchestrator disposition for the finding itself, not the remediation timing. Use recommendedAction:"accept" for evidence-backed findings that should appear in the final report, even when the safe next step is to defer edits. Use "defer" only when a finding is plausible but needs more evidence, approval, or a heavier workflow before it is reportable.',
    'When the task requires file creation, inspection, or verification, you MUST use real available tools/commands to do it. Do not describe, simulate, or invent writes/checks. Only report changedFiles that now exist on disk, and only report toolOutputs from real tool/command results.',
    'When you use tools or shell commands, include the working tool output in toolOutputs with exact command/action, exitCode when available, and concise stdout/stderr snippets. Verification lanes MUST include at least one real command/tool output when status is done.',
    'If you cannot complete safely, return status blocked with blockers.',
    mutationPolicy,
    '',
    `Run: ${run.runId}`,
    `Mode: ${run.mode}`,
    `Goal: ${run.goal || run.request || run.brief?.goal || 'unknown'}`,
    `Repository/workspace path: ${options.workspacePath || process.cwd()}`,
    artifactDir ? `Shared artifact directory: ${artifactDir}` : '',
    scratchWorkspace ? `Shared scratch workspace: ${scratchWorkspace}` : '',
    `Task ID: ${task.id}`,
    `Role: ${task.role || 'child'}`,
    `Objective: ${task.objective}`,
    `Boundaries: ${(task.boundaries || []).join('; ')}`,
    `Inputs: ${(task.inputs || []).join('; ')}`,
    `Expected outputs: ${(task.outputs || []).join('; ')}`,
    `Verification checks: ${(task.verification?.checks || []).join('; ')}`,
    `Escalation condition: ${task.escalationCondition || 'block when unsafe or uncertain'}`,
    priorResults,
    options.contextText ? `Context excerpts for this child lane:\n${options.contextText}` : '',
  ].filter(Boolean).join('\n');
}

function timeoutBlockedResult(task, timeoutMs, now) {
  return {
    taskId: task.id,
    status: 'blocked',
    summary: `Live child task timed out after ${timeoutMs}ms.`,
    findings: [],
    blockers: [`Live child task ${task.id} exceeded timeout ${timeoutMs}ms.`],
    assumptions: ['Timeout is treated as blocked/no-send evidence, not a successful child result.'],
    timedOutAt: now,
  };
}

function requestedLiveDispatchMetadata(options = {}) {
  return {
    agent: options.agent || null,
    model: options.model || null,
    thinking: options.thinking || null,
  };
}

function formatLiveDispatchMetadata(metadata = {}) {
  return `agent=${metadata.agent || 'default'}, model=${metadata.model || 'default'}, thinking=${metadata.thinking || 'default'}`;
}

function adapterErrorResult(task, error, now, liveDispatchMetadata = {}) {
  const dispatchMetadataText = formatLiveDispatchMetadata(liveDispatchMetadata);
  return {
    taskId: task.id,
    status: 'blocked',
    summary: 'Live child adapter failed before producing a valid result.',
    findings: [],
    blockers: [`Live child adapter error for ${task.id} (${dispatchMetadataText}): ${error.message}`],
    assumptions: ['Adapter failures block final send until retried or repaired.'],
    liveDispatchMetadata,
    failedAt: now,
  };
}

function promptFingerprint(prompt) {
  return createHash('sha256').update(prompt).digest('hex');
}

function previousResultMap(previousRun) {
  const map = new Map();
  for (const result of previousRun?.childResults || []) {
    if (result?.taskId) map.set(result.taskId, clone(result));
  }
  return map;
}

function shouldReusePreviousResult(task, previousResult, fingerprint, options) {
  if (!previousResult) return false;
  if (previousResult.livePromptFingerprint !== fingerprint) return false;
  if (options.retryBlockedChildLanes && ['blocked', 'failed'].includes(previousResult.status)) return false;
  if (Array.isArray(options.retryTaskIds) && options.retryTaskIds.includes(task.id)) return false;
  return true;
}

async function withTimeout(promise, task, timeoutMs, now) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((resolveTimeout) => {
        timeout = setTimeout(() => resolveTimeout(timeoutBlockedResult(task, timeoutMs, now)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function emitProgress(options, event) {
  if (typeof options.onProgress !== 'function') return;
  try {
    await Promise.resolve(options.onProgress(event));
  } catch {
    // Progress reporting is best-effort and must never fail live dispatch.
  }
}

async function collectLiveResults(inputRun, options = {}) {
  const run = clone(inputRun);
  const now = options.now || new Date().toISOString();
  assertLiveOptions(run, options);
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const resultByTask = new Map();
  const previousByTask = previousResultMap(options.previousRun);
  const retryEvents = [];

  const spawnOne = async (task, index, priorChildResults = []) => {
    const prompt = buildPrompt(task, run, { ...options, priorChildResults });
    const fingerprint = promptFingerprint(prompt);
    const previous = previousByTask.get(task.id);
    if (shouldReusePreviousResult(task, previous, fingerprint, options)) {
      resultByTask.set(task.id, {
        ...previous,
        assumptions: [...(previous.assumptions || []), 'Reused previous live child result during resume; child was not respawned.'],
        resumedFromPreviousRun: options.previousRun?.runId || true,
      });
      retryEvents.push({
        id: `live-resume-reuse-${task.id}`,
        taskId: task.id,
        action: 'reuse-previous-result',
        previousStatus: previous.status,
        promptFingerprint: fingerprint,
        timestamp: now,
      });
      return;
    }

    if (previous) {
      retryEvents.push({
        id: `live-retry-${task.id}`,
        taskId: task.id,
        action: 'respawn-child',
        previousStatus: previous.status,
        reason: previous.livePromptFingerprint === fingerprint ? 'retry-requested' : 'prompt-or-context-changed',
        promptFingerprint: fingerprint,
        timestamp: now,
      });
    }

    try {
      assertLiveResourceGuard(options);
      await emitProgress(options, {
        stage: 'child-start',
        mode: run.mode,
        taskId: task.id,
        role: task.role,
        message: `ReefRelay ${run.mode} live: starting ${task.role || task.id} lane…`,
      });
      const raw = await withTimeout(Promise.resolve(options.adapter.spawnChildTask({
        mode: run.mode,
        run,
        task,
        index,
        prompt,
        timeoutMs,
        now,
        agent: options.agent,
        model: options.model,
        thinking: options.thinking,
        artifactDir: options.artifactDir,
        scratchWorkspace: options.scratchWorkspace,
        priorChildResults,
      })), task, timeoutMs, now);
      resultByTask.set(task.id, raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw, livePromptFingerprint: fingerprint } : raw);
    } catch (error) {
      resultByTask.set(task.id, { ...adapterErrorResult(task, error, now, requestedLiveDispatchMetadata(options)), livePromptFingerprint: fingerprint });
    }
  };

  if (run.mode === 'full' && run.pattern !== 'concurrent') {
    const priorChildResults = [];
    let index = 0;
    while (index < run.tasks.length) {
      const task = run.tasks[index];
      const next = run.tasks[index + 1];
      const canParallelReviewAndVerify = task?.id === 'review' && next?.id === 'verification';
      if (canParallelReviewAndVerify && maxConcurrentChildLanes(options) >= 2) {
        await Promise.all([
          spawnOne(task, index, priorChildResults),
          spawnOne(next, index + 1, priorChildResults),
        ]);
        if (resultByTask.has(task.id)) priorChildResults.push(resultByTask.get(task.id));
        if (resultByTask.has(next.id)) priorChildResults.push(resultByTask.get(next.id));
        index += 2;
        continue;
      }
      await spawnOne(task, index, priorChildResults);
      if (resultByTask.has(task.id)) priorChildResults.push(resultByTask.get(task.id));
      index += 1;
    }
  } else {
    const limit = maxConcurrentChildLanes(options);
    for (let offset = 0; offset < run.tasks.length; offset += limit) {
      await Promise.all(run.tasks.slice(offset, offset + limit).map((task, index) => spawnOne(task, offset + index, [])));
    }
  }

  return { now, resultByTask, retryEvents };
}

function liveChildRunner(resultByTask) {
  return (task) => {
    if (!resultByTask.has(task.id)) throw new Error(`live dispatcher missing result for ${task.id}`);
    return resultByTask.get(task.id);
  };
}

function omitOrchestratorOnlyTasks(inputRun, now) {
  const run = clone(inputRun);
  if (run.mode !== 'full') return run;
  const skipped = (run.tasks || []).filter(isOrchestratorOnlyTask);
  if (skipped.length === 0) return run;
  run.tasks = run.tasks.filter((task) => !isOrchestratorOnlyTask(task));
  run.decisions = [
    ...(Array.isArray(run.decisions) ? run.decisions : []),
    ...skipped.map((task) => ({
      id: `skip-live-child-${task.id}`,
      decision: 'orchestrator-owned-task',
      reason: 'Synthesis/final acceptance is owned by the orchestrator finalizer and must not run as a live mutable child lane.',
      timestamp: now,
      taskId: task.id,
    })),
  ];
  return run;
}

export async function dispatchLiveRun(inputRun, options = {}) {
  const baseNow = options.now || new Date().toISOString();
  const executableRun = omitOrchestratorOnlyTasks(inputRun, baseNow);
  const { now, resultByTask, retryEvents } = await collectLiveResults(executableRun, { ...options, now: baseNow });
  const retryAnnotatedRun = {
    ...clone(executableRun),
    retryEvents: [
      ...(Array.isArray(executableRun.retryEvents) ? executableRun.retryEvents : []),
      ...retryEvents,
    ],
  };
  const dispatchOptions = {
    ...options,
    now,
    childRunner: liveChildRunner(resultByTask),
    requireMaterializedChangedFiles: true,
  };
  delete dispatchOptions.adapter;
  delete dispatchOptions.previousRun;
  if (inputRun.mode === 'lite') return dispatchLiteRun(retryAnnotatedRun, dispatchOptions);
  if (inputRun.mode === 'full') return dispatchFullRun(retryAnnotatedRun, dispatchOptions);
  throw new Error(`unsupported live dispatch mode ${inputRun.mode}`);
}

export async function loadLiveAdapter(adapterPath) {
  if (!adapterPath) throw new Error('live adapter path required');
  const moduleUrl = adapterPath.startsWith('file:') ? adapterPath : pathToFileURL(resolve(adapterPath)).href;
  const mod = await import(moduleUrl);
  const adapter = mod.default || mod.adapter || mod;
  if (!adapter || typeof adapter.spawnChildTask !== 'function') throw new Error(`live adapter ${adapterPath} must export spawnChildTask`);
  return adapter;
}

export { buildPrompt };

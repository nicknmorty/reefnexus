import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileLiteRun, parseLiteCommand } from './reefrelay-lite-stub.mjs';
import { generateFullBrief } from './reefrelay-full-run-generator.mjs';
import { compile } from './reefrelay-taskflow-stub.mjs';
import { dispatchLiveRun, loadLiveAdapter } from './reefrelay-live-dispatcher.mjs';

const fixtureNow = '2026-05-13T03:00:00.000Z';
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function safeResourceSnapshot() {
  return {
    load1: 0.5,
    loadPerCpu: 0.1,
    cpuCount: 8,
    availableMemoryMb: 8192,
    openclawHooks: 0,
  };
}

const fakeAdapter = await loadLiveAdapter('skills/reef-relay/adapters/fake-live-adapter.mjs');
const dir = mkdtempSync(join(tmpdir(), 'reef-live-dispatch-'));
try {
  const liteRun = compileLiteRun(parseLiteCommand('/reef_relay lite --read-only inspect live dispatcher contract'), { now: fixtureNow });
  const liveLite = await dispatchLiveRun(liteRun, {
    adapter: fakeAdapter,
    artifactDir: join(dir, 'lite-artifacts'),
    synthesisOut: join(dir, 'lite-synthesis.md'),
    timeoutMs: 10_000,
    now: fixtureNow,
    resourceSnapshot: safeResourceSnapshot,
  });
  assert(liveLite.status === 'completed', `live lite expected completed, got ${liveLite.status}`);
  assert(liveLite.finalDecision?.sendDecision === 'send', 'live lite should send after fake adapter success');
  assert(liveLite.childResults.every((result) => result.rawArtifact), 'live lite should quarantine every raw child result');
  assert(liveLite.finalSynthesis?.artifactId === 'lite-final-synthesis', 'live lite should write synthesis artifact');

  const fullBrief = generateFullBrief('review live dispatcher, verify fake adapter, and summarize results', { now: fixtureNow });
  const fullRun = compile(fullBrief, { now: fixtureNow });
  const liveFull = await dispatchLiveRun(fullRun, {
    adapter: fakeAdapter,
    artifactDir: join(dir, 'full-artifacts'),
    timeoutMs: 10_000,
    now: fixtureNow,
    resourceSnapshot: safeResourceSnapshot,
  });
  assert(liveFull.status === 'completed', `live full expected completed, got ${liveFull.status}`);
  assert(liveFull.childResults.length === liveFull.tasks.length, 'live full should collect one packet per child lane');
  assert(liveFull.childResults.every((result) => result.findings.every((finding) => finding.severity === 'low')), 'live full findings should preserve severity');
  assert(liveFull.childResults.find((result) => result.taskId === 'verification')?.toolOutputs?.length > 0, 'live full verification should preserve working tool output records');

  let guardSpawned = false;
  const guardRejected = await dispatchLiveRun(liteRun, {
    adapter: {
      async spawnChildTask() {
        guardSpawned = true;
        return { taskId: 'never', status: 'done', summary: 'bad', findings: [], blockers: [], assumptions: [] };
      },
    },
    artifactDir: join(dir, 'resource-guard-artifacts'),
    timeoutMs: 10_000,
    now: fixtureNow,
    resourceSnapshot: () => ({ load1: 9.5, loadPerCpu: 1.2, cpuCount: 8, availableMemoryMb: 512, openclawHooks: 3 }),
  });
  assert(!guardSpawned, 'resource guard should refuse before spawning a live child');
  assert(guardRejected.status === 'blocked', 'resource guard refusal should block final send');
  assert(guardRejected.finalDecision?.sendDecision === 'no-send', 'resource guard refusal should no-send');
  assert(guardRejected.blockers.some((item) => /live resource guard refused child dispatch/.test(item.blocker)), 'resource guard blocker should be persisted');

  const promptLog = [];
  const sequencingAdapter = {
    async spawnChildTask({ task, prompt }) {
      promptLog.push({ taskId: task.id, prompt });
      const result = {
        taskId: task.id,
        status: 'done',
        summary: `${task.id} observed hierarchical live prompt context.`,
        findings: [{
          claim: `${task.id} prompt included the expected live coordination policy.`,
          evidence: ['scripts/test-live-dispatcher.mjs:hierarchical-live-prompt'],
          confidence: 'high',
          severity: 'low',
          recommendedAction: 'accept',
        }],
        blockers: [],
        assumptions: [],
      };
      if (task.id === 'verification') {
        result.toolOutputs = [{ command: 'sequencing verification fixture', exitCode: 0, stdout: 'ok', stderr: '', evidence: 'Test adapter provided required verification tool output.' }];
      }
      return result;
    },
  };
  await dispatchLiveRun(fullRun, {
    adapter: sequencingAdapter,
    artifactDir: join(dir, 'sequencing-artifacts'),
    scratchWorkspace: join(dir, 'sequencing-artifacts', 'scratch-workspace'),
    timeoutMs: 10_000,
    now: fixtureNow,
    resourceSnapshot: safeResourceSnapshot,
  });
  const implementerPrompt = promptLog.find((item) => item.taskId === 'implementation')?.prompt || '';
  const nonImplementerPrompt = promptLog.find((item) => item.taskId !== 'implementation')?.prompt || '';
  assert(implementerPrompt.includes('may create or modify files ONLY inside the shared artifact/scratch paths'), 'full live implementer prompt should allow bounded artifact/scratch mutations');
  assert(!implementerPrompt.includes('unless the task explicitly names a different target path'), 'full live implementer prompt must not allow external target-path mutation escape hatches');
  assert(implementerPrompt.includes('git commit/push'), 'full live implementer prompt should explicitly ban git commit/push');
  assert(implementerPrompt.includes('For zero-risk greenfield/prototype requests, choose reasonable defaults'), 'full live implementer prompt should avoid blocking zero-risk greenfield builds only for missing path/spec');
  assert(implementerPrompt.includes('For implementer lanes on greenfield prototypes: keep scope intentionally tiny'), 'full live implementer prompt should keep greenfield implementers timeboxed and dependency-free');
  assert(nonImplementerPrompt.includes('this is a non-implementation lane'), 'full live non-implementer prompts should be explicitly read-only');
  assert(!nonImplementerPrompt.includes('may create or modify files ONLY inside the shared artifact/scratch paths'), 'full live non-implementer prompts must not inherit implementer mutation authority');
  assert(promptLog.every((item) => item.taskId !== 'synthesis'), 'live dispatcher should not spawn synthesis as a child lane');
  assert(promptLog[0]?.prompt.includes('recommendedAction is the orchestrator disposition for the finding itself'), 'live prompt should clarify accept vs deferred remediation semantics');
  assert(promptLog[0]?.prompt.includes('Use recommendedAction:"accept" for evidence-backed findings that should appear in the final report'), 'live prompt should prevent no-send from edit-deferral wording');
  assert(!promptLog[0]?.prompt.includes('docs/PROD_RUNTIME_TEST_2026-05-12.md'), 'full live prompt should not contain stale smoke-doc context by default');
  assert(promptLog[1]?.prompt.includes('Prior child results available to this lane'), 'hierarchical full live prompts should receive prior child results');
  assert(promptLog[1]?.prompt.includes(promptLog[0].taskId), 'prior child result context should cite earlier task id');

  const parallelStarted = [];
  const parallelAdapter = {
    async spawnChildTask({ task }) {
      parallelStarted.push({ taskId: task.id, at: Date.now() });
      if (task.id === 'review' || task.id === 'verification') await new Promise((resolve) => setTimeout(resolve, 60));
      const result = {
        taskId: task.id,
        status: 'done',
        summary: `${task.id} parallel scheduling fixture completed.`,
        findings: [{
          claim: `${task.id} fixture finding`,
          evidence: ['scripts/test-live-dispatcher.mjs:parallel-review-verification-fixture'],
          confidence: 'high',
          severity: 'low',
          recommendedAction: 'accept',
        }],
        blockers: [],
        assumptions: [],
      };
      if (task.id === 'verification') result.toolOutputs = [{ command: 'parallel verification fixture', exitCode: 0, stdout: 'ok', stderr: '', evidence: 'Regression fixture.' }];
      return result;
    },
  };
  await dispatchLiveRun(fullRun, {
    adapter: parallelAdapter,
    artifactDir: join(dir, 'parallel-artifacts'),
    scratchWorkspace: join(dir, 'parallel-artifacts', 'scratch-workspace'),
    timeoutMs: 10_000,
    maxConcurrentChildLanes: 2,
    now: fixtureNow,
    resourceSnapshot: safeResourceSnapshot,
  });
  const reviewStart = parallelStarted.find((item) => item.taskId === 'review')?.at;
  const verificationStart = parallelStarted.find((item) => item.taskId === 'verification')?.at;
  assert(Number.isFinite(reviewStart) && Number.isFinite(verificationStart), 'parallel fixture should spawn review and verification lanes');
  assert(Math.abs(reviewStart - verificationStart) < 45, 'review and verification lanes should start in parallel after implementation');

  const missingFileAdapter = {
    async spawnChildTask({ task, scratchWorkspace }) {
      const result = {
        taskId: task.id,
        status: 'done',
        summary: `${task.id} reports normal completion for missing-file regression.`,
        findings: [{
          claim: `${task.id} regression finding`,
          evidence: ['scripts/test-live-dispatcher.mjs:missing-file-regression'],
          confidence: 'high',
          severity: 'low',
          recommendedAction: 'accept',
        }],
        blockers: [],
        assumptions: [],
      };
      if (task.role === 'implementer') result.changedFiles = [join(scratchWorkspace, 'missing-proof.txt')];
      if (task.id === 'verification') result.toolOutputs = [{ command: 'missing-file verification fixture', exitCode: 0, stdout: 'ok', stderr: '', evidence: 'Regression fixture.' }];
      return result;
    },
  };
  const missingFileRun = await dispatchLiveRun(fullRun, {
    adapter: missingFileAdapter,
    artifactDir: join(dir, 'missing-file-artifacts'),
    scratchWorkspace: join(dir, 'missing-file-artifacts', 'scratch-workspace'),
    timeoutMs: 10_000,
    now: fixtureNow,
    resourceSnapshot: safeResourceSnapshot,
  });
  assert(missingFileRun.childResults.find((result) => result.taskId === 'implementation')?.status === 'failed', 'live full should reject claimed changedFiles missing from scratch workspace');
  assert(missingFileRun.blockers.some((item) => /missing on disk/.test(item.blocker)), 'missing changed file blocker should be persisted');

  const externalChangedFileAdapter = {
    async spawnChildTask({ task }) {
      const result = {
        taskId: task.id,
        status: 'done',
        summary: `${task.id} reports normal completion for external changed-file regression.`,
        findings: [{
          claim: `${task.id} external changed-file regression finding`,
          evidence: ['scripts/test-live-dispatcher.mjs:external-changed-file-regression'],
          confidence: 'high',
          severity: 'low',
          recommendedAction: 'accept',
        }],
        blockers: [],
        assumptions: [],
      };
      if (task.id === 'review') result.changedFiles = ['/tmp/reviewer-claimed-file.txt'];
      if (task.id === 'verification') result.toolOutputs = [{ command: 'external changed-file verification fixture', exitCode: 0, stdout: 'ok', stderr: '', evidence: 'Regression fixture.' }];
      return result;
    },
  };
  const externalChangedFileRun = await dispatchLiveRun(fullRun, {
    adapter: externalChangedFileAdapter,
    artifactDir: join(dir, 'external-changed-file-artifacts'),
    scratchWorkspace: join(dir, 'external-changed-file-artifacts', 'scratch-workspace'),
    timeoutMs: 10_000,
    now: fixtureNow,
    resourceSnapshot: safeResourceSnapshot,
  });
  assert(externalChangedFileRun.childResults.find((result) => result.taskId === 'review')?.status === 'failed', 'live full should reject non-implementer changedFiles');
  assert(externalChangedFileRun.blockers.some((item) => /Non-implementer/.test(item.blocker)), 'non-implementer changed-file blocker should be persisted');

  const symbolicChangedFileAdapter = {
    async spawnChildTask({ task }) {
      const result = {
        taskId: task.id,
        status: 'done',
        summary: `${task.id} reports normal completion for symbolic changed-file regression.`,
        findings: [{
          claim: `${task.id} symbolic changed-file regression finding`,
          evidence: ['scripts/test-live-dispatcher.mjs:symbolic-changed-file-regression'],
          confidence: 'high',
          severity: 'low',
          recommendedAction: 'accept',
        }],
        blockers: [],
        assumptions: [],
      };
      if (task.role === 'implementer') result.changedFiles = ['artifact:implementation:pretend-change'];
      if (task.id === 'verification') result.toolOutputs = [{ command: 'symbolic changed-file verification fixture', exitCode: 0, stdout: 'ok', stderr: '', evidence: 'Regression fixture.' }];
      return result;
    },
  };
  const symbolicChangedFileRun = await dispatchLiveRun(fullRun, {
    adapter: symbolicChangedFileAdapter,
    artifactDir: join(dir, 'symbolic-changed-file-artifacts'),
    scratchWorkspace: join(dir, 'symbolic-changed-file-artifacts', 'scratch-workspace'),
    timeoutMs: 10_000,
    now: fixtureNow,
    resourceSnapshot: safeResourceSnapshot,
  });
  assert(symbolicChangedFileRun.childResults.find((result) => result.taskId === 'implementation')?.status === 'failed', 'live full should reject symbolic implementer changedFiles');
  assert(symbolicChangedFileRun.blockers.some((item) => /absolute materialized path/.test(item.blocker)), 'symbolic changed-file blocker should be persisted');

  let maxLaneRejected = false;
  try {
    await dispatchLiveRun(fullRun, { adapter: fakeAdapter, maxChildLanes: 1, now: fixtureNow });
  } catch (error) {
    maxLaneRejected = /maxChildLanes/.test(error.message);
  }
  assert(maxLaneRejected, 'live dispatcher should enforce maxChildLanes before spawning');

  const timeoutAdapter = {
    async spawnChildTask() {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { taskId: 'never', status: 'done', summary: 'late', findings: [], blockers: [], assumptions: [] };
    },
  };
  const timedOut = await dispatchLiveRun(liteRun, {
    adapter: timeoutAdapter,
    artifactDir: join(dir, 'timeout-artifacts'),
    timeoutMs: 1,
    now: fixtureNow,
    resourceSnapshot: safeResourceSnapshot,
  });
  assert(timedOut.status === 'blocked', 'timed-out live child should block final send');
  assert(timedOut.finalDecision?.sendDecision === 'no-send', 'timed-out live child should no-send');
  assert(timedOut.blockers.some((item) => /exceeded timeout/.test(item.blocker)), 'timeout blocker should be persisted');

  const failingAdapter = {
    async spawnChildTask() {
      throw new Error('fixture adapter failed before result');
    },
  };
  const adapterFailed = await dispatchLiveRun(liteRun, {
    adapter: failingAdapter,
    artifactDir: join(dir, 'adapter-failed-artifacts'),
    timeoutMs: 10_000,
    now: fixtureNow,
    agent: 'news-bot',
    model: 'haiku',
    thinking: 'low',
    resourceSnapshot: safeResourceSnapshot,
  });
  const adapterFailedChild = adapterFailed.childResults[0];
  assert(adapterFailed.status === 'blocked', 'adapter pre-result failure should block final send');
  assert(adapterFailed.finalDecision?.sendDecision === 'no-send', 'adapter pre-result failure should no-send');
  assert(adapterFailed.blockers.some((item) => /agent=news-bot/.test(item.blocker) && /model=haiku/.test(item.blocker) && /thinking=low/.test(item.blocker)), 'adapter failure blocker should preserve requested child dispatch metadata');
  assert(adapterFailedChild?.liveDispatchMetadata?.agent === 'news-bot', 'raw child result should preserve requested agent');
  assert(adapterFailedChild?.liveDispatchMetadata?.model === 'haiku', 'raw child result should preserve requested model');
  assert(adapterFailedChild?.liveDispatchMetadata?.thinking === 'low', 'raw child result should preserve requested thinking');
  const adapterFailedArtifact = adapterFailed.artifacts.find((artifact) => artifact.id === adapterFailedChild.rawArtifact);
  assert(adapterFailedArtifact?.path, 'adapter failure raw artifact path should be persisted');
  const adapterFailedRaw = JSON.parse(readFileSync(adapterFailedArtifact.path, 'utf8'));
  assert(adapterFailedRaw.raw.liveDispatchMetadata.agent === 'news-bot', 'raw artifact should preserve requested agent');
  assert(adapterFailedRaw.raw.liveDispatchMetadata.model === 'haiku', 'raw artifact should preserve requested model');
  assert(adapterFailedRaw.raw.liveDispatchMetadata.thinking === 'low', 'raw artifact should preserve requested thinking');

  const partialPrevious = {
    runId: 'previous-live-run',
    childResults: [
      {
        taskId: liteRun.tasks[0].id,
        status: 'blocked',
        summary: 'Prior adapter route was missing an explicit agent.',
        findings: [],
        blockers: ['Error: Pass --to <E.164>, --session-id, or --agent to choose a session'],
        assumptions: ['Fixture previous blocked result.'],
      },
    ],
  };
  let retrySpawnCount = 0;
  const retryAdapter = {
    async spawnChildTask({ task }) {
      retrySpawnCount += 1;
      return {
        taskId: task.id,
        status: 'done',
        summary: 'Retried child lane succeeded after live adapter recovery.',
        findings: [{
          claim: 'Live retry/resume can respawn a previously blocked lane.',
          evidence: ['scripts/test-live-dispatcher.mjs:retry-resume-fixture'],
          confidence: 'high',
          risk: 'low',
          recommendedAction: 'accept',
          doNotMutate: true,
        }],
        blockers: [],
        assumptions: [],
      };
    },
  };
  const retried = await dispatchLiveRun(liteRun, {
    adapter: retryAdapter,
    previousRun: partialPrevious,
    retryBlockedChildLanes: true,
    artifactDir: join(dir, 'retry-artifacts'),
    timeoutMs: 10_000,
    now: fixtureNow,
    resourceSnapshot: safeResourceSnapshot,
  });
  assert(retried.status === 'completed', `retry/resume expected completed, got ${retried.status}`);
  assert(retrySpawnCount === 1, `retry/resume should respawn only the blocked lane, spawned ${retrySpawnCount}`);
  assert(retried.retryEvents?.some((event) => event.action === 'respawn-child'), 'retry/resume should persist retry event metadata');


  const donePrevious = {
    runId: 'previous-done-live-run',
    childResults: [
      {
        taskId: liteRun.tasks[0].id,
        status: 'done',
        summary: 'Previous done result was produced for a different prompt/context.',
        findings: [{
          id: 'old-finding',
          claim: 'Old context claim should not be reused after prompt drift.',
          evidence: ['old-context'],
          confidence: 'high',
          risk: 'low',
          recommendedAction: 'accept',
          doNotMutate: true,
        }],
        blockers: [],
        assumptions: [],
        livePromptFingerprint: 'old-fingerprint',
      },
    ],
  };
  let driftSpawnCount = 0;
  const driftAdapter = {
    async spawnChildTask({ task }) {
      driftSpawnCount += 1;
      return {
        taskId: task.id,
        status: 'done',
        summary: 'Prompt/context drift forced safe respawn.',
        findings: [{
          claim: 'Live resume refuses stale done results when prompt/context fingerprint differs.',
          evidence: ['scripts/test-live-dispatcher.mjs:prompt-drift-fixture'],
          confidence: 'high',
          risk: 'low',
          recommendedAction: 'accept',
          doNotMutate: true,
        }],
        blockers: [],
        assumptions: [],
      };
    },
  };
  const driftSafe = await dispatchLiveRun(liteRun, {
    adapter: driftAdapter,
    previousRun: donePrevious,
    artifactDir: join(dir, 'drift-artifacts'),
    timeoutMs: 10_000,
    now: fixtureNow,
    contextText: 'changed context excerpt',
    resourceSnapshot: safeResourceSnapshot,
  });
  assert(driftSafe.status === 'completed', `prompt drift resume expected completed, got ${driftSafe.status}`);
  assert(driftSpawnCount === 1, `prompt drift should respawn stale done lane, spawned ${driftSpawnCount}`);
  assert(driftSafe.retryEvents?.some((event) => event.reason === 'prompt-or-context-changed'), 'prompt drift should persist respawn reason');
  assert(driftSafe.childResults[0].livePromptFingerprint, 'live child results should persist prompt fingerprint');

  const wrapperOut = JSON.parse(execFileSync('node', [
    'skills/reef-relay/scripts/runtime-wrapper.mjs',
    '--mode', 'lite',
    '--goal', 'read-only fake live wrapper contract smoke',
    '--dispatcher', 'live',
    '--adapter', 'skills/reef-relay/adapters/fake-live-adapter.mjs',
    '--out-dir', join(dir, 'wrapper-live'),
    '--now', fixtureNow,
    '--disable-resource-guard',
  ], { encoding: 'utf8' }));
  assert(wrapperOut.status === 'completed', `live wrapper expected completed, got ${wrapperOut.status}`);
  const wrapperResult = JSON.parse(readFileSync(join(dir, 'wrapper-live', 'wrapper-result.json'), 'utf8'));
  assert(wrapperResult.dispatcher === 'live', 'wrapper result should record live dispatcher mode');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failed) process.exit(1);
console.log('Live dispatcher contract checks passed');

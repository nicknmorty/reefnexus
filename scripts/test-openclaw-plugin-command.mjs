import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import plugin, { PROGRESS_MESSAGES, buildRuntimeOptions, buildTelegramProgressCommandArgs, nextProgressMessage, parseNativeArgs, summarizeResult } from '../src/openclaw-plugin/index.mjs';

assert.equal(plugin.id, 'reef-relay');
assert.equal(plugin.name, 'ReefRelay');

assert.deepEqual(parseNativeArgs('lite audit docs'), { mode: 'lite', goal: 'audit docs', live: false, requestedMode: 'lite' });
assert.deepEqual(parseNativeArgs('full review implementation'), { mode: 'full', goal: 'review implementation', live: false, requestedMode: 'full' });
assert.deepEqual(parseNativeArgs('live-lite review docs'), { mode: 'lite', goal: 'review docs', live: true, requestedMode: 'live-lite' });
assert.deepEqual(parseNativeArgs('live-full review implementation'), { mode: 'full', goal: 'review implementation', live: true, requestedMode: 'live-full' });
assert.deepEqual(parseNativeArgs('lite --read-only audit docs'), { mode: 'lite', goal: '--read-only audit docs', live: false, requestedMode: 'lite' });
assert.deepEqual(parseNativeArgs('help'), { help: true });
assert.throws(() => parseNativeArgs('reef audit docs'), /expected mode lite, full, live-lite, or live-full/);
assert.throws(() => parseNativeArgs('lite --owner-session other audit docs'), /does not accept downstream option --owner-session/);
assert.throws(() => parseNativeArgs('full --run-pipeline audit docs'), /does not accept downstream option --run-pipeline/);

const liveLiteOptions = buildRuntimeOptions(parseNativeArgs('live-lite review docs'), '2026-05-12T12:34:56.000Z');
assert.equal(liveLiteOptions.mode, 'lite');
assert.equal(liveLiteOptions.dispatcher, 'live');
assert.equal(liveLiteOptions.agent, 'default-agent');
assert.equal(liveLiteOptions.model, undefined);
assert.equal(liveLiteOptions.thinking, undefined);
assert.equal(liveLiteOptions.maxChildLanes, 2);
assert.equal(liveLiteOptions.maxConcurrentChildLanes, 1);
assert.equal(liveLiteOptions.timeoutMs, 300000, 'live-lite should have enough budget for real repo discovery/review work');
assert.ok(liveLiteOptions.adapter.endsWith('skills/reef-relay/adapters/openclaw-cli-live-adapter.mjs'));
assert.ok(liveLiteOptions.outDir.endsWith('runs/native-command-live/2026-05-12T12-34-56-000Z-live-lite/'));
assert.deepEqual(liveLiteOptions.contextFiles, [], 'live commands must not inject stale ReefRelay smoke-doc context into arbitrary goals');

const liveFullOptions = buildRuntimeOptions(parseNativeArgs('live-full review runtime'), '2026-05-12T12:34:56.000Z');
assert.equal(liveFullOptions.mode, 'full');
assert.equal(liveFullOptions.dispatcher, 'live');
assert.equal(liveFullOptions.agent, 'default-agent');
assert.equal(liveFullOptions.model, undefined);
assert.equal(liveFullOptions.thinking, undefined);
assert.equal(liveFullOptions.maxChildLanes, 2);
assert.equal(liveFullOptions.maxConcurrentChildLanes, 1);
assert.equal(liveFullOptions.timeoutMs, 300000);
assert.ok(liveFullOptions.adapter.endsWith('skills/reef-relay/adapters/openclaw-cli-live-adapter.mjs'));
assert.ok(liveFullOptions.outDir.endsWith('runs/native-command-live/2026-05-12T12-34-56-000Z-live-full/'));
assert.deepEqual(liveFullOptions.contextFiles, [], 'live commands must not inject stale ReefRelay smoke-doc context into arbitrary goals');

const progressArgs = buildTelegramProgressCommandArgs({ channel: 'telegram', to: 'telegram:example-target', accountId: 'example-agent', messageThreadId: 123 }, 'progress check');
assert.deepEqual(progressArgs, ['message', 'send', '--channel', 'telegram', '--target', 'example-target', '--message', 'progress check', '--silent', '--json', '--account', 'example-agent', '--thread-id', '123']);
assert.equal(buildTelegramProgressCommandArgs({ channel: 'discord', to: 'discord:abc' }, 'progress check'), null);

const registered = [];
plugin.register({
  registerCommand(command) {
    registered.push(command);
  },
});

assert.equal(registered.length, 1);
const command = registered[0];
assert.equal(command.name, 'reef_relay');
assert.equal(command.acceptsArgs, true);
assert.equal(command.requireAuth, true);
assert.equal(typeof command.handler, 'function');
assert.ok(command.description.includes('ReefRelay'));
assert.equal(typeof Object.getOwnPropertyDescriptor(command.nativeProgressMessages, 'default')?.get, 'function');
const progressStateDir = join(tmpdir(), `reef-progress-${process.pid}`);
const progressStatePath = join(progressStateDir, 'state.json');
rmSync(progressStateDir, { recursive: true, force: true });
const progressSamples = Array.from({ length: 6 }, () => nextProgressMessage({ statePath: progressStatePath }));
assert.deepEqual(progressSamples, [
  PROGRESS_MESSAGES[0],
  PROGRESS_MESSAGES[0],
  PROGRESS_MESSAGES[1],
  PROGRESS_MESSAGES[1],
  PROGRESS_MESSAGES[2],
  PROGRESS_MESSAGES[2],
]);
rmSync(progressStateDir, { recursive: true, force: true });

const help = await command.handler({ args: 'help', channel: 'test', isAuthorizedSender: true, commandBody: '/reef_relay help' });
assert.ok(help.text.includes('Usage: /reef_relay help'));
assert.ok(help.text.includes('/reef_relay lite <goal>'));
assert.ok(help.text.includes('/reef_relay live-full <goal>'));

const invalid = await command.handler({ args: 'unknown goal', channel: 'test', isAuthorizedSender: true, commandBody: '/reef_relay unknown goal' });
assert.ok(invalid.text.includes('expected mode lite, full, live-lite, or live-full'));

const fixedNow = '2026-05-12T12:34:56.000Z';
const outDir = join('runs', 'native-command', `${fixedNow.replace(/[:.]/g, '-')}-lite`);
rmSync(outDir, { recursive: true, force: true });
const realDate = Date;
global.Date = class extends realDate {
  constructor(...args) {
    if (args.length === 0) return new realDate(fixedNow);
    return new realDate(...args);
  }
  static now() {
    return new realDate(fixedNow).getTime();
  }
  static parse(value) {
    return realDate.parse(value);
  }
  static UTC(...args) {
    return realDate.UTC(...args);
  }
};
try {
  const result = await command.handler({ args: 'lite read-only native command smoke', channel: 'test', isAuthorizedSender: true, commandBody: '/reef_relay lite read-only native command smoke' });
  assert.ok(result.text.includes('ReefRelay lite workflow completed successfully.'));
  assert.ok(result.text.includes('Task outcome: completed'));
  assert.ok(result.text.includes('Artifacts: runs/native-command/2026-05-12T12-34-56-000Z-lite'));
  assert.ok(!result.text.includes('Tool output:'), 'native command output should not include raw tool output section by default');
  assert.ok(existsSync(join(outDir, 'final-run.json')));
  assert.ok(existsSync(join(outDir, 'wrapper-summary.md')));
  const wrapperResult = JSON.parse(readFileSync(join(outDir, 'wrapper-result.json'), 'utf8'));
  assert.equal(wrapperResult.dispatcher, 'deterministic');
  assert.equal(wrapperResult.mode, 'lite');
} finally {
  global.Date = realDate;
  rmSync(outDir, { recursive: true, force: true });
}

const summarized = summarizeResult({
  mode: 'lite',
  dispatcher: 'deterministic',
  outDir: '/tmp/reef-out',
  summary: {
    runId: 'raw-tool-output-regression',
    status: 'completed',
    sendDecision: 'send',
    summary: 'Evidence-backed summary.',
    toolEvidence: ['printf raw stdout should remain in artifacts'],
    changedFileEvidence: ['docs/example.md'],
  },
});
assert.ok(summarized.includes('Closeout: pending orchestrator review, commit, and push for 1 reported changed file'), 'native summary should flag changed-file closeout as pending');
assert.ok(summarized.includes('Changed files:'), 'native summary should still include changed files');
assert.ok(!summarized.includes('Tool output:'), 'native summary should omit raw tool output heading');
assert.ok(!summarized.includes('printf raw stdout'), 'native summary should omit raw tool stdout details');

const legacyLiteSummary = summarizeResult({
  mode: 'lite',
  dispatcher: 'live',
  outDir: '/tmp/reef-lite-out',
  run: {
    runId: 'lite-bullet-regression',
    status: 'completed',
    finalSynthesis: {
      whatChangedOrFound: [
        'First lite finding should render as a bullet.',
        'Second lite finding should render as a bullet.',
        'Third lite finding should render as a bullet.',
        'Fourth lite finding should be counted as omitted.',
      ],
    },
  },
  summary: {
    runId: 'lite-bullet-regression',
    status: 'completed',
    sendDecision: 'send',
    summary: 'Lite ReefRelay completed lite-bullet-regression with 4 evidence-backed accepted findings. Highlights: First lite finding should render as a semicolon paragraph.; Second lite finding should render as a semicolon paragraph.; plus 2 more.',
  },
});
assert.ok(legacyLiteSummary.includes('Highlights:\n- First lite finding should render as a bullet.'), 'lite native summary should render highlights as bullets');
assert.ok(legacyLiteSummary.includes('\n- plus 1 more in artifacts'), 'lite native summary should count omitted bullet highlights');
assert.ok(!legacyLiteSummary.includes('Highlights: First lite finding'), 'lite native summary should not keep semicolon-packed highlights');

const fullSummary = summarizeResult({
  mode: 'full',
  dispatcher: 'live',
  outDir: '/tmp/reef-full-out',
  run: {
    runId: 'full-preview-regression',
    status: 'completed',
    finalSynthesis: {
      whatChangedOrFound: [
        'First evidence-backed finding should be visible.',
        'Second evidence-backed finding should be visible.',
        'First evidence-backed finding should be visible.',
        'A very long evidence-backed finding should be shortened because native Telegram output needs a useful preview without dumping the full artifact body into chat. This sentence intentionally keeps going so the preview truncation branch is covered by the regression test and the artifact remains the source of the full report.',
      ],
    },
  },
  summary: {
    runId: 'full-preview-regression',
    status: 'completed',
    sendDecision: 'send',
    summary: 'Full ReefRelay completed with accepted findings.',
  },
});
assert.ok(fullSummary.includes('Highlights:\n- First evidence-backed finding should be visible.'), 'successful full native summary should include bullet highlights');
assert.equal(fullSummary.match(/First evidence-backed finding/g)?.length, 1, 'full findings preview should de-duplicate repeated findings');
assert.ok(fullSummary.includes('(full finding in artifacts)'), 'full findings preview should label shortened long findings');
assert.ok(!fullSummary.includes('Top findings:'), 'full native summary should not duplicate highlighted findings in a second preview section');
assert.ok(!fullSummary.includes('…'), 'full findings preview should not use ellipsis truncation');

console.log('OpenClaw plugin command tests passed');

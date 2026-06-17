import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { promisify } from 'node:util';
import { runRuntimeWrapper } from '../../skills/reef-relay/scripts/runtime-wrapper.mjs';

const execFileAsync = promisify(execFile);
const COMMAND_NAME = 'reef_relay';
const REPO_ROOT = new URL('../..', import.meta.url);
const PROGRESS_STATE_PATH = new URL('../../runs/native-command-live/.progress-message-state.json', import.meta.url).pathname;
const PROGRESS_MESSAGE_REPEAT = 2;
const PROGRESS_MESSAGES = [
  'ReefRelay is deploying divers in the current…',
  'ReefRelay is checking the tides and sending divers down…',
  'ReefRelay is passing signals through the reef…',
  'ReefRelay is sounding the dive bell for live agents…',
  'ReefRelay is following the current with a fresh crew…',
];

function formatUsage() {
  return [
    'Usage: /reef_relay help, /reef_relay lite <goal>, /reef_relay full <goal>, /reef_relay live-lite <goal>, or /reef_relay live-full <goal>',
    '',
    'Default lite/full runs deterministic ReefRelay and writes local artifacts under runs/native-command/.',
    'Trusted beta live-lite/live-full runs bounded live child dispatch and writes artifacts under runs/native-command-live/.',
    'No /reef alias, public rollout, package release, destructive action, or default-on behavior is approved by this command.',
  ].join('\n');
}

function parseNativeArgs(rawArgs) {
  const args = String(rawArgs || '').trim();
  if (!args || args === 'help' || args === '--help' || args === '-h') {
    return { help: true };
  }

  const match = args.match(/^(lite|full|live-lite|live-full)\s+([\s\S]+)$/i);
  if (!match) {
    throw new Error('expected mode lite, full, live-lite, or live-full followed by a goal');
  }

  const requestedMode = match[1].toLowerCase();
  const live = requestedMode.startsWith('live-');
  const mode = requestedMode.endsWith('full') ? 'full' : 'lite';
  const goal = match[2].trim();
  if (!goal) throw new Error('goal is required');

  const unsupportedOptions = nativeGoalOptions(goal).filter((option) => !(mode === 'lite' && option === '--read-only'));
  if (unsupportedOptions.length) {
    throw new Error(`native /reef_relay does not accept downstream option ${unsupportedOptions[0]}; use plain goal text${mode === 'lite' ? ' or --read-only' : ''}`);
  }

  return { mode, goal, live, requestedMode };
}

function nativeGoalOptions(goal) {
  const tokens = [];
  const re = /\"([^\"\\]*(?:\\.[^\"\\]*)*)\"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let match;
  while ((match = re.exec(String(goal || ''))) !== null) {
    const token = (match[1] || match[2] || match[3]).replace(/\\([\"'])/g, '$1');
    if (token.startsWith('--')) tokens.push(token);
  }
  return tokens;
}

function buildOutDir(now, mode, live = false) {
  const stamp = now.replace(/[:.]/g, '-');
  const root = live ? 'native-command-live' : 'native-command';
  const suffix = live ? `live-${mode}` : mode;
  return new URL(`../../runs/${root}/${stamp}-${suffix}/`, import.meta.url).pathname;
}

function displayPath(pathname) {
  const rel = relative(REPO_ROOT.pathname, pathname);
  return rel && !rel.startsWith('..') ? rel : pathname;
}

function telegramTargetFromContext(ctx) {
  const raw = String(ctx?.to || ctx?.from || '').trim();
  if (!raw.startsWith('telegram:')) return null;
  return raw.slice('telegram:'.length);
}

export function buildTelegramProgressCommandArgs(ctx, message) {
  const target = telegramTargetFromContext(ctx);
  if (!target) return null;
  const args = ['message', 'send', '--channel', 'telegram', '--target', target, '--message', message, '--silent', '--json'];
  if (ctx.accountId) args.push('--account', String(ctx.accountId));
  if (ctx.messageThreadId != null) args.push('--thread-id', String(ctx.messageThreadId));
  return args;
}

function createTelegramProgressReporter(ctx, parsed) {
  if (ctx.channel !== 'telegram' || parsed.mode !== 'full') return null;
  const sent = new Set();
  return async (event) => {
    const message = String(event?.message || '').trim();
    if (!message || sent.has(message)) return;
    sent.add(message);
    const args = buildTelegramProgressCommandArgs(ctx, `🪸 ${message}`);
    if (!args) return;
    try {
      await execFileAsync('openclaw', args, { encoding: 'utf8', timeout: 15_000, maxBuffer: 256 * 1024 });
    } catch {
      // Best-effort only: progress visibility must not fail the native command.
    }
  };
}

function compactFindingPreview(items, limit = 5) {
  const seen = new Set();
  const preview = [];
  for (const item of items || []) {
    const text = String(item || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (preview.length < limit) preview.push(chatFindingPreview(text));
  }
  return {
    shown: preview,
    omitted: Math.max(0, seen.size - preview.length),
    total: seen.size,
  };
}

function conciseFindingPreview(items, limit = 5) {
  return compactFindingPreview(items, limit).shown;
}

function chatFindingPreview(text, maxLength = 220) {
  if (text.length <= maxLength) return text;

  const suffix = ' (full finding in artifacts)';
  const budget = Math.max(40, maxLength - suffix.length);
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  let selected = '';
  for (const sentence of sentences) {
    const next = `${selected}${sentence}`.trim();
    if (next.length > budget) break;
    selected = `${selected}${sentence}`;
  }
  if (selected.trim()) return `${selected.trim()}${suffix}`;

  const words = [];
  for (const word of text.split(' ')) {
    const next = [...words, word].join(' ');
    if (next.length > budget) break;
    words.push(word);
  }
  return `${words.join(' ')}${suffix}`.trim();
}

function chatCompletionSummary(result, fallbackSummary) {
  const text = String(fallbackSummary || '').trim();
  if (!text) return 'No summary text was produced.';
  if (/\nHighlights:\n- /.test(text)) return text;

  const findings = result.run?.finalSynthesis?.whatChangedOrFound;
  const status = result.summary?.status || result.run?.status || 'unknown';
  const sendDecision = result.summary?.sendDecision || 'unknown';
  if (status !== 'completed' || sendDecision !== 'send' || !Array.isArray(findings) || findings.length === 0) {
    return text;
  }

  const preview = compactFindingPreview(findings, 3);
  if (!preview.shown.length) return text;

  const base = text.replace(/\s+Highlights:[\s\S]*$/m, '').trim();
  const bullets = preview.shown.map((item) => `- ${item}`);
  if (preview.omitted > 0) bullets.push(`- plus ${preview.omitted} more in artifacts`);
  return `${base}\nHighlights:\n${bullets.join('\n')}`;
}

function summarizeResult(result) {
  const summary = result.summary || {};
  const status = summary.status || result.run?.status || 'unknown';
  const sendDecision = summary.sendDecision || 'unknown';
  const liveLabel = result.dispatcher === 'live' ? ' live' : '';
  const outcomeLine = status === 'completed' && sendDecision === 'send'
    ? `ReefRelay ${result.mode}${liveLabel} workflow completed successfully.`
    : `ReefRelay ${result.mode}${liveLabel} workflow completed with ${status} outcome; requested task NOT completed.`;
  const changedFileEvidenceAll = Array.isArray(summary.changedFileEvidence) ? summary.changedFileEvidence : [];
  const changedFileEvidence = changedFileEvidenceAll.slice(0, 5);
  const changedFilesOmitted = Math.max(0, changedFileEvidenceAll.length - changedFileEvidence.length);
  const closeoutLine = changedFileEvidenceAll.length
    ? `Closeout: pending orchestrator review, commit, and push for ${changedFileEvidenceAll.length} reported changed file${changedFileEvidenceAll.length === 1 ? '' : 's'}`
    : null;
  const completionSummary = chatCompletionSummary(result, summary.summary);
  const findingPreview = status === 'completed' && sendDecision === 'send' && result.mode === 'full' && !/\nHighlights:\n- /.test(completionSummary)
    ? conciseFindingPreview(result.run?.finalSynthesis?.whatChangedOrFound, 5)
    : [];
  return [
    outcomeLine,
    `Workflow status: ${status}`,
    `Send decision: ${sendDecision}`,
    `Task outcome: ${status === 'completed' && sendDecision === 'send' ? 'completed' : 'not completed'}`,
    ...(closeoutLine ? [closeoutLine] : []),
    `Run: ${summary.runId || result.run?.runId || 'unknown'}`,
    `Artifacts: ${displayPath(result.outDir)}`,
    '',
    completionSummary,
    '',
    ...(findingPreview.length ? ['Top findings:', ...findingPreview.map((item) => `- ${item}`), ''] : []),
    ...(changedFileEvidence.length ? ['Changed files:', ...changedFileEvidence.map((item) => `- ${item}`), ...(changedFilesOmitted ? [`- plus ${changedFilesOmitted} more changed file(s) in final-run.json`] : []), ''] : []),
  ].join('\n').trim();
}

function absoluteRepoPath(relativePath) {
  return new URL(`../../${relativePath}`, import.meta.url).pathname;
}

function readProgressCount(statePath = PROGRESS_STATE_PATH) {
  try {
    const parsed = JSON.parse(readFileSync(statePath, 'utf8'));
    return Number.isInteger(parsed.count) && parsed.count >= 0 ? parsed.count : 0;
  } catch {
    return 0;
  }
}

function writeProgressCount(count, statePath = PROGRESS_STATE_PATH) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify({ count }, null, 2)}\n`);
}

function nextProgressMessage({ statePath = PROGRESS_STATE_PATH, persist = true } = {}) {
  const count = readProgressCount(statePath);
  const message = PROGRESS_MESSAGES[Math.floor(count / PROGRESS_MESSAGE_REPEAT) % PROGRESS_MESSAGES.length];
  if (persist) writeProgressCount(count + 1, statePath);
  return message;
}

function createNativeProgressMessages() {
  return Object.defineProperty({}, 'default', {
    enumerable: true,
    get: () => nextProgressMessage(),
  });
}

function buildRuntimeOptions(parsed, now) {
  const live = Boolean(parsed.live);
  const options = {
    mode: parsed.mode,
    goal: parsed.goal,
    outDir: buildOutDir(now, parsed.mode, live),
    dispatcher: live ? 'live' : 'deterministic',
    now,
  };

  if (live) {
    options.adapter = absoluteRepoPath('skills/reef-relay/adapters/openclaw-cli-live-adapter.mjs');
    options.agent = 'default-agent';
    options.timeoutMs = 300000;
    options.maxChildLanes = 2;
    options.maxConcurrentChildLanes = 1;
    // Do not inject ReefRelay smoke-doc context into arbitrary live goals.
    // Live workers should operate from the operator goal plus prior child artifacts,
    // not stale runtime-test docs that can masquerade as task evidence.
    options.contextFiles = [];
  }

  return options;
}

async function handleReefRelayCommand(ctx) {
  let parsed;
  try {
    parsed = parseNativeArgs(ctx.args);
  } catch (error) {
    return { text: `${error.message}\n\n${formatUsage()}` };
  }

  if (parsed.help) return { text: formatUsage() };

  const now = new Date().toISOString();
  try {
    const runtimeOptions = buildRuntimeOptions(parsed, now);
    const progressReporter = createTelegramProgressReporter(ctx, parsed);
    if (progressReporter) runtimeOptions.onProgress = progressReporter;
    const result = await runRuntimeWrapper(runtimeOptions);
    return { text: summarizeResult(result) };
  } catch (error) {
    const liveDetail = parsed.live ? ' Live child dispatch failed closed; inspect the artifact directory if it was created.' : ' No live child dispatch or external send was attempted.';
    return {
      text: `ReefRelay native command failed safely: ${error.message}\n\n${liveDetail}`,
    };
  }
}

const plugin = {
  id: 'reef-relay',
  name: 'ReefRelay',
  description: 'Project-local ReefRelay native command wrapper for OpenClaw.',
  register(api) {
    api.registerCommand({
      name: COMMAND_NAME,
      description: 'Run ReefRelay lite/full orchestration; trusted beta live modes are explicit.',
      acceptsArgs: true,
      requireAuth: true,
      agentPromptGuidance: [
        '/reef_relay lite <goal> and /reef_relay full <goal> run deterministic ReefRelay. /reef_relay live-lite <goal> and /reef_relay live-full <goal> are trusted-beta live dispatch paths for authorized operator testing only.',
      ],
      nativeProgressMessages: createNativeProgressMessages(),
      handler: handleReefRelayCommand,
    });
  },
};

export { PROGRESS_MESSAGES, buildRuntimeOptions, handleReefRelayCommand, nextProgressMessage, parseNativeArgs, summarizeResult };
export default plugin;

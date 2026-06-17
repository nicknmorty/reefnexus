import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_AGENT = process.env.REEFRELAY_LIVE_AGENT || 'default-agent';

export function summarizeExecError(error) {
  const stderr = String(error?.stderr || '').trim();
  const stdout = String(error?.stdout || '').trim();
  const message = String(error?.message || error || 'unknown OpenClaw adapter error');
  const useful = stderr || stdout || message;
  return useful.split('\n').slice(-4).join('\n').slice(0, 1000);
}

function excerpt(value, max = 800) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function extractJsonObject(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('empty OpenClaw child output');
  try {
    return JSON.parse(trimmed);
  } catch {}

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) throw new Error('OpenClaw child output did not contain JSON object');
  return JSON.parse(trimmed.slice(first, last + 1));
}

export function normalizeOpenClawPayload(payload) {
  if (payload && typeof payload === 'object') {
    if (payload.taskId && payload.status) return payload;
    if (Array.isArray(payload.result?.payloads)) {
      for (const item of payload.result.payloads) {
        if (typeof item?.text === 'string') {
          try { return extractJsonObject(item.text); } catch {}
        }
      }
    }
    for (const key of ['result', 'message', 'text', 'output', 'reply']) {
      if (typeof payload[key] === 'string') {
        try { return extractJsonObject(payload[key]); } catch {}
      }
      if (payload[key] && typeof payload[key] === 'object' && payload[key].taskId) return payload[key];
    }
  }
  throw new Error('OpenClaw child output did not match child-result packet shape');
}

export function makeChildSessionId(taskId = 'child') {
  const safeTaskId = String(taskId || 'child').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'child';
  return `reefrelay-${safeTaskId}-${randomUUID()}`;
}

export function buildOpenClawAgentArgs({ prompt, agent = DEFAULT_AGENT, sessionId, model, thinking }) {
  if (!sessionId) throw new Error('OpenClaw live adapter requires an isolated sessionId for every child lane');
  const args = ['agent', '--session-id', sessionId, '--agent', agent, '--message', prompt, '--json'];
  if (model) args.push('--model', model);
  if (thinking) args.push('--thinking', thinking);
  return args;
}

export async function spawnChildTask({ prompt, timeoutMs, agent = DEFAULT_AGENT, task, taskId, model, thinking }) {
  const sessionId = makeChildSessionId(task?.id || taskId);
  const args = buildOpenClawAgentArgs({ prompt, agent, sessionId, model, thinking });
  try {
    const { stdout } = await execFileAsync('openclaw', args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    const payload = extractJsonObject(stdout);
    let packet;
    try {
      packet = normalizeOpenClawPayload(payload);
    } catch (error) {
      throw new Error(`${error.message}; sessionId=${sessionId}; stdout excerpt=${excerpt(stdout)}`);
    }
    return {
      ...packet,
      openclawSessionId: sessionId,
    };
  } catch (error) {
    throw new Error(`openclaw agent child failed for agent ${agent}: ${summarizeExecError(error)}`);
  }
}

export default { spawnChildTask };

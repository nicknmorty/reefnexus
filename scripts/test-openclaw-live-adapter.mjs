import { buildOpenClawAgentArgs, makeChildSessionId, normalizeOpenClawPayload, summarizeExecError } from '../skills/reef-relay/adapters/openclaw-cli-live-adapter.mjs';

let failed = false;
function assert(condition, message) {
  if (!condition) {
    console.error(message);
    failed = true;
  }
}

const packet = normalizeOpenClawPayload({
  runId: 'probe',
  status: 'ok',
  summary: 'completed',
  result: {
    payloads: [
      { text: '{"taskId":"lite-audit","status":"done","summary":"ok","findings":[{"claim":"x","evidence":["e"],"confidence":"high","risk":"low","recommendedAction":"accept","doNotMutate":true}],"blockers":[],"assumptions":[]}' },
    ],
  },
});
assert(packet.taskId === 'lite-audit', 'adapter should unwrap OpenClaw result.payloads[0].text JSON');
assert(packet.status === 'done', 'adapter should preserve child status');

const childSessionId = makeChildSessionId('Verification Lane!');
assert(childSessionId.startsWith('reefrelay-verification-lane-'), 'adapter should create isolated child session ids with task context');
assert(!childSessionId.includes('agent:default-agent:main'), 'adapter must not reuse the main session for live lanes');
const args = buildOpenClawAgentArgs({ prompt: 'probe', agent: 'default-agent', sessionId: childSessionId, model: 'haiku', thinking: 'low' });
assert(args.includes('--session-id'), 'adapter CLI args must include --session-id');
assert(args[args.indexOf('--session-id') + 1] === childSessionId, 'adapter CLI args must pass the isolated child session id');
assert(args.indexOf('--session-id') < args.indexOf('--message'), 'session binding should be set before message payload');
assert(args.includes('--model') && args[args.indexOf('--model') + 1] === 'haiku', 'adapter CLI args should pass model override when supplied');
assert(args.includes('--thinking') && args[args.indexOf('--thinking') + 1] === 'low', 'adapter CLI args should pass thinking override when supplied');

const redacted = summarizeExecError({
  message: 'Command failed: openclaw agent --message HUGE_PROMPT --json',
  stderr: 'Error: Pass --to <E.164>, --session-id, or --agent to choose a session\n',
});
assert(!redacted.includes('HUGE_PROMPT'), 'summarized adapter errors should prefer stderr and avoid leaking prompt text');
assert(redacted.includes('--agent'), 'summarized adapter errors should preserve actionable CLI hint');

if (failed) process.exit(1);
console.log('OpenClaw live adapter normalization checks passed');

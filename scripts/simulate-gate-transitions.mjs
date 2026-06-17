import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const MAX_RETRIES = 2;

function now() {
  return new Date().toISOString();
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function setAllTaskStatus(run, status) {
  run.tasks = run.tasks.map((t) => ({ ...t, status }));
}

function initControl(run) {
  run.taskflow = run.taskflow || {};
  run.taskflow.retries = run.taskflow.retries || 0;
  run.taskflow.maxRetries = run.taskflow.maxRetries || MAX_RETRIES;
  run.blockers = run.blockers || [];
  run.decisions = run.decisions || [];
}

function transition(run, event) {
  const next = clone(run);
  next.updatedAt = now();
  initControl(next);

  switch (event) {
    case 'start':
      if (next.status !== 'queued') throw new Error('start requires queued');
      next.status = 'running';
      next.taskflow.lifecycle = 'running';
      setAllTaskStatus(next, 'running');
      next.decisions.push({ at: next.updatedAt, event: 'start', note: 'Run started' });
      return next;

    case 'block':
      if (next.status !== 'running') throw new Error('block requires running');
      next.status = 'blocked';
      next.taskflow.lifecycle = 'waiting';
      next.gates.safety.result = 'failed';
      next.gates.safety.notes = 'Blocked pending approval or safety clarification';
      next.blockers.push({ at: next.updatedAt, reason: 'safety gate failed or approval missing' });
      next.decisions.push({ at: next.updatedAt, event: 'block', note: 'Run blocked by safety gate' });
      return next;

    case 'fail':
      if (!['running', 'blocked'].includes(next.status)) throw new Error('fail requires running or blocked');
      next.status = 'failed';
      next.taskflow.lifecycle = 'failed';
      next.gates.verification.result = 'failed';
      next.gates.verification.notes = 'Run failed prior to completion';
      setAllTaskStatus(next, 'failed');
      next.decisions.push({ at: next.updatedAt, event: 'fail', note: 'Run marked failed' });
      return next;

    case 'retry':
      if (!['blocked', 'failed'].includes(next.status)) throw new Error('retry requires blocked or failed');
      if ((next.taskflow.retries || 0) >= next.taskflow.maxRetries) {
        throw new Error('retry denied: max retries reached');
      }
      next.taskflow.retries += 1;
      next.status = 'running';
      next.taskflow.lifecycle = 'running';
      next.gates.safety.result = 'pending';
      next.gates.safety.notes = '';
      next.gates.verification.result = 'pending';
      next.gates.verification.notes = '';
      setAllTaskStatus(next, 'running');
      next.decisions.push({ at: next.updatedAt, event: 'retry', note: `Retry attempt ${next.taskflow.retries}` });
      return next;

    case 'complete':
      if (next.status !== 'running') throw new Error('complete requires running');
      next.status = 'completed';
      next.taskflow.lifecycle = 'completed';
      setAllTaskStatus(next, 'done');
      next.gates.safety.result = 'passed';
      next.gates.verification.result = 'passed';
      next.gates.finalAcceptance.result = 'passed';
      next.decisions.push({ at: next.updatedAt, event: 'complete', note: 'Run completed with all gates passed' });
      return next;

    default:
      throw new Error(`unknown event: ${event}`);
  }
}

function simulate(inputPath, outPrefix) {
  const base = JSON.parse(readFileSync(inputPath, 'utf8'));

  const running = transition(base, 'start');
  const blocked = transition(running, 'block');
  const retryFromBlocked = transition(blocked, 'retry');
  const completed = transition(retryFromBlocked, 'complete');

  const failed = transition(running, 'fail');
  const retryFromFailed = transition(failed, 'retry');

  const retryDeniedSource = clone(failed);
  initControl(retryDeniedSource);
  retryDeniedSource.taskflow.retries = retryDeniedSource.taskflow.maxRetries;
  let retryDeniedError = '';
  try {
    transition(retryDeniedSource, 'retry');
  } catch (err) {
    retryDeniedError = String(err.message || err);
  }

  const outputs = {
    running: `${outPrefix}.running.json`,
    blocked: `${outPrefix}.blocked.json`,
    retryFromBlocked: `${outPrefix}.retry-from-blocked.json`,
    completed: `${outPrefix}.completed.json`,
    failed: `${outPrefix}.failed.json`,
    retryFromFailed: `${outPrefix}.retry-from-failed.json`,
    retryDenied: `${outPrefix}.retry-denied.json`,
  };

  for (const out of Object.values(outputs)) mkdirSync(dirname(out), { recursive: true });

  writeFileSync(outputs.running, `${JSON.stringify(running, null, 2)}\n`);
  writeFileSync(outputs.blocked, `${JSON.stringify(blocked, null, 2)}\n`);
  writeFileSync(outputs.retryFromBlocked, `${JSON.stringify(retryFromBlocked, null, 2)}\n`);
  writeFileSync(outputs.completed, `${JSON.stringify(completed, null, 2)}\n`);
  writeFileSync(outputs.failed, `${JSON.stringify(failed, null, 2)}\n`);
  writeFileSync(outputs.retryFromFailed, `${JSON.stringify(retryFromFailed, null, 2)}\n`);
  writeFileSync(outputs.retryDenied, `${JSON.stringify({ status: 'denied', error: retryDeniedError }, null, 2)}\n`);

  return outputs;
}

const args = process.argv.slice(2);
const inIdx = args.indexOf('--in');
const outIdx = args.indexOf('--out-prefix');
if (inIdx === -1 || outIdx === -1 || !args[inIdx + 1] || !args[outIdx + 1]) {
  console.error('usage: node scripts/simulate-gate-transitions.mjs --in <run.json> --out-prefix <path-prefix>');
  process.exit(1);
}

const result = simulate(args[inIdx + 1], args[outIdx + 1]);
console.log(`simulated transitions -> ${Object.values(result).join(', ')}`);

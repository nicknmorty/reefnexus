import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const samplesDir = 'runs/samples';
const simDir = 'runs/simulations';
mkdirSync(simDir, { recursive: true });

const samples = readdirSync(samplesDir).filter((f) => f.endsWith('.json')).sort();
if (samples.length === 0) {
  console.error('no sample runs found in runs/samples');
  process.exit(1);
}

for (const f of samples) {
  const name = f.replace(/\.json$/, '');
  execSync(`node scripts/simulate-gate-transitions.mjs --in ${samplesDir}/${f} --out-prefix ${simDir}/${name}`, { stdio: 'pipe' });

  const running = JSON.parse(readFileSync(`${simDir}/${name}.running.json`, 'utf8'));
  const blocked = JSON.parse(readFileSync(`${simDir}/${name}.blocked.json`, 'utf8'));
  const retryFromBlocked = JSON.parse(readFileSync(`${simDir}/${name}.retry-from-blocked.json`, 'utf8'));
  const completed = JSON.parse(readFileSync(`${simDir}/${name}.completed.json`, 'utf8'));
  const failed = JSON.parse(readFileSync(`${simDir}/${name}.failed.json`, 'utf8'));
  const retryFromFailed = JSON.parse(readFileSync(`${simDir}/${name}.retry-from-failed.json`, 'utf8'));
  const retryDenied = JSON.parse(readFileSync(`${simDir}/${name}.retry-denied.json`, 'utf8'));

  if (running.status !== 'running' || running.taskflow.lifecycle !== 'running') {
    console.error(`${name}: invalid running state`);
    process.exit(1);
  }

  if (blocked.status !== 'blocked' || blocked.taskflow.lifecycle !== 'waiting') {
    console.error(`${name}: invalid blocked state`);
    process.exit(1);
  }
  if (blocked.gates?.safety?.result !== 'failed') {
    console.error(`${name}: blocked state must fail safety gate`);
    process.exit(1);
  }

  if (retryFromBlocked.status !== 'running' || retryFromBlocked.taskflow.lifecycle !== 'running') {
    console.error(`${name}: invalid retry-from-blocked state`);
    process.exit(1);
  }
  if (retryFromBlocked.taskflow.retries !== 1) {
    console.error(`${name}: retry-from-blocked must increment retries to 1`);
    process.exit(1);
  }

  if (failed.status !== 'failed' || failed.taskflow.lifecycle !== 'failed') {
    console.error(`${name}: invalid failed state`);
    process.exit(1);
  }

  if (retryFromFailed.status !== 'running' || retryFromFailed.taskflow.lifecycle !== 'running') {
    console.error(`${name}: invalid retry-from-failed state`);
    process.exit(1);
  }
  if (retryFromFailed.taskflow.retries !== 1) {
    console.error(`${name}: retry-from-failed must increment retries to 1`);
    process.exit(1);
  }

  if (retryDenied.status !== 'denied' || !String(retryDenied.error).includes('max retries reached')) {
    console.error(`${name}: retry-denied must report max retries reached`);
    process.exit(1);
  }

  if (completed.status !== 'completed' || completed.taskflow.lifecycle !== 'completed') {
    console.error(`${name}: invalid completed state`);
    process.exit(1);
  }
  for (const gate of ['safety', 'verification', 'finalAcceptance']) {
    if (completed.gates?.[gate]?.result !== 'passed') {
      console.error(`${name}: completed state must pass ${gate}`);
      process.exit(1);
    }
  }
}

console.log(`Gate transition simulation checks passed (${samples.length} sample runs)`);

// Test/demo-only live adapter. It exercises the live dispatcher contract without
// spawning external OpenClaw sessions.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export async function spawnChildTask({ task, mode, now, scratchWorkspace }) {
  const finding = {
    id: `${task.id}-live-finding-1`,
    claim: `${task.id} completed through the fake live adapter`,
    evidence: [`live-adapter:${task.id}`, `task:${task.id}:objective`],
    confidence: 'high',
    recommendedAction: 'accept',
    observedAt: now,
  };
  if (mode === 'lite') {
    finding.risk = 'low';
    finding.doNotMutate = true;
  } else {
    finding.severity = 'low';
  }

  const result = {
    taskId: task.id,
    status: 'done',
    summary: `Fake live adapter returned a structured result for ${task.id}.`,
    findings: [finding],
    blockers: [],
    assumptions: ['Fake adapter used for live-dispatch contract tests only.'],
  };
  if (task.role === 'implementer' && scratchWorkspace) {
    mkdirSync(scratchWorkspace, { recursive: true });
    const changedFile = join(scratchWorkspace, `${task.id}-artifact.js`);
    writeFileSync(changedFile, `// fake live artifact for ${task.id}\n`);
    result.changedFiles = [changedFile];
  }
  if (task.id === 'verification') {
    result.toolOutputs = [{
      command: 'fake-live verification command',
      exitCode: 0,
      stdout: `fake verification passed for ${task.id}`,
      stderr: '',
      evidence: 'Fake adapter command output exercises toolOutputs plumbing.',
    }];
  }
  return result;
}

export default { spawnChildTask };

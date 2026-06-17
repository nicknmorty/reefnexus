import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateFullBrief } from './reefrelay-full-run-generator.mjs';
import { compile } from './reefrelay-taskflow-stub.mjs';
import { dispatchFullRun } from './reefrelay-full-dispatcher.mjs';
import { finalizeFullRun } from './reefrelay-full-finalizer.mjs';
import { runLiteCommand } from './reefrelay-lite-runtime.mjs';
import { annotateRunMetrics } from './reefrelay-metrics.mjs';

const now = '2026-05-12T23:45:00.000Z';
const outDir = 'runs/phase-4b-metrics';
mkdirSync(join(outDir, 'artifacts'), { recursive: true });

function write(name, run) {
  const annotated = annotateRunMetrics(run, { now });
  writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(annotated, null, 2)}\n`);
}

function compiled(goal, ownerSessionKey) {
  const fullModeGoal = `${goal}: coordinate implementation, review, verification evidence, gates, final synthesis, tests, and docs`;
  return compile(generateFullBrief(fullModeGoal, { ownerSessionKey, now }), { now });
}

const success = finalizeFullRun(dispatchFullRun(compiled('Phase 4B successful metrics fixture', 'session:phase-4b-success'), {
  now,
  artifactDir: join(outDir, 'artifacts', 'success'),
}), { now });
write('successful-run', success);

const blocked = finalizeFullRun(dispatchFullRun(compiled('Phase 4B blocked metrics fixture', 'session:phase-4b-blocked'), {
  scenario: 'phase2-dogfood',
  now,
  artifactDir: join(outDir, 'artifacts', 'blocked'),
}), { now });
write('blocked-no-send-run', blocked);

const failed = dispatchFullRun(compiled('Phase 4B failed metrics fixture', 'session:phase-4b-failed'), {
  now,
  artifactDir: join(outDir, 'artifacts', 'failed'),
  childRunner: (task) => ({
    taskId: task.id,
    status: 'failed',
    summary: 'Deterministic metrics fixture forced a failed child lane.',
    findings: [],
    blockers: ['Forced failure for metrics fixture coverage.'],
    assumptions: [],
  }),
});
write('failed-run', failed);

const noSend = runLiteCommand('/reef_relay lite audit docs for blocked observability behavior', {
  scenario: 'blocked',
  now,
  artifactDir: join(outDir, 'artifacts', 'lite-no-send'),
});
write('lite-no-send-run', noSend);

console.log(`wrote metrics fixtures to ${outDir}`);

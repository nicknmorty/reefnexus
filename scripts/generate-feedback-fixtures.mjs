import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { feedbackArtifact, generateFeedbackFromCoordinationCases, generateFeedbackFromRun } from './reefrelay-feedback.mjs';

const now = '2026-05-12T23:59:00.000Z';
const outDir = 'runs/phase-4c-feedback';
mkdirSync(outDir, { recursive: true });

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function write(name, artifact) {
  writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
}

const runFixtures = [
  ['blocked-no-send-feedback', 'runs/phase-4b-metrics/blocked-no-send-run.json'],
  ['failed-run-feedback', 'runs/phase-4b-metrics/failed-run.json'],
  ['lite-no-send-feedback', 'runs/phase-4b-metrics/lite-no-send-run.json'],
];

for (const [name, path] of runFixtures) {
  const events = generateFeedbackFromRun(readJson(path), { now, sourcePath: path });
  write(name, feedbackArtifact(events, { now, source: { type: 'run', path } }));
}

const casesPath = 'specs/coordination-failure-cases.json';
const coordinationEvents = generateFeedbackFromCoordinationCases(readJson(casesPath), { now, sourcePath: casesPath });
write('coordination-failure-feedback', feedbackArtifact(coordinationEvents, { now, source: { type: 'coordination-cases', path: casesPath } }));

console.log(`wrote feedback fixtures to ${outDir}`);

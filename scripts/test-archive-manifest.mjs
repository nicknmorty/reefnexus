import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { attachArchiveManifest, validateArchiveManifest } from './reefrelay-archive-manifest.mjs';

const fixtureNow = '2026-05-12T23:00:00.000Z';

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function expectValidationFailure(name, manifest, expected) {
  try {
    validateArchiveManifest(manifest);
    fail(`${name}: expected validation failure`);
  } catch (err) {
    if (!String(err.message).includes(expected)) fail(`${name}: expected ${expected}, got ${err.message}`);
  }
}

const run = JSON.parse(readFileSync('runs/phase-4/lite-runtime-run.json', 'utf8'));
const manifest = {
  schemaVersion: 'reefrelay-archive-manifest@0.1.0',
  id: 'phase-4-cleanup-sample',
  runId: run.runId,
  createdAt: fixtureNow,
  entries: [
    {
      id: 'archive-roadmap-draft',
      source: 'docs/ROADMAP.md',
      archive: 'runs/phase-4/archive/docs/ROADMAP.before-lite-runtime.md',
      action: 'copied',
      reason: 'Preserve roadmap state before mutation-heavy hardening follow-up.',
      producerTaskId: 'orchestrator',
      checksum: 'sha256:fixture',
    },
    {
      id: 'quarantine-stale-note',
      source: 'memory/daily/example-stale.md',
      archive: 'memory/archive/example-stale.md',
      action: 'quarantined',
      reason: 'Example cleanup candidate for archive-manifest schema coverage.',
      producerTaskId: 'orchestrator',
    },
  ],
};

validateArchiveManifest(manifest);
const attached = attachArchiveManifest(run, manifest, { manifestPath: 'runs/phase-4/archive-manifest.json', now: fixtureNow });
assert(attached.archiveManifests?.length === 1, 'run should contain archiveManifests summary');
assert(attached.archiveManifests[0].entryCount === 2, 'archive manifest summary should preserve entry count');
assert(attached.archiveManifests[0].sourcePaths.includes('docs/ROADMAP.md'), 'archive manifest summary should preserve source path');
assert(attached.artifacts.some((artifact) => artifact.type === 'archive-manifest'), 'archive manifest should be first-class artifact');
assert(attached.decisions.some((decision) => decision.reason.includes('Archive manifest validated')), 'attach decision should be recorded');

expectValidationFailure('bad-schema', { ...manifest, schemaVersion: 'bad' }, 'schemaVersion');
expectValidationFailure('empty-entries', { ...manifest, entries: [] }, 'entries must be a non-empty array');
expectValidationFailure('duplicate-entry', { ...manifest, entries: [manifest.entries[0], { ...manifest.entries[0] }] }, 'duplicate archive manifest entry id');
expectValidationFailure('missing-archive', { ...manifest, entries: [{ ...manifest.entries[0], action: 'moved', archive: '' }] }, 'archive must be a non-empty string');
expectValidationFailure('same-source-archive', { ...manifest, entries: [{ ...manifest.entries[0], archive: manifest.entries[0].source }] }, 'archive must differ from source');
expectValidationFailure('bad-action', { ...manifest, entries: [{ ...manifest.entries[0], action: 'teleported' }] }, 'action must be one of');

try {
  attachArchiveManifest({ ...run, runId: 'different-run' }, manifest, { now: fixtureNow });
  fail('run-id-mismatch: expected attach failure');
} catch (err) {
  if (!String(err.message).includes('does not match run')) fail(`run-id-mismatch: unexpected error ${err.message}`);
}

const dir = mkdtempSync(join(tmpdir(), 'reef-archive-manifest-'));
try {
  const runPath = join(dir, 'run.json');
  const manifestPath = join(dir, 'manifest.json');
  const outPath = join(dir, 'attached-run.json');
  writeFileSync(runPath, `${JSON.stringify(run, null, 2)}\n`);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  execFileSync('node', [
    'scripts/reefrelay-archive-manifest.mjs',
    '--run', runPath,
    '--manifest', manifestPath,
    '--out', outPath,
    '--now', fixtureNow,
  ], { stdio: 'pipe' });
  const cliRun = JSON.parse(readFileSync(outPath, 'utf8'));
  assert(cliRun.artifacts.some((artifact) => artifact.type === 'archive-manifest'), 'CLI attach should add archive-manifest artifact');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (process.exitCode) process.exit(process.exitCode);
console.log('Archive manifest checks passed');

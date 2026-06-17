import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPcOffloadSmoke } from './reefrelay-pc-offload-smoke.mjs';

const fixtureNow = '2026-06-02T20:32:00.000Z';
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const dir = mkdtempSync(join(tmpdir(), 'reef-pc-offload-smoke-'));
try {
  const result = runPcOffloadSmoke({
    mode: 'dry-run',
    outDir: join(dir, 'smoke'),
    now: fixtureNow,
    manifests: [
      'specs/pc-offload-manifests/rg-files-structure.json',
    ],
  });

  assert(result.ok === true, 'dry-run smoke should complete');
  assert(result.mode === 'dry-run', 'dry-run smoke should preserve mode');
  assert(result.manifestCount === 1, 'test fixture should run one manifest');
  assert(result.acceptedCount === 1, 'dry-run manifest should be accepted by local gate');

  const finalRun = JSON.parse(readFileSync(join(dir, 'smoke', 'final-run.json'), 'utf8'));
  assert(finalRun.authorityBoundary.piOwnsFinalAcceptance === true, 'final run should preserve Pi final-acceptance ownership');
  assert(finalRun.authorityBoundary.pcChildLaneEnabled === false, 'smoke must not enable PC child/diver lane');
  assert(finalRun.authorityBoundary.noSecretTransferRequested === true, 'smoke must not request secret transfer');
  assert(finalRun.offloadResults[0].family === 'rg-files', 'summary should preserve manifest family');
  assert(finalRun.offloadResults[0].ledgerPath === null, 'dry-run should not ledger real PC execution');

  const synthesis = readFileSync(join(dir, 'smoke', 'final-synthesis.md'), 'utf8');
  assert(synthesis.includes('No PC child/diver lane was enabled.'), 'synthesis should state the diver boundary');
  assert(synthesis.includes('ReefRelay exercised the approved PC read/test/diagnostic offload lane'), 'synthesis should explain what was exercised');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failed) process.exit(1);
console.log('PC offload smoke checks passed');

#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = resolve(import.meta.dirname, '..');
const defaultOffloadRoot = '/path/to/openclaw-pc-node';
const defaultManifestRoot = join(defaultOffloadRoot, 'docs/examples/auto-safe-manifests/external/reefnexus');
const defaultManifests = [
  'rg-files-structure.json',
  'rg-content-spawn-child-task.json',
  'rg-content-max-concurrent.json',
  'lint-typecheck-live-path.json',
  'node-test-live-dispatcher.json',
  'diagnostic-bundle-live-readiness.json',
];

function usage(exitCode = 1) {
  const text = `Usage:
  node scripts/reefrelay-pc-offload-smoke.mjs [--dry-run|--real] --out-dir <dir>

Options:
  --dry-run                  Review packets only. Default.
  --real                     Execute through the approved PC auto-safe lane.
  --out-dir <dir>            Artifact directory. Defaults to runs/pc-offload-smoke/<timestamp>.
  --offload-root <path>      openclaw-pc-node checkout. Defaults to ${defaultOffloadRoot}.
  --manifest <path>          Manifest to run. Repeatable; defaults to the ReefNexus canary set.
  --now <iso>                Stable timestamp for tests.
`;
  (exitCode === 0 ? console.log : console.error)(text.trim());
  process.exit(exitCode);
}

function parseArgs(argv) {
  const options = {
    mode: 'dry-run',
    outDir: null,
    offloadRoot: defaultOffloadRoot,
    manifests: [],
    now: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.mode = 'dry-run';
    else if (arg === '--real') options.mode = 'real';
    else if (arg === '--out-dir') options.outDir = argv[++i];
    else if (arg === '--offload-root') options.offloadRoot = argv[++i];
    else if (arg === '--manifest') options.manifests.push(argv[++i]);
    else if (arg === '--now') options.now = argv[++i];
    else if (arg === '--help' || arg === '-h') usage(0);
    else throw new Error(`unsupported option ${arg}`);
  }

  return options;
}

function stableStamp(now) {
  return now.replace(/[-:.TZ]/g, '').slice(0, 14);
}

function safeReadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function runOffloadManifest({ offloadRoot, manifestPath, real }) {
  if (!real) {
    const manifest = safeReadJson(manifestPath);
    const family = manifest.command?.family || '(unknown)';
    const command = manifest.command?.argv || manifest.commands?.[0]?.command || ['(dry-run)'];
    const summary = {
      ok: true,
      mode: 'dry-run',
      dryRun: {
        taskId: manifest.taskId || manifest.id || 'pc-offload-dry-run',
        preflight: { family },
        packet: {
          commands: [{ command }],
        },
      },
    };
    return {
      manifestPath,
      command: `dry-run ${manifestPath}`,
      cwd: offloadRoot,
      exitCode: 0,
      stdout: JSON.stringify(summary),
      stderr: '',
      summary,
    };
  }

  const args = [
    'scripts/run-controlled-offload.mjs',
    '--manifest',
    manifestPath,
    real ? '--real' : '--dry-run',
  ];
  const run = spawnSync(process.execPath, args, {
    cwd: offloadRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  let parsed = null;
  try {
    parsed = JSON.parse(run.stdout || '{}');
  } catch {}
  return {
    manifestPath,
    command: `${process.execPath} ${args.join(' ')}`,
    cwd: offloadRoot,
    exitCode: run.status ?? 1,
    stdout: (run.stdout || '').slice(0, 4000),
    stderr: (run.stderr || '').slice(0, 4000),
    summary: parsed,
  };
}

function manifestPaths(options) {
  if (options.manifests.length) return options.manifests.map((entry) => resolve(entry));
  return defaultManifests.map((entry) => join(defaultManifestRoot, entry));
}

function summarizeResult(result) {
  const summary = result.summary || {};
  const realRun = summary.realRun || {};
  return {
    manifest: relative(repoRoot, result.manifestPath).startsWith('..')
      ? result.manifestPath
      : relative(repoRoot, result.manifestPath),
    ok: summary.ok === true && result.exitCode === 0,
    mode: summary.mode || null,
    taskId: realRun.taskId || summary.dryRun?.taskId || null,
    family: summary.dryRun?.preflight?.family || safeReadManifestFamily(result.manifestPath),
    command: realRun.command || summary.dryRun?.packet?.commands?.[0]?.command?.join(' ') || null,
    workerSummary: realRun.workerSummary || null,
    ledgerPath: realRun.ledgerPath || null,
    failures: summary.failures || realRun.failures || [],
  };
}

function safeReadManifestFamily(manifestPath) {
  try {
    return safeReadJson(manifestPath).command?.family || '(unknown)';
  } catch {
    return '(unknown)';
  }
}

function finalSynthesis(run) {
  const accepted = run.offloadResults.filter((entry) => entry.ok);
  const failed = run.offloadResults.filter((entry) => !entry.ok);
  return [
    `# ReefRelay PC Offload Smoke`,
    '',
    `Run: ${run.runId}`,
    `Mode: ${run.mode}`,
    `Status: ${run.status}`,
    `Send decision: ${run.finalDecision.sendDecision}`,
    '',
    '## Summary',
    failed.length === 0
      ? `ReefRelay exercised the approved PC read/test/diagnostic offload lane for ${accepted.length} ReefNexus manifest(s).`
      : `ReefRelay PC offload smoke found ${failed.length} failed manifest(s) out of ${run.offloadResults.length}.`,
    '',
    '## Evidence',
    ...run.offloadResults.map((entry) => `- ${entry.ok ? 'accepted' : 'failed'}: ${entry.family} ${entry.command || entry.manifest}`),
    '',
    '## Boundary',
    '- No PC child/diver lane was enabled.',
    '- PC output is evidence only; Pi/ReefRelay owns final acceptance.',
    '- No secrets, home, memory, config, package installs, or repo mutation were requested.',
    '',
  ].join('\n');
}

export function runPcOffloadSmoke(options = {}) {
  const now = options.now || new Date().toISOString();
  const outDir = resolve(options.outDir || join(repoRoot, 'runs', 'pc-offload-smoke', stableStamp(now)));
  const offloadRoot = resolve(options.offloadRoot || defaultOffloadRoot);
  const real = options.mode === 'real';
  const manifests = manifestPaths({ ...options, offloadRoot });

  mkdirSync(outDir, { recursive: true });
  const rawDir = join(outDir, 'artifacts');
  mkdirSync(rawDir, { recursive: true });

  const rawResults = manifests.map((manifestPath, index) => {
    const result = runOffloadManifest({ offloadRoot, manifestPath, real });
    const rawPath = join(rawDir, `offload-${String(index + 1).padStart(2, '0')}.json`);
    writeFileSync(rawPath, `${JSON.stringify(result, null, 2)}\n`);
    return { ...result, rawArtifact: rawPath };
  });

  const offloadResults = rawResults.map(summarizeResult);
  const failed = offloadResults.filter((entry) => !entry.ok);
  const run = {
    schemaVersion: 'reefrelay-pc-offload-smoke@0.1.0',
    runId: `reefrelay-pc-offload-smoke-${real ? 'real' : 'dry'}-${stableStamp(now)}`,
    createdAt: now,
    mode: real ? 'real' : 'dry-run',
    status: failed.length === 0 ? 'completed' : 'blocked',
    dispatcher: 'pc-auto-safe-manifest',
    authorityBoundary: {
      piOwnsFinalAcceptance: true,
      pcOutputIsEvidenceOnly: true,
      pcChildLaneEnabled: false,
      noRepoMutationRequested: true,
      noSecretTransferRequested: true,
    },
    offloadRoot,
    manifests,
    offloadResults,
    artifacts: rawResults.map((entry) => ({
      type: 'offload-result',
      path: entry.rawArtifact,
      manifestPath: entry.manifestPath,
    })),
    finalDecision: {
      sendDecision: failed.length === 0 ? 'send' : 'no-send',
      reason: failed.length === 0
        ? 'All approved read/test/diagnostic offload manifests completed and were accepted by their local gate.'
        : 'One or more approved offload manifests failed; do not treat this smoke as accepted.',
    },
  };

  writeFileSync(join(outDir, 'final-run.json'), `${JSON.stringify(run, null, 2)}\n`);
  writeFileSync(join(outDir, 'final-synthesis.md'), finalSynthesis(run));
  writeFileSync(join(outDir, 'wrapper-summary.md'), finalSynthesis(run));
  writeFileSync(join(outDir, 'wrapper-result.json'), `${JSON.stringify({
    ok: run.status === 'completed',
    runId: run.runId,
    mode: run.mode,
    status: run.status,
    sendDecision: run.finalDecision.sendDecision,
    outDir,
    finalRunPath: join(outDir, 'final-run.json'),
    summaryPath: join(outDir, 'wrapper-summary.md'),
  }, null, 2)}\n`);

  return {
    ok: run.status === 'completed',
    runId: run.runId,
    mode: run.mode,
    status: run.status,
    sendDecision: run.finalDecision.sendDecision,
    outDir,
    manifestCount: manifests.length,
    acceptedCount: offloadResults.filter((entry) => entry.ok).length,
    failedCount: failed.length,
  };
}

async function main() {
  const result = runPcOffloadSmoke(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exit(1);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();

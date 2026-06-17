import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const manifestSchema = 'reefrelay-archive-manifest@0.1.0';
const artifactType = 'archive-manifest';
const actions = new Set(['copied', 'moved', 'rewritten', 'quarantined', 'deleted']);

function parseArgs(argv) {
  const args = { run: null, manifest: null, out: null, now: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--run') args.run = argv[++i];
    else if (argv[i] === '--manifest') args.manifest = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--now') args.now = argv[++i];
  }
  if (!args.run || !args.manifest || !args.out) {
    console.error('usage: node scripts/reefrelay-archive-manifest.mjs --run <run.json> --manifest <manifest.json> --out <run.json> [--now <iso>]');
    process.exit(1);
  }
  return args;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slug(input) {
  return String(input || 'archive-manifest')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72) || 'archive-manifest';
}

function requireString(value, path) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path} must be a non-empty string`);
}

export function validateArchiveManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('archive manifest must be an object');
  if (manifest.schemaVersion !== manifestSchema) throw new Error(`archive manifest schemaVersion must be ${manifestSchema}`);
  requireString(manifest.runId, 'manifest.runId');
  requireString(manifest.createdAt, 'manifest.createdAt');
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) throw new Error('archive manifest entries must be a non-empty array');

  const seenIds = new Set();
  for (let i = 0; i < manifest.entries.length; i++) {
    const entry = manifest.entries[i];
    const prefix = `manifest.entries[${i}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${prefix} must be an object`);
    requireString(entry.id, `${prefix}.id`);
    if (seenIds.has(entry.id)) throw new Error(`duplicate archive manifest entry id ${entry.id}`);
    seenIds.add(entry.id);
    requireString(entry.source, `${prefix}.source`);
    requireString(entry.action, `${prefix}.action`);
    if (!actions.has(entry.action)) throw new Error(`${prefix}.action must be one of ${[...actions].join('|')}`);
    if (entry.action !== 'deleted') requireString(entry.archive, `${prefix}.archive`);
    if (entry.archive !== undefined && entry.archive !== null && entry.archive !== '') {
      requireString(entry.archive, `${prefix}.archive`);
      if (entry.source === entry.archive) throw new Error(`${prefix}.archive must differ from source`);
    }
    requireString(entry.reason, `${prefix}.reason`);
    requireString(entry.producerTaskId, `${prefix}.producerTaskId`);
    if (entry.checksum !== undefined && (typeof entry.checksum !== 'string' || entry.checksum.trim() === '')) {
      throw new Error(`${prefix}.checksum must be a non-empty string when present`);
    }
  }

  return manifest;
}

function ensureRun(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) throw new Error('run must be an object');
  requireString(run.runId, 'run.runId');
  if (!['lite', 'full'].includes(run.mode)) throw new Error('archive manifest can attach only to lite or full runs');
  if (!Array.isArray(run.artifacts)) run.artifacts = [];
}

export function attachArchiveManifest(inputRun, manifest, options = {}) {
  const run = clone(inputRun);
  ensureRun(run);
  validateArchiveManifest(manifest);
  if (manifest.runId !== run.runId) throw new Error(`archive manifest runId ${manifest.runId} does not match run ${run.runId}`);

  const now = options.now || new Date().toISOString();
  const artifactId = `archive-manifest-${slug(manifest.id || manifest.runId)}`;
  if (run.artifacts.some((artifact) => artifact.id === artifactId)) throw new Error(`artifact id already exists: ${artifactId}`);

  const producerTaskIds = [...new Set(manifest.entries.map((entry) => entry.producerTaskId))];
  const artifact = {
    id: artifactId,
    type: artifactType,
    path: options.manifestPath || manifest.path || `artifact:${artifactId}`,
    producerTaskId: producerTaskIds.length === 1 ? producerTaskIds[0] : 'orchestrator',
    createdAt: now,
    entryCount: manifest.entries.length,
  };

  run.artifacts.push(artifact);
  run.archiveManifests = [
    ...(Array.isArray(run.archiveManifests) ? run.archiveManifests : []),
    {
      artifactId,
      schemaVersion: manifest.schemaVersion,
      runId: manifest.runId,
      createdAt: manifest.createdAt,
      entryCount: manifest.entries.length,
      actions: [...new Set(manifest.entries.map((entry) => entry.action))].sort(),
      sourcePaths: manifest.entries.map((entry) => entry.source),
      archivePaths: manifest.entries.map((entry) => entry.archive).filter(Boolean),
    },
  ];
  run.decisions = [
    ...(Array.isArray(run.decisions) ? run.decisions : []),
    {
      id: `attach-${artifactId}`,
      decision: 'accepted',
      reason: 'Archive manifest validated and attached as first-class run artifact.',
      timestamp: now,
      artifactId,
    },
  ];
  run.updatedAt = now;
  return run;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv);
  const runPath = resolve(args.run);
  const manifestPath = resolve(args.manifest);
  const outPath = resolve(args.out);
  const run = JSON.parse(readFileSync(runPath, 'utf8'));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const nextRun = attachArchiveManifest(run, manifest, { manifestPath: args.manifest, now: args.now });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(nextRun, null, 2)}\n`);
  console.log(`attached archive manifest ${manifestPath} -> ${outPath}`);
}

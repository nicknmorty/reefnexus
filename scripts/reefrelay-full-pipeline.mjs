import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { generateFullBrief } from './reefrelay-full-run-generator.mjs';
import { compile } from './reefrelay-taskflow-stub.mjs';
import { dispatchFullRun } from './reefrelay-full-dispatcher.mjs';
import { finalizeFullRun } from './reefrelay-full-finalizer.mjs';

function parseArgs(argv) {
  const args = { input: null, outDir: null, ownerSessionKey: 'current', scenario: 'default', now: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--file') args.input = readFileSync(argv[++i], 'utf8');
    else if (argv[i] === '--out-dir') args.outDir = argv[++i];
    else if (argv[i] === '--owner-session') args.ownerSessionKey = argv[++i];
    else if (argv[i] === '--scenario') args.scenario = argv[++i];
    else if (argv[i] === '--now') args.now = argv[++i];
  }
  if (!args.input || !args.outDir) {
    console.error('usage: node scripts/reefrelay-full-pipeline.mjs --input "<request>" --out-dir <dir> [--owner-session current] [--scenario default|phase2-dogfood] [--now <iso>]');
    process.exit(1);
  }
  return args;
}

export function runFullPipeline(request, options = {}) {
  const now = options.now || new Date().toISOString();
  const brief = generateFullBrief(request.trim(), { ownerSessionKey: options.ownerSessionKey || 'current', now });
  const generatedRun = compile(brief, { now });
  const dispatchedRun = dispatchFullRun(generatedRun, {
    scenario: options.scenario || 'default',
    artifactDir: options.artifactDir,
    now,
  });
  const finalizedRun = finalizeFullRun(dispatchedRun, {
    synthesisOut: options.synthesisOut,
    now,
  });
  return { brief, generatedRun, dispatchedRun, finalizedRun };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv);
  const outDir = resolve(args.outDir);
  mkdirSync(outDir, { recursive: true });
  const artifactDir = join(outDir, 'artifacts');
  const synthesisOut = join(outDir, 'final-synthesis.md');
  const result = runFullPipeline(args.input, {
    ownerSessionKey: args.ownerSessionKey,
    scenario: args.scenario,
    artifactDir,
    synthesisOut,
    now: args.now,
  });
  const outputs = {
    brief: join(outDir, 'brief.json'),
    generatedRun: join(outDir, 'generated-run.json'),
    dispatchedRun: join(outDir, 'dispatched-run.json'),
    finalizedRun: join(outDir, 'final-run.json'),
  };
  writeFileSync(outputs.brief, `${JSON.stringify(result.brief, null, 2)}\n`);
  writeFileSync(outputs.generatedRun, `${JSON.stringify(result.generatedRun, null, 2)}\n`);
  writeFileSync(outputs.dispatchedRun, `${JSON.stringify(result.dispatchedRun, null, 2)}\n`);
  writeFileSync(outputs.finalizedRun, `${JSON.stringify(result.finalizedRun, null, 2)}\n`);
  console.log(`ran full ReefRelay pipeline -> ${outDir}`);
}

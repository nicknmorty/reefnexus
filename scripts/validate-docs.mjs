import { existsSync, readFileSync } from 'node:fs';

const required = [
  'README.md',
  'PROJECT_STATUS.md',
  'docs/VISION.md',
  'docs/SCOPE.md',
  'docs/ARCHITECTURE.md',
  'docs/ROADMAP.md',
  'docs/NAMING.md',
  'docs/SPECIALIZED_AGENTS.md',
  'docs/OPERATING_MODEL_LEARNINGS.md',
  'docs/REEFRELAY_RUNBOOK.md',
  'docs/RUNTIME_READY.md',
  'docs/BETA_REVIEW.md',
  'docs/NATIVE_COMMAND.md',
  'docs/EXTERNAL_REPO_LEARNINGS.md',
  'docs/SUPERVISOR_MODE.md',
  'docs/FALLBACK_MATRIX.md',
  'docs/STATE_SCHEMA.md',
  'docs/TASKFLOW_BINDING.md',
  'docs/WORKFLOW_RECIPE_TASKFLOW.md',
  'docs/TASK_CONTRACT_TEMPLATES.md',
  'docs/HANDOFF_SCHEMA_EXAMPLES.md',
  'docs/ACCEPTANCE_GATE_TEMPLATES.md',
  'docs/DIAGRAMS.md',
  'docs/WORKFLOW_RECIPE_INCIDENT_TRIAGE.md',
  'docs/WORKFLOW_RECIPE_SENSITIVE_CHANGE.md',
  'docs/WORKFLOW_RECIPE_CODE_REVIEW_TEST.md',
  'docs/WORKFLOW_RECIPE_RESEARCH_HEAVY.md',
  'docs/WORKFLOW_RECIPE_LITE.md',
  'docs/SLASH_COMMANDS.md',
  'docs/runbooks/README.md',
  'docs/runbooks/project-standard.md',
  'skills/reef-relay/SKILL.md',
  'openclaw.plugin.json',
  'src/openclaw-plugin/index.mjs',
  'openclaw-runtime-plugin/package.json',
  'openclaw-runtime-plugin/openclaw.plugin.json',
  'openclaw-runtime-plugin/index.mjs',
];

let failed = false;
for (const file of required) {
  if (!existsSync(file)) {
    console.error(`missing required file: ${file}`);
    failed = true;
    continue;
  }
  const text = readFileSync(file, 'utf8');
  if (!text.trim()) {
    console.error(`empty required file: ${file}`);
    failed = true;
  }
}

const readme = readFileSync('README.md', 'utf8');
for (const term of ['ReefNexus', 'ReefRelay', 'Clawstro']) {
  if (!readme.includes(term)) {
    console.error(`README missing naming term: ${term}`);
    failed = true;
  }
}

const projectRunbook = readFileSync('docs/runbooks/project-standard.md', 'utf8');
for (const term of [
  'Hands-off does not mean permissionless',
  'Docs run supreme',
  'Subagents execute bounded lanes',
  'MVP',
  'GitHub issue / PR policy',
]) {
  if (!projectRunbook.includes(term)) {
    console.error(`project runbook missing required authority phrase: ${term}`);
    failed = true;
  }
}

const operatorRunbook = readFileSync('docs/REEFRELAY_RUNBOOK.md', 'utf8');
if (!operatorRunbook.includes('docs/runbooks/project-standard.md')) {
  console.error('ReefRelay operator runbook must link project orchestration to docs/runbooks/project-standard.md');
  failed = true;
}

const runtimeReady = readFileSync('docs/RUNTIME_READY.md', 'utf8');
for (const term of [
  'runtime-ready MVP',
  'Production-readiness checklist',
  'operator approval starts production-readiness',
  'trusted operator beta feedback',
  'V2',
  'known limits',
]) {
  if (!runtimeReady.toLowerCase().includes(term.toLowerCase())) {
    console.error(`runtime-ready doc missing required closeout phrase: ${term}`);
    failed = true;
  }
}

const betaReview = readFileSync('docs/BETA_REVIEW.md', 'utf8');
for (const term of [
  'V1 beta',
  'trusted operators have collaborator pull/view access',
  'trusted operator feedback is required',
  'V2 is the first public-eligible track',
  'Public transition',
]) {
  if (!betaReview.toLowerCase().includes(term.toLowerCase())) {
    console.error(`beta review doc missing required phrase: ${term}`);
    failed = true;
  }
}

const nativeCommand = readFileSync('docs/NATIVE_COMMAND.md', 'utf8');
for (const term of [
  'api.registerCommand',
  '/reef_relay lite <goal>',
  'No `/reef` alias is claimed',
  'openclaw-runtime-plugin',
  'requireAuth: true',
]) {
  if (!nativeCommand.toLowerCase().includes(term.toLowerCase())) {
    console.error(`native command doc missing required phrase: ${term}`);
    failed = true;
  }
}

const manifest = JSON.parse(readFileSync('openclaw.plugin.json', 'utf8'));
if (manifest.id !== 'reef-relay') {
  console.error('plugin manifest id must be reef-relay');
  failed = true;
}
if (!manifest.commandAliases?.some((entry) => entry.name === 'reef_relay' && entry.kind === 'runtime-slash')) {
  console.error('plugin manifest must declare reef_relay runtime-slash command alias');
  failed = true;
}

if (failed) process.exit(1);
console.log('ReefNexus docs validation passed');

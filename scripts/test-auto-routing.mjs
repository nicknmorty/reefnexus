import { readFileSync } from 'node:fs';
import { route } from './reefrelay-auto-router.mjs';

const validMode = new Set(['direct', 'lite', 'full']);
const validRisk = new Set(['normal', 'sensitive', 'destructive', 'security', 'config', 'public']);
const validBehavior = new Set(['proceed', 'clarify', 'clarify_or_escalate', 'block_and_escalate']);
const risky = new Set(['sensitive', 'destructive', 'security', 'config', 'public']);
const cases = JSON.parse(readFileSync('specs/auto-routing-cases.json', 'utf8'));
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

if (!Array.isArray(cases) || cases.length === 0) fail('auto routing cases missing/empty');

for (const c of cases) {
  for (const key of ['id', 'input', 'expectedMode', 'expectedRiskClass', 'expectedBehavior']) {
    if (!c[key]) fail(`case ${c.id || '<unknown>'} missing ${key}`);
  }
  if (!validMode.has(c.expectedMode)) fail(`case ${c.id}: invalid expectedMode ${c.expectedMode}`);
  if (!validRisk.has(c.expectedRiskClass)) fail(`case ${c.id}: invalid expectedRiskClass ${c.expectedRiskClass}`);
  if (!validBehavior.has(c.expectedBehavior)) fail(`case ${c.id}: invalid expectedBehavior ${c.expectedBehavior}`);

  const result = route(c.input);
  if (result.mode !== c.expectedMode) fail(`case ${c.id}: expected mode ${c.expectedMode}, got ${result.mode}`);
  if (result.riskClass !== c.expectedRiskClass) fail(`case ${c.id}: expected risk ${c.expectedRiskClass}, got ${result.riskClass}`);
  if (result.expectedBehavior !== c.expectedBehavior) fail(`case ${c.id}: expected behavior ${c.expectedBehavior}, got ${result.expectedBehavior}`);
  if (result.mode === 'full' && (!result.orchestrationRequired || !result.durableRequired)) fail(`case ${c.id}: full mode must require orchestration and durability`);
  if (result.mode !== 'full' && result.durableRequired) fail(`case ${c.id}: non-full mode cannot require full durability`);
  if (risky.has(result.riskClass) && result.routeOutcome === 'low_confidence' && result.expectedBehavior === 'proceed') {
    fail(`case ${c.id}: risky low-confidence route cannot proceed`);
  }
}

if (failed) process.exit(1);
console.log(`Auto routing checks passed (${cases.length} cases)`);

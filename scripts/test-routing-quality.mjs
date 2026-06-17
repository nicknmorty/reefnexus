import { readFileSync } from 'node:fs';

const validRisk = new Set(['normal', 'sensitive', 'destructive', 'security', 'config', 'public']);
const validOutcome = new Set(['selected', 'low_confidence', 'none_selected', 'classifier_error']);
const validBehavior = new Set(['proceed', 'clarify', 'clarify_or_escalate', 'block_and_escalate']);

const cases = JSON.parse(readFileSync('specs/routing-cases.json', 'utf8'));
let failed = false;

if (!Array.isArray(cases) || cases.length === 0) {
  console.error('routing cases missing/empty');
  process.exit(1);
}

for (const c of cases) {
  for (const key of ['id', 'input', 'riskClass', 'routeOutcome', 'expectedBehavior']) {
    if (!c[key]) {
      console.error(`case ${c.id || '<unknown>'} missing ${key}`);
      failed = true;
    }
  }
  if (!validRisk.has(c.riskClass)) {
    console.error(`case ${c.id}: invalid riskClass ${c.riskClass}`);
    failed = true;
  }
  if (!validOutcome.has(c.routeOutcome)) {
    console.error(`case ${c.id}: invalid routeOutcome ${c.routeOutcome}`);
    failed = true;
  }
  if (!validBehavior.has(c.expectedBehavior)) {
    console.error(`case ${c.id}: invalid expectedBehavior ${c.expectedBehavior}`);
    failed = true;
  }

  // policy checks
  if (['security', 'config', 'destructive', 'public', 'sensitive'].includes(c.riskClass)) {
    if (c.routeOutcome === 'low_confidence' && c.expectedBehavior === 'proceed') {
      console.error(`case ${c.id}: risky low_confidence cannot proceed`);
      failed = true;
    }
    if (c.routeOutcome === 'none_selected' && c.expectedBehavior === 'proceed') {
      console.error(`case ${c.id}: risky none_selected cannot proceed`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('Routing quality checks passed');

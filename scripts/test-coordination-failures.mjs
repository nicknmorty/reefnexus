import { readFileSync } from 'node:fs';

const cases = JSON.parse(readFileSync('specs/coordination-failure-cases.json', 'utf8'));
const artifactTypes = new Set(['doc', 'diff', 'log', 'test', 'report', 'archive-manifest', 'other', 'lite-child-result-raw']);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function allFindings(run) {
  return (run.childResults || []).flatMap((result) => (result.findings || []).map((finding) => ({ ...finding, taskId: result.taskId })));
}

function findingsById(run) {
  return new Map(allFindings(run).map((finding) => [finding.id, finding]));
}

function guardStaleEvidence(run) {
  const byId = findingsById(run);
  for (const decision of run.findingDecisions || []) {
    const finding = byId.get(decision.findingId);
    if (!finding) return true;
    const evidence = new Set(finding.evidence || []);
    if ((decision.evidenceReviewed || []).some((item) => !evidence.has(item))) return true;
  }
  return false;
}

function guardUnsupportedFinding(run) {
  return allFindings(run).some((finding) => !Array.isArray(finding.evidence) || finding.evidence.length === 0);
}

function guardNoSend(run) {
  const blockedOrFailed = (run.childResults || []).some((result) => ['blocked', 'failed'].includes(result.status));
  return blockedOrFailed && run.finalDecision?.sendDecision === 'send';
}

function guardConflict(run) {
  const acceptedIds = new Set((run.findingDecisions || [])
    .filter((decision) => decision.decision === 'accepted')
    .map((decision) => decision.findingId));
  const accepted = allFindings(run).filter((finding) => acceptedIds.has(finding.id));
  const verdictByTarget = new Map();
  for (const finding of accepted) {
    if (!finding.target || !finding.verdict) continue;
    const prior = verdictByTarget.get(finding.target);
    if (prior && prior !== finding.verdict) return true;
    verdictByTarget.set(finding.target, finding.verdict);
  }
  return false;
}

function guardMalformedArtifact(run) {
  const seen = new Set();
  for (const artifact of run.artifacts || []) {
    for (const key of ['id', 'type', 'path', 'producerTaskId', 'createdAt']) {
      if (artifact[key] === undefined || artifact[key] === null || artifact[key] === '') return true;
    }
    if (seen.has(artifact.id)) return true;
    seen.add(artifact.id);
    if (!artifactTypes.has(artifact.type)) return true;
  }
  return false;
}

const guards = {
  'reject-stale-evidence': guardStaleEvidence,
  'reject-unsupported-finding': guardUnsupportedFinding,
  'force-no-send': guardNoSend,
  'defer-conflict': guardConflict,
  'reject-malformed-artifact': guardMalformedArtifact,
};

if (!Array.isArray(cases) || cases.length < 5) {
  fail('coordination failure suite should include at least five regression cases');
}

const seenIds = new Set();
for (const testCase of cases) {
  if (!testCase.id || seenIds.has(testCase.id)) fail(`duplicate or missing case id ${testCase.id || ''}`);
  seenIds.add(testCase.id);
  if (!testCase.description) fail(`${testCase.id}: missing description`);
  if (!testCase.expectedGuard || !guards[testCase.expectedGuard]) fail(`${testCase.id}: unknown expectedGuard ${testCase.expectedGuard}`);
  if (!testCase.run?.runId) fail(`${testCase.id}: missing run fixture`);
  if (!guards[testCase.expectedGuard](testCase.run)) fail(`${testCase.id}: guard ${testCase.expectedGuard} did not detect failure`);
}

for (const expected of Object.keys(guards)) {
  if (!cases.some((testCase) => testCase.expectedGuard === expected)) fail(`missing regression case for guard ${expected}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`Coordination failure regression checks passed (${cases.length} cases)`);

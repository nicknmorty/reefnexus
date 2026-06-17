import { readFileSync } from 'node:fs';

const riskyTerms = [
  'admin', 'access', 'auth', 'credential', 'key', 'secret', 'token', 'security', 'config', 'gateway', 'restart', 'production', 'delete', 'remove', 'destructive', 'public', 'publish', 'send', 'message', 'call', 'sms', 'payment', 'billing', 'legal', 'medical',
];
const fullSignals = [
  'implement', 'build', 'fix', 'debug', 'refactor', 'ship', 'release', 'deploy', 'review', 'test', 'validate', 'verify', 'research', 'investigate', 'audit', 'diagnose', 'triage', 'migrate', 'integration', 'runtime', 'end-to-end', 'full product', 'multiagent', 'subagent', 'durable', 'taskflow', 'long-running', 'wait', 'resume', 'workflow',
];
const liteSignals = ['read-only', 'readonly', 'audit', 'inspect', 'check', 'review', 'find', 'compare'];
const simpleSignals = ['summarize', 'rewrite', 'format', 'explain', 'list', 'translate'];

function countMatches(text, terms) {
  return terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
}

export function route(input, options = {}) {
  const text = String(input || '').toLowerCase().trim();
  if (!text) {
    return {
      mode: 'direct',
      routeOutcome: 'none_selected',
      confidence: 0,
      riskClass: 'normal',
      selectedLane: null,
      fallbackUsed: false,
      clarificationAsked: true,
      escalationTriggered: false,
      reasons: ['empty request'],
      expectedBehavior: 'clarify',
    };
  }

  const riskHits = countMatches(text, riskyTerms);
  const fullHits = countMatches(text, fullSignals);
  const liteHits = countMatches(text, liteSignals);
  const simpleHits = countMatches(text, simpleSignals);
  const explicitFull = /\b(full reef[_-]?relay|use reef[_-]?relay|reefrelay full|automatic orchestration|manager mode)\b/.test(text);
  const explicitLite = /\b(reef[_-]?relay lite|lite mode|read-only audit|readonly audit)\b/.test(text);
  const longOrCompound = text.length > 180 || /\b(and then|then|after that|plus|also|end-to-end|e2e)\b/.test(text);
  const likelyMutation = /\b(update|edit|write|patch|commit|push|change|create|delete|remove|install|configure|deploy|restart)\b/.test(text);
  const evidenceRequired = /\b(evidence|sources|verify|validated|tests?|review|audit)\b/.test(text);

  let riskClass = 'normal';
  if (/\b(security|auth|credential|secret|secrets|token|key|keys|admin|admins|access)\b/.test(text)) riskClass = 'security';
  else if (/\b(config|gateway|restart|deploy|production)\b/.test(text)) riskClass = 'config';
  else if (/\b(delete|remove|wipe|destructive)\b/.test(text)) riskClass = 'destructive';
  else if (/\b(public|publish|send|message|call|sms)\b/.test(text)) riskClass = 'public';
  else if (riskHits > 0) riskClass = 'sensitive';

  const reasons = [];
  if (explicitFull) reasons.push('explicit full ReefRelay signal');
  if (explicitLite) reasons.push('explicit lite signal');
  if (longOrCompound) reasons.push('compound or long-running request');
  if (likelyMutation) reasons.push('mutation/change requested');
  if (evidenceRequired) reasons.push('evidence or verification required');
  if (fullHits) reasons.push(`${fullHits} full-mode signal(s)`);
  if (liteHits) reasons.push(`${liteHits} lite-mode signal(s)`);
  if (riskHits) reasons.push(`${riskHits} risk signal(s)`);

  let mode = 'direct';
  let confidence = 0.7;
  let selectedLane = 'direct';
  const immediateRiskCommand = /\b(delete|remove|wipe|rotate|restart|deploy)\b/.test(text) && /\b(now|immediately|asap)\b/.test(text) && riskClass !== 'normal';

  if (immediateRiskCommand && !explicitFull) {
    mode = 'direct';
    confidence = 0.62;
    selectedLane = 'clarify-before-risk';
  } else if (explicitFull || (fullHits >= 2 && (likelyMutation || evidenceRequired || longOrCompound)) || (fullHits >= 1 && riskHits >= 1) || (riskClass !== 'normal' && likelyMutation && !immediateRiskCommand)) {
    mode = 'full';
    confidence = explicitFull ? 0.95 : 0.84;
    selectedLane = 'full-auto';
  } else if (explicitLite || (liteHits >= 1 && !likelyMutation && riskClass === 'normal')) {
    mode = 'lite';
    confidence = explicitLite ? 0.92 : 0.8;
    selectedLane = 'lite-auto';
  } else if (simpleHits >= 1 && !likelyMutation && riskClass === 'normal') {
    mode = 'direct';
    confidence = 0.86;
    selectedLane = 'direct-simple';
    reasons.push('simple direct-task signal');
  } else if (riskClass !== 'normal' && confidence < 0.8) {
    mode = 'direct';
    selectedLane = 'clarify-before-risk';
  }

  const needsClarification = riskClass !== 'normal' && mode !== 'full' && likelyMutation;
  const routeOutcome = needsClarification ? 'low_confidence' : 'selected';
  const expectedBehavior = needsClarification ? 'clarify_or_escalate' : 'proceed';

  return {
    mode,
    routeOutcome,
    confidence,
    riskClass,
    selectedLane,
    fallbackUsed: false,
    clarificationAsked: needsClarification,
    escalationTriggered: false,
    reasons,
    expectedBehavior,
    orchestrationRequired: mode === 'full',
    durableRequired: mode === 'full',
  };
}

function parseArgs(argv) {
  const args = { input: null, json: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--file') args.input = readFileSync(argv[++i], 'utf8');
    else if (argv[i] === '--json') args.json = true;
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv);
  if (!args.input) {
    console.error('usage: node scripts/reefrelay-auto-router.mjs --input "<request>" [--json]');
    process.exit(1);
  }
  const result = route(args.input);
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`${result.mode} ${result.riskClass} ${result.confidence}: ${result.reasons.join('; ')}`);
}

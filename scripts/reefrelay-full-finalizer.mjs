import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const decisionStates = new Set(['accepted', 'rejected', 'deferred']);
const gateResults = new Set(['passed', 'blocked', 'failed']);
const sendDecisions = new Set(['send', 'no-send']);

function parseArgs(argv) {
  const args = { in: null, out: null, synthesisOut: null, now: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--in') args.in = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--synthesis-out') args.synthesisOut = argv[++i];
    else if (argv[i] === '--now') args.now = argv[++i];
  }
  if (!args.in || !args.out) {
    console.error('usage: node scripts/reefrelay-full-finalizer.mjs --in <dispatched-run.json> --out <final-run.json> [--synthesis-out <summary.md>] [--now <iso>]');
    process.exit(1);
  }
  return args;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureArray(value, name) {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value;
}

function allFindings(run) {
  return ensureArray(run.childResults || [], 'childResults').flatMap((result) =>
    ensureArray(result.findings || [], `findings for ${result.taskId}`).map((finding) => ({ ...finding, taskId: result.taskId })),
  );
}

function evidenceForFinding(finding) {
  return Array.isArray(finding.evidence) ? finding.evidence.filter(Boolean) : [];
}

export function reviewFindings(inputRun, options = {}) {
  const run = clone(inputRun);
  const now = options.now || new Date().toISOString();
  const decisions = [];

  for (const finding of allFindings(run)) {
    const evidence = evidenceForFinding(finding);
    let decision = finding.recommendedAction === 'reject' ? 'rejected' : finding.recommendedAction === 'defer' ? 'deferred' : 'accepted';
    let reason = `Orchestrator followed child recommendation ${finding.recommendedAction}.`;
    if (evidence.length === 0) {
      decision = 'rejected';
      reason = 'Unsupported finding cannot be accepted because it has no evidence references.';
    }
    decisions.push({
      findingId: finding.id,
      taskId: finding.taskId,
      decision,
      reason,
      decider: 'orchestrator',
      evidenceReviewed: evidence,
      timestamp: now,
    });
  }

  run.findingDecisions = decisions;
  run.updatedAt = now;
  return run;
}

function validateFindingDecisions(run) {
  const findingsById = new Map(allFindings(run).map((finding) => [finding.id, finding]));
  const decisions = ensureArray(run.findingDecisions || [], 'findingDecisions');
  for (const decision of decisions) {
    if (!findingsById.has(decision.findingId)) throw new Error(`finding decision references unknown finding ${decision.findingId}`);
    if (!decisionStates.has(decision.decision)) throw new Error(`invalid finding decision ${decision.decision}`);
    if (decision.decider !== 'orchestrator') throw new Error('finding decision decider must be orchestrator');
    if (!Array.isArray(decision.evidenceReviewed) || decision.evidenceReviewed.length === 0) {
      if (decision.decision === 'accepted') throw new Error(`unsupported child finding ${decision.findingId} cannot be accepted`);
    }
  }
  for (const finding of findingsById.values()) {
    const decision = decisions.find((item) => item.findingId === finding.id);
    if (!decision) throw new Error(`missing orchestrator decision for finding ${finding.id}`);
    if (decision.decision === 'accepted' && evidenceForFinding(finding).length === 0) {
      throw new Error(`unsupported child finding ${finding.id} cannot be accepted`);
    }
  }
}


function toolEvidenceForRun(run) {
  return ensureArray(run.childResults || [], 'childResults').flatMap((result) =>
    ensureArray(result.toolOutputs || [], `toolOutputs for ${result.taskId}`).map((output, index) => {
      const exit = output.exitCode === undefined ? 'unknown' : output.exitCode;
      const stdout = output.stdout ? ` stdout=${JSON.stringify(String(output.stdout).slice(0, 500))}` : '';
      const stderr = output.stderr ? ` stderr=${JSON.stringify(String(output.stderr).slice(0, 500))}` : '';
      return `${result.taskId} tool[${index + 1}]: ${output.command} (exit ${exit})${stdout}${stderr}`;
    }),
  );
}

function changedFileEvidenceForRun(run) {
  return ensureArray(run.childResults || [], 'childResults').flatMap((result) =>
    ensureArray(result.changedFiles || [], `changedFiles for ${result.taskId}`).map((file) => `${result.taskId} changedFile: ${file}`),
  );
}

function inferCaveatsForRun(run, changedFileEvidence = []) {
  const caveats = [];
  if (changedFileEvidence.length > 0) caveats.push(`Changed files reported: ${changedFileEvidence.length}; orchestrator closeout/review is required before treating mutations as fully shipped.`);
  for (const result of ensureArray(run.childResults || [], 'childResults')) {
    for (const assumption of ensureArray(result.assumptions || [], `assumptions for ${result.taskId}`)) {
      const text = String(assumption || '').replace(/\s+/g, ' ').trim();
      if (/partial|remaining|unresolved|dirty|uncommitted|unpushed|follow-up|not fully|not clean|skipped/i.test(text)) caveats.push(`${result.taskId}: ${text}`);
    }
    for (const output of ensureArray(result.toolOutputs || [], `toolOutputs for ${result.taskId}`)) {
      const combined = [output.command, output.stdout, output.stderr, output.evidence].filter(Boolean).join(' ');
      if (/git status|ahead \d+|untracked|uncommitted|unpushed|dirty|remaining_[a-z_]*=|remaining .*files|not fully|not clean/i.test(combined)) {
        caveats.push(`${result.taskId}: tool output indicates incomplete closeout or residual state (${String(output.command || 'tool output').slice(0, 160)})`);
      }
    }
  }
  return [...new Set(caveats)];
}

const stopWords = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'because', 'but', 'by', 'for', 'from', 'has', 'have', 'in', 'into', 'is', 'it', 'of', 'on', 'or', 'should', 'still', 'that', 'the', 'this', 'to', 'was', 'were', 'while', 'with', 'without', 'yet',
]);

function tokenSet(text) {
  const tokens = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/s$/, ''))
    .filter((token) => token.length > 2 && !stopWords.has(token));
  return new Set(tokens);
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function conciseAcceptedFindings(findings, limit = 12) {
  const selected = [];
  const signatures = [];
  for (const finding of findings) {
    const claim = String(finding.claim || '').replace(/\s+/g, ' ').trim();
    if (!claim) continue;
    const exactKey = claim.toLowerCase();
    const tokens = tokenSet(claim);
    const duplicate = signatures.some((signature) => signature.exactKey === exactKey || jaccard(signature.tokens, tokens) >= 0.72);
    if (duplicate) continue;
    selected.push(finding);
    signatures.push({ exactKey, tokens });
    if (selected.length >= limit) break;
  }
  return selected;
}

function gateRecord(runId, gate, result, decision, reason, evidence, requiredFixes, now) {
  if (!gateResults.has(result)) throw new Error(`invalid gate result ${result}`);
  return {
    runId,
    gate,
    result,
    decision,
    reason,
    evidence,
    requiredFixes,
    owner: 'orchestrator',
    timestamp: now,
  };
}

export function enforceGates(inputRun, options = {}) {
  const run = clone(inputRun);
  const now = options.now || new Date().toISOString();
  validateFindingDecisions(run);

  const childResults = ensureArray(run.childResults || [], 'childResults');
  const acceptedDecisions = ensureArray(run.findingDecisions || [], 'findingDecisions').filter((decision) => decision.decision === 'accepted');
  const acceptedEvidence = acceptedDecisions.flatMap((decision) => decision.evidenceReviewed || []);
  const blockers = childResults.flatMap((result) => (result.blockers || []).map((blocker) => `${result.taskId}: ${blocker}`));
  const failedChildren = childResults.filter((result) => result.status === 'failed');
  const blockedChildren = childResults.filter((result) => result.status === 'blocked');

  const safetyEvidence = acceptedEvidence.length > 0 ? acceptedEvidence : (run.artifacts || []).map((artifact) => `artifact:${artifact.id}`);
  const safetyResult = blockers.length === 0 ? 'passed' : 'blocked';
  const safety = gateRecord(
    run.runId,
    'safety',
    safetyResult,
    safetyResult === 'passed' ? 'continue' : 'no-send',
    safetyResult === 'passed' ? 'Risk and scope constraints are acceptable for final review.' : 'Run has blockers or risk constraints requiring no-send.',
    safetyEvidence,
    safetyResult === 'passed' ? [] : blockers,
    now,
  );

  const verificationResult = failedChildren.length > 0 ? 'blocked' : blockedChildren.length > 0 ? 'blocked' : acceptedEvidence.length > 0 ? 'passed' : 'failed';
  const verification = gateRecord(
    run.runId,
    'verification',
    verificationResult,
    verificationResult === 'passed' ? 'continue' : verificationResult === 'blocked' ? 'no-send' : 'repair',
    verificationResult === 'passed'
      ? 'Accepted findings have evidence references and all children completed.'
      : verificationResult === 'blocked'
        ? 'Verification is explicitly blocked by child blocker/failure state.'
        : 'No accepted evidence references are available.',
    acceptedEvidence,
    verificationResult === 'passed' ? [] : blockers.length > 0 ? blockers : ['Attach evidence for accepted findings.'],
    now,
  );

  const sendDecision = safety.result === 'passed' && verification.result === 'passed' ? 'send' : 'no-send';
  const finalAcceptance = gateRecord(
    run.runId,
    'finalAcceptance',
    verification.result === 'failed' ? 'failed' : 'passed',
    sendDecision,
    sendDecision === 'send'
      ? 'Final synthesis is evidence-backed and user-ready.'
      : 'Final synthesis is allowed only as a no-send/blocker report because an upstream gate is blocked.',
    acceptedEvidence,
    sendDecision === 'send' ? [] : blockers,
    now,
  );

  run.gateRecords = [safety, verification, finalAcceptance];
  run.gates = {
    safety: { result: safety.result, notes: safety.reason, evidence: safety.evidence },
    verification: { result: verification.result, notes: verification.reason, evidence: verification.evidence },
    finalAcceptance: { result: finalAcceptance.result, notes: finalAcceptance.reason, evidence: finalAcceptance.evidence },
  };
  run.finalDecision = {
    sendDecision,
    reason: finalAcceptance.reason,
    persistedAt: now,
  };
  run.updatedAt = now;
  return run;
}

function requireGateState(run) {
  const safety = run.gates?.safety?.result;
  const verification = run.gates?.verification?.result;
  const finalAcceptance = run.gates?.finalAcceptance?.result;
  if (!['passed', 'blocked'].includes(safety)) throw new Error('final synthesis blocked: safety gate must be passed or explicitly blocked');
  if (!['passed', 'blocked'].includes(verification)) throw new Error('final synthesis blocked: verification gate must be passed or explicitly blocked');
  if (finalAcceptance !== 'passed') throw new Error('final synthesis blocked: final acceptance gate must be passed');
  if (!run.finalDecision || !sendDecisions.has(run.finalDecision.sendDecision)) throw new Error('final synthesis blocked: final send/no-send decision must be persisted');
}

function readableHighlight(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function chatHighlight(text, maxLength = 220) {
  const clean = readableHighlight(text);
  if (clean.length <= maxLength) return clean;

  const suffix = ' (full finding in artifacts)';
  const budget = Math.max(40, maxLength - suffix.length);
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [];
  let selected = '';
  for (const sentence of sentences) {
    const next = `${selected}${sentence}`.trim();
    if (next.length > budget) break;
    selected = `${selected}${sentence}`;
  }
  if (selected.trim()) return `${selected.trim()}${suffix}`;

  const words = [];
  for (const word of clean.split(' ')) {
    const next = [...words, word].join(' ');
    if (next.length > budget) break;
    words.push(word);
  }
  return `${words.join(' ')}${suffix}`.trim();
}

function humanCompletionSummary(label, runId, acceptedFindings, displayFindings) {
  const count = acceptedFindings.length;
  const plural = count === 1 ? '' : 's';
  const highlights = displayFindings
    .map((finding) => chatHighlight(finding.claim))
    .filter(Boolean)
    .slice(0, 3);
  const omitted = Math.max(0, count - highlights.length);
  const highlightText = highlights.length > 0
    ? `\nHighlights:\n${highlights.map((item) => `- ${item}`).join('\n')}${omitted > 0 ? `\n- plus ${omitted} more in artifacts` : ''}`
    : '';
  return `${label} ReefRelay completed ${runId} with ${count} evidence-backed accepted finding${plural}.${highlightText}`;
}

function compactMarkdownItems(items, limit) {
  const unique = [...new Set((items || []).map((item) => String(item).replace(/\s+/g, ' ').trim()).filter(Boolean))];
  return {
    shown: unique.slice(0, limit),
    omitted: Math.max(0, unique.length - limit),
  };
}

function synthesisMarkdown(synthesis) {
  const evidence = compactMarkdownItems(synthesis.evidenceReferences, 24);
  const toolEvidence = compactMarkdownItems(synthesis.toolEvidence, 8);
  return [
    `# Final synthesis — ${synthesis.runId}`,
    '',
    `**Send decision:** ${synthesis.sendDecision}`,
    '',
    '## Summary',
    synthesis.summary,
    '',
    '## What changed or was found',
    ...synthesis.whatChangedOrFound.map((item) => `- ${item}`),
    '',
    '## Evidence',
    ...evidence.shown.map((item) => `- ${item}`),
    ...(evidence.omitted ? [`- …${evidence.omitted} more evidence reference(s) kept in final-run.json.`] : []),
    '',
    '## Tool output preview',
    ...(toolEvidence.shown.length ? toolEvidence.shown.map((item) => `- ${item}`) : ['- None recorded.']),
    ...(toolEvidence.omitted ? [`- …${toolEvidence.omitted} more tool output item(s) kept in final-run.json.`] : []),
    '',
    '## Caveats / blockers',
    ...(synthesis.caveatsOrBlockers.length > 0 ? synthesis.caveatsOrBlockers.map((item) => `- ${item}`) : ['- None.']),
    '',
  ].join('\n');
}

export function createFinalSynthesis(inputRun, options = {}) {
  const run = clone(inputRun);
  const now = options.now || new Date().toISOString();
  requireGateState(run);

  const acceptedFindingIds = new Set((run.findingDecisions || [])
    .filter((decision) => decision.decision === 'accepted')
    .map((decision) => decision.findingId));
  const acceptedFindings = allFindings(run).filter((finding) => acceptedFindingIds.has(finding.id));
  const displayFindings = conciseAcceptedFindings(acceptedFindings);
  const toolEvidence = toolEvidenceForRun(run);
  const changedFileEvidence = changedFileEvidenceForRun(run);
  const inferredCaveats = inferCaveatsForRun(run, changedFileEvidence);
  const evidenceReferences = [...new Set([
    ...displayFindings.flatMap((finding) => evidenceForFinding(finding).slice(0, 2)),
    ...changedFileEvidence,
  ])];
  if (evidenceReferences.length === 0) throw new Error('final acceptance requires evidence references');

  const blockers = [
    ...(run.blockers || []).map((item) => `${item.taskId}: ${item.blocker}`),
    ...(run.gateRecords || []).flatMap((gate) => gate.requiredFixes || []),
    ...inferredCaveats,
  ];
  const synthesis = {
    runId: run.runId,
    createdAt: now,
    summary: run.finalDecision.sendDecision === 'send'
      ? humanCompletionSummary('Full', run.runId, acceptedFindings, displayFindings)
      : `Full ReefRelay produced a no-send synthesis for ${run.runId} because one or more gates were blocked.`,
    whatChangedOrFound: displayFindings.map((finding) => finding.claim),
    evidenceReferences,
    toolEvidence,
    changedFileEvidence,
    caveatsOrBlockers: [...new Set(blockers)],
    sendDecision: run.finalDecision.sendDecision,
    decisionReason: run.finalDecision.reason,
  };

  let synthesisArtifact = null;
  if (options.synthesisOut) {
    mkdirSync(dirname(options.synthesisOut), { recursive: true });
    writeFileSync(options.synthesisOut, synthesisMarkdown(synthesis));
    synthesisArtifact = {
      id: 'final-synthesis',
      type: 'report',
      path: options.synthesisOut,
      producerTaskId: 'orchestrator',
      createdAt: now,
    };
    run.artifacts = [...(run.artifacts || []), synthesisArtifact];
  }

  run.finalSynthesis = synthesisArtifact ? { ...synthesis, artifactId: synthesisArtifact.id } : synthesis;
  run.status = run.finalDecision.sendDecision === 'send' ? 'completed' : 'blocked';
  run.updatedAt = now;
  return run;
}

export function finalizeFullRun(inputRun, options = {}) {
  const reviewed = reviewFindings(inputRun, options);
  const gated = enforceGates(reviewed, options);
  return createFinalSynthesis(gated, options);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv);
  const inPath = resolve(args.in);
  const outPath = resolve(args.out);
  const run = JSON.parse(readFileSync(inPath, 'utf8'));
  const finalized = finalizeFullRun(run, {
    synthesisOut: args.synthesisOut ? resolve(args.synthesisOut) : null,
    now: args.now,
  });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(finalized, null, 2)}\n`);
  console.log(`finalized full ReefRelay run -> ${outPath}`);
}

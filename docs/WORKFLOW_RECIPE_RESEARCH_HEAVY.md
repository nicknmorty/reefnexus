# WORKFLOW_RECIPE_RESEARCH_HEAVY.md — Research-heavy workflow recipe

## Use case

Research tasks where answer quality depends on source discovery, freshness, citation discipline, cross-checking, and synthesis rather than code mutation.

Good fits:

- market/technology landscape scans,
- local/current-information briefs,
- vendor/API/library comparisons,
- architecture option research,
- policy/process discovery where stale or unsupported claims are risky.

Bad fits:

- tasks requiring immediate mutation before research is complete,
- confidential/private investigations that should not use external sources,
- high-stakes legal/medical/financial conclusions without expert review,
- simple factual lookups that direct mode can answer with one source.

## Pattern

Default: `hierarchical + concurrent`.

The orchestrator owns source policy, acceptance criteria, final synthesis, and the defensibility gate. Child lanes gather evidence and critique source quality; they do not write final product output directly.

Recommended lanes:

1. **Question-framing lane** — clarify the exact research question, scope, freshness need, and unacceptable source classes.
2. **Source-discovery lane** — collect candidate primary/secondary sources and summarize why each is useful.
3. **Cross-check lane** — independently verify key claims, find conflicts, and flag stale/weak evidence.
4. **Synthesis lane** — build a draft answer from accepted evidence only.
5. **Citation/quality lane** — audit citations, source diversity, freshness, and unsupported claims.

## Preconditions

- Research question and target audience are known.
- Freshness requirement is explicit: current, recent, historical, or timeless.
- Source policy is clear: allowed domains, disallowed domains, primary-source preference, and whether web access is allowed.
- The final answer can cite or otherwise reference evidence without leaking private data.

## Child contracts

### Question-framing

- **Objective:** define research scope, source policy, and acceptance criteria.
- **Boundaries:** no final claims; do not browse private data unless explicitly in scope.
- **Evidence:** restated question, freshness requirement, source policy.
- **Escalate when:** scope is ambiguous or answer stakes require expert/legal/medical/financial review.

### Source discovery

- **Objective:** identify source candidates and classify source type/quality.
- **Boundaries:** prefer primary sources; do not over-weight SEO/listicle content.
- **Evidence:** URLs, document titles, publication dates when available, source type.
- **Escalate when:** sources are unavailable, paywalled, contradictory, or stale.

### Cross-check

- **Objective:** verify important claims against independent evidence.
- **Boundaries:** no synthesis without noting conflicts and uncertainty.
- **Evidence:** claim-to-source mapping, conflict notes, freshness notes.
- **Escalate when:** material claims conflict or cannot be verified.

### Synthesis

- **Objective:** draft a concise, user-useful answer from accepted evidence.
- **Boundaries:** no unsupported claims; no internal debug/source-hunting noise.
- **Evidence:** accepted finding IDs and citations.
- **Escalate when:** accepted evidence is too thin to answer confidently.

### Citation/quality audit

- **Objective:** reject weak/unsupported claims and verify citation usefulness.
- **Boundaries:** read-only; do not add new claims without source evidence.
- **Evidence:** citation coverage, source-quality notes, stale-source flags.
- **Escalate when:** final synthesis overstates certainty or lacks citation support.

## Required artifacts

- source list with type, date/freshness, and relevance,
- claim-to-evidence matrix,
- conflict/staleness notes,
- source-quality decisions,
- final synthesis with citations/evidence references,
- no-send/blocker synthesis when evidence is insufficient.

## Gates

### Safety gate

Pass only when:

- source access respects privacy and scope,
- high-stakes claims are caveated or escalated,
- no private/confidential data is exposed.

### Verification gate

Pass only when:

- accepted claims map to evidence,
- source freshness is appropriate for the question,
- material conflicts are resolved, caveated, or deferred,
- citation/quality audit has no unresolved blockers.

### Final acceptance gate

Pass only when the orchestrator would defend the answer as accurate, useful, complete-enough, well-sourced, and user-ready for the stakes.

## Block/repair conditions

- no primary or credible secondary sources found,
- material claims rely on stale evidence despite a current-info requirement,
- source-discovery and cross-check lanes disagree on a core claim,
- citations do not support the written claim,
- final synthesis includes generic filler or overstates confidence,
- raw worker output leaks into user-facing answer.

## Minimal runnable brief

A runnable fixture lives at `specs/taskflow-briefs/research-heavy.json` and compiles through `scripts/reefrelay-taskflow-stub.mjs` during `npm test`.

# OPERATING_MODEL_LEARNINGS.md — Transferable lessons from news-bot, manager mode, housekeeper, and meeseeks/subagents

This document captures operating-model lessons we should carry into ReefNexus/ReefRelay.

## 1) Orchestrator-owned final acceptance

**Lesson:** worker output is evidence/draft, not ship authority.

**Carry forward:**
- ReefNexus orchestrator owns final synthesis and send/no-send decisions.
- ReefRelay contracts must require verification artifacts, not confidence statements.
- Final acceptance gate is mandatory before user-ready output.

## 2) Front-door routing discipline

**Lesson:** one canonical user-intent entrypoint reduces drift and ad-hoc behavior.

**Carry forward:**
- Define a canonical request path for orchestration runs.
- If a run fails gate checks, return structured blocked output and repair path.
- Do not bypass route logic with manual side paths in normal operation.

## 3) Universal quality gates, selective diagnostics

**Lesson:** all users need the same quality protection; only diagnostics visibility varies.

**Carry forward:**
- Safety/verification/final-acceptance gates apply to every user/run.
- Admin/operator views may include richer diagnostics.
- Product output stays clean and user-facing.

## 4) Role boundaries prevent contamination

**Lesson:** Crawler/Curator/Orchestrator separation in news-bot improved reliability and debugging.

**Carry forward:**
- Preserve strict role ownership in ReefRelay: Orchestrator, Researcher, Implementer, Reviewer, Tester, Synthesizer.
- Avoid silent cross-role state mutation.
- Keep source-of-truth files per role surface.

## 5) Structured handoffs beat transcript replay

**Lesson:** role handoffs should be concise, typed, and evidence-linked.

**Carry forward:**
- Require compact handoff packets (objective, outputs, evidence, assumptions, risks, blockers).
- Avoid passing full transcript context unless explicitly necessary.
- Keep artifact paths stable and reviewable.

## 6) Feedback loop is product infrastructure

**Lesson:** editor reviews + feedback audit + release gates turn quality complaints into shipped fixes.

**Carry forward:**
- Every failed run should produce actionable feedback records.
- Recurring failures should become tests or stricter gates.
- Track pass-as-is and manual-edit rates for quality trend visibility.

## 7) Manager-mode completion loop

**Lesson:** implementation is not done until verification/docs/state/git are done.

**Carry forward:**
- Adopt mandatory completion loop:
  1. build
  2. strong verification
  3. fix failures
  4. report only after pass
  5. update release/project docs
  6. update status
  7. record memory/daily note when appropriate
  8. commit + push

## 8) Housekeeper model: scheduled ops with explicit constraints

**Lesson:** background scheduled work is effective when tasks are bounded, observable, and not context-polluted.

**Carry forward:**
- For recurring orchestration tasks, prefer scheduled runs with clear payloads and health checks.
- Keep background runs concise and artifact-driven.
- Avoid hidden long-lived autonomous loops without supervision.

## 9) Meeseeks/subagent model: narrow lanes + central judgment

**Lesson:** parallel subagents are strongest when lanes are narrow and independently verifiable.

**Carry forward:**
- Decompose into narrow contracts.
- Parallelize only independent lanes.
- Kill duplicate/low-value branches early.
- Centralize conflict resolution and final acceptance in orchestrator.

## 10) Memory-cleanup dogfood: lightweight orchestration mode

**Lesson:** a real memory cleanup pass worked best as lightweight hierarchical orchestration, not full durable workflow ceremony.

**What happened:**
- Main session anchored policy and final authority.
- Two subagents performed parallel read-only audits: daily notes and typed semantic lanes.
- Subagent findings were treated as evidence, not accepted action.
- Main session archived originals, rewrote active files, verified marker/size/root scans, documented the audit, committed, and pushed.

**Carry forward:**
- ReefNexus needs a `lite` mode for short-lived, low-risk orchestration.
- Read-only parallel audits should become a first-class recipe.
- Child results need stricter structured output contracts: candidates, evidence, confidence, risk, recommended action, do-not-mutate flag.
- Shared-authority mutations should stay centralized in the orchestrator unless explicitly delegated.
- Completion events should be normalized before user delivery; raw child output is not product output.
- Archive manifests should be first-class artifacts for cleanup/refactor runs.

See the sanitized fixture and recipe docs in this public tree for the generic
version of those lessons.

## 11) Anti-patterns to explicitly avoid

- Treating generated output as accepted because it sounds polished.
- Mixing operator/debug text into user-facing output.
- Routing around canonical entrypoints.
- Over-parallelizing tasks with shared mutable state.
- Allowing parallel writes to shared authority files without isolation/serialization.
- Forwarding raw worker completion events as user-ready output.
- Leaving state ownership ambiguous.
- Expanding autonomy without stronger verification gates.

## ReefRelay policy summary

ReefRelay should behave as a coordination system, not a content generator:

- route correctly,
- enforce role boundaries,
- require evidence,
- gate release quality,
- and keep final acceptance centralized.

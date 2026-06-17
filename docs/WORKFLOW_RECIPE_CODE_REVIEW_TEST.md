# WORKFLOW_RECIPE_CODE_REVIEW_TEST.md — Code + review + test recipe

## Use case

Implementation work where correctness depends on separating change production from independent review and verification.

Good fits:

- feature implementation,
- bug fixes,
- refactors with behavior-preservation requirements,
- docs/code mixed changes with testable acceptance criteria,
- mutation-heavy cleanup after archive manifest safeguards are in place.

Bad fits:

- unclear product requirements,
- destructive/security/config changes without explicit human confirmation,
- long external waits better handled by a durable TaskFlow wait state,
- changes where no meaningful verification gate can be defined.

## Pattern

Default: `hierarchical` with serialized mutation.

The orchestrator owns scope, final acceptance, and all user-facing output. Child lanes produce bounded artifacts only; raw worker output is never product output.

Recommended lane order:

1. **Intake/planning lane** — restate goal, files/areas in scope, acceptance criteria, likely tests, risk class, and blocker/approval needs.
2. **Implementation lane** — make the smallest safe change set or produce a precise patch plan if mutation is not allowed.
3. **Review lane** — inspect the diff/artifacts for correctness, risk, contract drift, and missing tests.
4. **Test lane** — run the smallest meaningful verification commands and record exact evidence.
5. **Synthesis lane** — draft final summary from accepted findings only after gates are persisted.

## Preconditions

- Goal and expected user-visible outcome are known.
- Mutation authority is clear.
- Repo/worktree status has been checked.
- For cleanup/refactor work, archive manifest requirements are decided before mutation.
- At least one verification command or inspection gate is available.

## Child contracts

### Intake/planning

- **Objective:** define scope, acceptance criteria, risks, and verification plan.
- **Boundaries:** no mutation; do not infer approvals.
- **Evidence:** files inspected, status output, explicit assumptions.
- **Escalate when:** scope is ambiguous, destructive/security/config/public action is needed, or no verification path exists.

### Implementation

- **Objective:** produce the smallest change satisfying accepted scope.
- **Boundaries:** mutate only in approved paths; avoid unrelated cleanup.
- **Evidence:** diff summary, touched paths, generated artifacts, archive manifest if relevant.
- **Escalate when:** requirements conflict, changes exceed scope, or high-risk actions become necessary.

### Review

- **Objective:** independently check implementation correctness and risk.
- **Boundaries:** read-only unless explicitly delegated a repair pass by the orchestrator.
- **Evidence:** diff/file references, failed assumptions, policy/contract checks.
- **Escalate when:** findings conflict with implementation claims or require product/security decisions.

### Test

- **Objective:** run verification and report exact pass/fail evidence.
- **Boundaries:** no broad environment changes; no destructive cleanup.
- **Evidence:** command names, exit status, key output, skipped checks with reasons.
- **Escalate when:** tests are unavailable, flaky, too expensive, or require credentials/approval.

### Synthesis

- **Objective:** prepare a concise final result from accepted findings and verification evidence.
- **Boundaries:** no raw worker output; no claims without evidence.
- **Evidence:** accepted finding IDs, gate records, test outputs, artifact IDs.
- **Escalate when:** gates are blocked or final acceptance is not defensible.

## Required artifacts

- run state with route evidence and risk class,
- implementation diff or patch artifact,
- review findings with evidence,
- test/verification output,
- archive manifest artifact when source files are archived, moved, rewritten, quarantined, or deleted,
- gate records,
- final synthesis artifact.

## Gates

### Safety gate

Pass only when:

- mutation stayed inside approved scope,
- no destructive/security/config/public action occurred without approval,
- archive manifest exists for cleanup/refactor source preservation when required.

Block when:

- diff touches out-of-scope files,
- approval is missing,
- rollback/source-preservation evidence is missing,
- reviewer reports unresolved high-risk issues.

### Verification gate

Pass only when:

- tests or direct inspections ran successfully,
- skipped checks are justified,
- review findings are accepted/rejected/deferred by the orchestrator,
- accepted claims have evidence.

Block when:

- verification did not run and no substitute evidence exists,
- malformed child output was rejected,
- blocker/failure state remains unresolved.

### Final acceptance gate

Pass only when orchestrator/orchestrator would defend the output as accurate, useful, complete-enough, evidence-backed, and user-ready.

## Block/repair conditions

- dirty worktree not explained before mutation,
- missing archive manifest for cleanup/refactor moves/deletions,
- implementation and review disagree on correctness,
- tests fail or cannot run,
- no accepted evidence-backed finding supports the final claim,
- final synthesis includes raw worker/debug text.

## Minimal runnable brief

A runnable fixture lives at `specs/taskflow-briefs/code-review-test.json` and compiles through `scripts/reefrelay-taskflow-stub.mjs` during `npm test`.

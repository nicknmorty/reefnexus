# WORKFLOW_RECIPE_SENSITIVE_CHANGE.md — Runnable sensitive-change recipe

## Use case

Config/security/access/destructive request requiring explicit approvals and auditable steps.

## Pattern

- Default: `sequential + gated checkpoints`.
- Optional reviewer lane before execution for high-impact changes.

## Flow

1. **Classify risk**
   - mark request as `sensitive|security|config|destructive|public`.
2. **Clarify exact intent**
   - capture requested end-state and no-go constraints.
3. **Prepare change plan**
   - minimal diff, rollback plan, verification plan.
4. **Approval checkpoint**
   - explicit human confirmation before execution.
5. **Execute bounded change**
   - only scoped targets; no opportunistic extras.
6. **Verification gate**
   - run required checks and gather evidence.
7. **Final acceptance gate**
   - confirm intent satisfied and output is safe to send.

## Required artifacts

- pre-change snapshot
- planned diff + rollback steps
- approval record
- verification outputs
- post-change state confirmation

## Fail-closed rules

- if approval is absent or ambiguous -> block
- if verification fails -> no-send + repair path
- if scope drifts during execution -> pause and re-approve

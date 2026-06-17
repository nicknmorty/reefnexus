# WORKFLOW_RECIPE_TASKFLOW.md — First runnable ReefRelay recipe

This is the first end-to-end recipe showing ReefRelay policy compiled into TaskFlow durability.

## Use case

"Research + implementation + review + test + synthesis" for a medium-complexity project task.

## Preconditions

- Risk class identified.
- Task is multi-step or expected to outlive one prompt.
- Orchestration pattern selected (`hierarchical` default).

## Step 1 — Intake + classify

Capture:
- goal
- constraints
- output artifact target
- risk class
- latency tolerance

If orchestration is justified, create TaskFlow job and bind owner session.

## Step 2 — Build contracts

Create child-task contracts:
1. Researcher: gather sources + assumptions + risks.
2. Implementer: produce change set/artifacts.
3. Reviewer: audit correctness/risk/policy.
4. Tester: run required checks and report evidence.
5. Synthesizer: draft final output with caveats.

Each contract includes:
- objective
- boundaries
- required evidence
- timeout/escalation conditions

## Step 3 — Execute pattern

Suggested topology:
- Researcher + Implementer in parallel where safe.
- Reviewer + Tester after implementation artifacts exist.
- Synthesizer last.

Persist all status/evidence updates to TaskFlow-linked state.

## Step 4 — Wait/resume path

If blocked by human approval or missing external input:
- set TaskFlow wait state with blocker reason
- include exactly one required decision/input
- resume when available without rebuilding from scratch

## Step 5 — Mandatory gates

Before final output:
1. Safety gate passed.
2. Verification gate passed with evidence.
3. Final acceptance gate passed by orchestrator.

If any gate fails:
- no polished output
- publish blocked status + repair path
- persist failure details for feedback loop

## Step 6 — Finalize

- Write final send/no-send decision to durable state.
- Emit user-facing synthesis (no internal debug leakage).
- Mark TaskFlow job completed/failed/blocked.

## Expected artifact set (minimum)

- run state record with routing and gate fields
- child task records with evidence references
- verification outputs (tests/checks)
- final synthesis note with caveats

## Runnable checklist

- [ ] TaskFlow job created with owner session
- [ ] Child contracts created and linked
- [ ] Evidence persisted per child task
- [ ] Wait/resume tested (if applicable)
- [ ] All gates passed or blocked with repair path
- [ ] Final decision/state persisted before user output

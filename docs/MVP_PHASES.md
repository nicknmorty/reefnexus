# MVP_PHASES.md — Automatic full ReefRelay MVP

## Purpose

This document defines the execution phases for the automatic full ReefRelay MVP. It is designed so a future session can start from the repo alone and receive a short instruction such as:

```text
Execute ReefNexus MVP Phase 2.
```

The assistant should then read this file, `PROJECT_STATUS.md`, and the referenced docs, execute the phase, verify it, update status/docs, commit, and push.

## MVP target

orchestrator/OpenClaw can automatically detect a complex task, create a durable ReefRelay run, dispatch bounded child agents, normalize their outputs, apply gates, and return one accepted final synthesis — without operator needing a slash command.

Slash commands are secondary/manual invocation paths. Lite mode may remain user-facing first; full mode is primarily automatic behavior.

## Current pre-MVP baseline

Already present:

- Automatic direct/lite/full routing policy and tests.
- Full durable TaskFlow-shaped run schema.
- Child-result and finding-decision schema validation.
- Gate-transition simulation.
- Lite command parser and lite validation.
- Docs for automatic orchestration behavior and TaskFlow binding.

Primary gap after Phase 1:

```text
durable run artifact → child dispatch → normalized results → gates → final synthesis
```

Phase 1 is complete. The project now has the auto-router-to-full-run-artifact path. The remaining MVP phases build dispatch, normalization, gates, and final synthesis.

---

## Phase 1 — Auto-route to full run artifact ✅ Completed

### Goal

Turn “this request should use full ReefRelay” into a durable full-mode ReefRelay/TaskFlow run artifact automatically.

### Scope

Build a project-local prototype path that accepts a natural request, routes it, and emits a full run artifact when full ReefRelay is selected.

### Required implementation

- Add a run-brief generator that consumes `scripts/reefrelay-auto-router.mjs` output.
- Generate a full-mode brief compatible with `scripts/reefrelay-taskflow-stub.mjs`.
- Select a reasonable default pattern and child task contracts from request shape/risk.
- Preserve route evidence in the generated run state:
  - route outcome,
  - confidence,
  - risk class,
  - selected lane,
  - fallback/clarification/escalation flags,
  - route reasons.
- Add fixture coverage for at least:
  - direct request does not generate a full run,
  - lite request does not generate a full run,
  - full implementation/review/test request generates full run,
  - config/security full request generates full run but marks risk correctly,
  - risky immediate action blocks/clarifies instead of generating executable run state.

### Exit conditions

Phase 1 completion evidence:

- Implemented `scripts/reefrelay-full-run-generator.mjs`.
- Added `scripts/test-full-run-generator.mjs` to `npm test`.
- Added sample generated artifacts in `runs/auto-samples/`.
- Preserves route metadata and route reasons in generated full run state.
- `npm test` and `git diff --check` passed before completion commit.

Phase 1 is complete only when:

- A project-local CLI/demo can do:

  ```text
  request → auto-router → full run brief → durable full run artifact
  ```

- Generated full run artifacts include:
  - `mode: "full"`,
  - risk class,
  - route metadata and route reasons,
  - owner session,
  - selected pattern,
  - child task contracts,
  - gates,
  - empty or initialized `childResults[]` and `findingDecisions[]`.
- `npm test` passes and includes the new run-generation checks.
- `git diff --check` is clean.
- `PROJECT_STATUS.md` and `docs/ROADMAP.md` are updated.
- Changes are committed and pushed.

### Suggested next command for a new session

```text
Execute ReefNexus MVP Phase 2 from docs/MVP_PHASES.md.
```

---

## Phase 2 — Full run dispatch and child result normalization ✅ Completed

### Goal

Make full mode run bounded child lanes and normalize their outputs into durable state.

### Scope

Build a project-local dispatcher prototype. It may use real OpenClaw subagents when available, or a deterministic/mock child runner for tests, but the runtime contract must match real child-agent behavior.

### Required implementation

- Add a full-run dispatcher that reads a generated full run artifact.
- Spawn or simulate 2–5 bounded child tasks according to the selected pattern.
- Ensure each child task receives a clear contract:
  - objective,
  - boundaries,
  - inputs,
  - expected output schema,
  - evidence requirements,
  - escalation/blocker rules.
- Normalize child completions into `childResults[]`.
- Reject or repair malformed child outputs instead of accepting raw text.
- Persist blocked/failed child states with blocker details.
- Keep raw child output as evidence/artifact only, never as final product.

### Exit conditions

Phase 2 is complete only when:

- A project-local CLI/demo can do:

  ```text
  full run artifact → child dispatch → normalized childResults[]
  ```

- At least one fixture/dogfood run demonstrates:
  - successful child result normalization,
  - blocked child result persistence,
  - malformed child output rejected or repaired,
  - no raw child output treated as final synthesis.
- Durable run artifact is updated with child task statuses and `childResults[]`.
- Tests validate child result linkage to known task IDs and evidence.
- `npm test` passes.
- `git diff --check` is clean.
- `PROJECT_STATUS.md` and `docs/ROADMAP.md` are updated.
- Changes are committed and pushed.

### Completion evidence

- Implemented `scripts/reefrelay-full-dispatcher.mjs`.
- Added `scripts/test-full-dispatcher.mjs` to `npm test`.
- Added a deterministic dogfood fixture in `runs/phase-2/` showing:
  - successful normalized child results,
  - blocked child result persistence,
  - malformed repair (`review`) and malformed rejection (`synthesis`),
  - raw child outputs stored only as artifacts.
- Durable run state now updates task terminal statuses, `childResults[]`, raw artifact pointers, normalization decisions, and run-level blockers.
- `npm test` and `git diff --check` passed before completion commit.

### Suggested next command for a new session

```text
Execute ReefNexus MVP Phase 3 from docs/MVP_PHASES.md.
```

---

## Phase 3 — Gates, final synthesis, and MVP dogfood run ✅ Completed

### Goal

Prove the automatic full ReefRelay behavior end-to-end with gate enforcement and one documented real dogfood run.

### Scope

Complete the MVP spine by adding orchestrator finding decisions, gate enforcement, persisted final send/no-send state, and final synthesis generation.

### Required implementation

- Add or complete orchestrator review logic that records `accepted|rejected|deferred` decisions for child findings.
- Enforce gates:
  - safety,
  - verification,
  - final acceptance.
- Prevent final synthesis from being emitted unless final gate state is persisted.
- Add final synthesis artifact/state with:
  - summary,
  - what changed or what was found,
  - evidence references,
  - caveats/blockers,
  - final send/no-send decision.
- Run one real automatic full ReefRelay dogfood task through the full pipeline.
- Document the dogfood run and any failure-mode learnings.

### Exit conditions

Phase 3 is complete only when:

- A project-local or live prototype can do:

  ```text
  natural request → auto-route full → durable run → child dispatch → normalized results → finding decisions → gates → final synthesis
  ```

- Final output cannot be produced unless:
  - safety gate is passed or explicitly blocked,
  - verification gate is passed or explicitly blocked,
  - final acceptance gate is passed,
  - final send/no-send decision is persisted.
- One documented real dogfood run exists with:
  - route metadata,
  - child task contracts,
  - child results,
  - finding decisions,
  - gate records,
  - final synthesis,
  - verification evidence.
- Tests cover at least:
  - final synthesis blocked when gates are pending/failed,
  - unsupported child findings cannot be accepted,
  - final acceptance requires evidence references,
  - successful end-to-end fixture.
- `npm test` passes.
- `git diff --check` is clean.
- `PROJECT_STATUS.md`, `docs/ROADMAP.md`, and a dogfood note are updated.
- Changes are committed and pushed.

### Completion evidence

- Implemented `scripts/reefrelay-full-finalizer.mjs`.
- Implemented `scripts/reefrelay-full-pipeline.mjs` for the full local prototype path.
- Added `scripts/test-full-finalizer.mjs` to `npm test`.
- Added Phase 3 dogfood artifacts in `runs/phase-3/`.
- Added a private dogfood note in the operational overlay; public fixtures keep
  only the generic run-artifact shape.
- Finalizer records orchestrator `accepted|rejected|deferred` finding decisions, gate records, final send/no-send state, and final synthesis.
- Tests cover pending gate blocking, unsupported accepted finding rejection, evidence requirements, successful end-to-end fixture, and blocked/no-send finalization.
- `npm test` and `git diff --check` passed before completion commit.

### Suggested next command for a new session

```text
Choose the next ReefNexus post-MVP hardening target from docs/ROADMAP.md.
```

---

## Post-MVP / V2 candidates

Do not let these block the automatic full ReefRelay MVP:

- `/reef_relay full <goal>` explicit operator override.
- Short `/reef` alias.
- GUI/dashboard.
- Broader runtime/plugin packaging.
- Metrics dashboard beyond basic run artifacts.
- External integrations beyond OpenClaw primitives.

## Phase execution rules

For each phase:

1. Read this file first.
2. Read `PROJECT_STATUS.md`, `docs/AUTO_ORCHESTRATION.md`, and any phase-referenced docs/scripts.
3. Make the smallest implementation that satisfies the phase exit conditions.
4. Add/extend tests before claiming completion.
5. Update `PROJECT_STATUS.md` and `docs/ROADMAP.md`.
6. Run:

   ```bash
   npm test
   git diff --check
   git status --short
   ```

7. Commit and push.
8. Final reply should include:
   - phase completed,
   - commit hash,
   - verification evidence,
   - next phase command.

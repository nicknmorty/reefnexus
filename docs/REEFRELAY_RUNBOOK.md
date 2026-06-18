# REEFRELAY_RUNBOOK.md — Operator flow

This runbook turns ReefNexus architecture into a practical execution workflow for ReefRelay.

## TaskFlow positioning

- **TaskFlow is the durable runtime substrate.**
- **ReefRelay is the orchestration policy/operating model on top.**

Responsibilities split:
- TaskFlow owns durable job identity, owner session binding, child task linkage, wait/resume/cancel state, and revision safety.
- ReefRelay owns orchestration decisions: whether to orchestrate, which pattern to use, what contracts to spawn, which gates apply, and final synthesis acceptance.
- For runs that outlive one prompt or wait on humans/child tasks, ReefRelay should compile/execute via TaskFlow rather than reinventing state management.

## Project orchestration authority

For project work — especially idea intake, project creation, repo/scaffold setup, subagent coding lanes, MVP definition, and closeout — ReefRelay must follow `docs/runbooks/project-standard.md` before applying the generic operator flow below.

That project runbook is the standard authority for hands-off project automation. If the project runbook and a generic orchestration heuristic conflict, the project runbook wins. If the runbook is ambiguous around risk, scope, repo authority, lifecycle movement, MVP readiness, or subagent permissions, stop and ask operator.

## 0) Preconditions

Before starting a run:

- Request intent is clear enough to define "done."
- Risk class is identified (normal vs sensitive/destructive/config/security/public).
- Complexity level selected:
  1. direct model/tool call,
  2. single tool-using agent,
  3. multiagent orchestration.
- If level 3 is selected, reason is explicit.

## 1) Intake + front-door routing

1. Normalize request into a run brief:
   - user goal,
   - constraints,
   - expected artifact,
   - deadline/latency sensitivity,
   - risk flags.
2. Select orchestration pattern:
   - sequential, concurrent, handoff, group chat, magentic, hierarchical, or hybrid.
3. Create `runId` and initialize shared state record.

If intake quality is too weak, block and request clarification rather than spawning vague work.

## 2) Plan + role assignment

For each subtask, assign a scoped role:

- Researcher
- Implementer
- Reviewer
- Tester
- Synthesizer

Every subtask contract must include:

- objective,
- boundaries (what not to do),
- inputs/context,
- expected outputs and artifact paths,
- verification required,
- timeout/escalation conditions.

## 3) Execute with checkpoints

Use explicit checkpoints at:

- run start,
- after each worker completion,
- on failure/exception,
- before merge/send/state mutation,
- and when constraints change.

At each checkpoint:

1. refresh state,
2. evaluate policy/heuristics,
3. choose next action (continue/reroute/retry/pause/escalate),
4. update shared state.

## 4) Mandatory shared gates (all users/runs)

### Gate A — Safety

Must pass before any high-risk action:

- destructive/config/security/access/public operations confirmed,
- required approval present,
- privacy/policy constraints satisfied.

### Gate B — Verification

Must pass before synthesis:

- claims backed by evidence,
- required checks/tests executed,
- assumptions and caveats explicitly labeled,
- contradictory worker outputs reconciled.

### Gate C — Final acceptance

Orchestrator confirms user-ready quality:

- request intent satisfied,
- output coherent and scoped,
- evidence traceable,
- no debug/operator leakage,
- send/no-send decision explicit.

> Diagnostics may vary by audience (admin/operator vs standard user), but gate strictness never varies.

## 5) Failure handling

If a gate fails:

- do not ship polished-looking partial output,
- return blocked status with concrete reason,
- include repair path (what needs to change to pass),
- capture failure for feedback/audit.

Common recoveries:

- narrow and retry a worker contract,
- switch orchestration pattern,
- add independent reviewer/tester pass,
- escalate to human decision.

## 6) Output contract

Final output should include:

1. what was done,
2. what changed,
3. verification evidence,
4. caveats/blockers,
5. next recommended step (if applicable).

Avoid dumping raw subagent transcripts by default.

## 7) Post-run closeout

- Persist run artifacts/state updates.
- Record notable failures/lessons.
- Update project docs/status for durable changes.
- Commit + push meaningful changes.

Manager-mode completion loop applies: build → verify → fix → report → document → status → memory (when appropriate) → commit/push.

## Local wrapper smoke path

Use the wrapper for local deterministic runtime checks:

```bash
node skills/reef-relay/scripts/runtime-wrapper.mjs --command '/reef_relay lite <goal>' --out-dir runs/wrapper-smoke/lite
node skills/reef-relay/scripts/runtime-wrapper.mjs --command '/reef_relay full <goal>' --out-dir runs/wrapper-smoke/full
```

The wrapper calls the stable API and writes final run, synthesis, metrics, feedback, and raw child-result artifact outputs. It is not a production rollout and does not claim `/reef`.

## 8) Quick operator checklist

Before delegating:
- [ ] For project work, `docs/runbooks/project-standard.md` reviewed and applicable stop boundaries carried into task contracts.
- [ ] Complexity level justified.
- [ ] Pattern selected and stated.
- [ ] Contracts are scoped and testable.

During run:
- [ ] Checkpoints executed.
- [ ] Shared state current.
- [ ] Duplicate/low-value branches killed early.

Before final:
- [ ] Safety gate passed.
- [ ] Verification gate passed.
- [ ] Final acceptance gate passed.
- [ ] Output is user-ready and leak-free.

After final:
- [ ] Durable updates recorded.
- [ ] For project work, project runbook closeout followed: docs/status ahead of development, verification evidence captured, and GitHub synced.
- [ ] Changes committed and pushed.

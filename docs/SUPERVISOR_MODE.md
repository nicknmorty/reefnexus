# SUPERVISOR_MODE.md — ReefRelay supervisor profile

Supervisor Mode is ReefRelay’s pattern for complex tasks where one lead coordinator delegates to specialist agents, reconciles outputs, and owns final acceptance.

## When to use

Use Supervisor Mode when:
- work spans multiple independent specialist lanes,
- parallelization materially improves latency/quality,
- output requires synthesis across conflicting signals,
- handoff risk is high without a central coordinator.

## Core roles

- **Lead/Supervisor (orchestrator-owned):** planning, delegation, routing, conflict resolution, final synthesis.
- **Team specialists:** researcher, implementer, reviewer, tester, synthesizer (or domain-specific workers).

## Memory boundaries

1. **User ↔ Supervisor memory**
   - user intent, constraints, approvals, final decisions.
2. **Supervisor ↔ Specialist memory**
   - task-local contracts and evidence exchanges.
3. **Run ledger / shared state**
   - normalized run/task/gate status and artifact pointers.

Specialists should not depend on full parent transcripts by default.

## Execution flow

1. Intake and classify complexity/pattern.
2. Build subtask contracts.
3. Fan out independent specialist tasks.
4. Collect and reconcile outputs.
5. Run mandatory gates (safety, verification, final acceptance).
6. Return one integrated user-ready response.

## Rules

- Supervisor owns send/no-send.
- Specialists produce evidence, not ship authority.
- Parallel lanes must be isolated when mutating shared files/state.
- Block and escalate on missing approvals or unresolved high-risk conflicts.

# ReefNexus runbooks

Runbooks are operational authority for ReefRelay automation. Architecture docs explain the system; runbooks explain how automation must act when operator is not actively steering every step.

## Current runbooks

- `project-standard.md` — standard project workflow from rough idea through MVP closeout.

## Runbook authority rules

- Runbooks are automation contracts, not suggestions.
- If a runbook and a model guess conflict, the runbook wins.
- If a runbook is ambiguous around risk, scope, authority, privacy, access, cost, or external effects, stop and ask operator.
- Subagents are capable workers, not trusted project owners. ReefRelay/orchestrator owns final acceptance.

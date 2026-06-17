# HANDOFF_SCHEMA_EXAMPLES.md — ReefRelay handoff packet examples

Handoffs should be artifact-first summaries, not transcript dumps.

## Minimum schema

```json
{
  "runId": "string",
  "fromRole": "string",
  "toRole": "string",
  "taskId": "string",
  "objective": "string",
  "status": "pending|running|blocked|done|failed",
  "summary": "short current-state summary",
  "artifacts": ["path-or-link"],
  "verification": {
    "checks": ["..."],
    "result": "pending|passed|failed"
  },
  "risks": ["..."],
  "assumptions": ["..."],
  "nextAction": "single clear next step",
  "escalateIf": "explicit condition"
}
```

## Good example

```json
{
  "runId": "run-2026-05-12-001",
  "fromRole": "implementer",
  "toRole": "reviewer",
  "taskId": "task-impl-02",
  "objective": "Add TaskFlow binding docs and wire validation",
  "status": "done",
  "summary": "Added TASKFLOW_BINDING.md and updated validate-docs required list.",
  "artifacts": [
    "docs/TASKFLOW_BINDING.md",
    "scripts/validate-docs.mjs"
  ],
  "verification": {
    "checks": ["npm test"],
    "result": "passed"
  },
  "risks": ["None high-severity identified"],
  "assumptions": ["Docs-only change, no runtime behavior change"],
  "nextAction": "Review scope alignment and gate language consistency.",
  "escalateIf": "Gate semantics conflict with ARCHITECTURE.md"
}
```

## Bad example

```json
{
  "runId": "idk",
  "summary": "I did a bunch of stuff, looks good probably",
  "artifacts": [],
  "verification": {"result": "passed"}
}
```

Why bad:
- missing role linkage and task identity,
- vague summary,
- no evidence pointers,
- no clear next action,
- unverifiable result claim.

## Reviewer quick checks

- [ ] Can I tell exactly what changed?
- [ ] Are artifacts sufficient to verify claims?
- [ ] Is one next action clearly stated?
- [ ] Are risks/assumptions explicit?

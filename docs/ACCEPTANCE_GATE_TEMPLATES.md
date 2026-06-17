# ACCEPTANCE_GATE_TEMPLATES.md — ReefRelay gate outputs

These templates standardize gate decisions and make send/no-send auditable.

## Gate output schema

```json
{
  "runId": "string",
  "gate": "safety|verification|finalAcceptance",
  "result": "passed|failed|blocked",
  "decision": "continue|repair|escalate|no-send",
  "reason": "short rationale",
  "evidence": ["path-or-link"],
  "requiredFixes": ["if failed/blocked"],
  "owner": "orchestrator|role",
  "timestamp": "ISO-8601"
}
```

## Safety gate template

Pass when:
- required approvals exist for high-risk actions,
- privacy/policy constraints are met,
- requested action remains within scope.

Fail/Block when:
- missing approval,
- risky irreversible operation without confirmation,
- policy violation risk.

## Verification gate template

Pass when:
- claims map to artifacts/evidence,
- required checks ran and results are attached,
- contradictions are reconciled.

Fail/Block when:
- unsupported claims,
- missing required checks,
- unresolved conflicting outputs.

## Final acceptance gate template

Pass when:
- user request intent is satisfied,
- output is coherent and audience-appropriate,
- no operator/debug leakage,
- explicit send/no-send recorded.

Fail/Block when:
- incomplete or misleading synthesis,
- unresolved caveats presented as facts,
- output not user-ready.

## Example (failed verification)

```json
{
  "runId": "run-2026-05-12-004",
  "gate": "verification",
  "result": "failed",
  "decision": "repair",
  "reason": "Claimed tests passed but no test output artifact attached.",
  "evidence": ["docs/WORKFLOW_RECIPE_TASKFLOW.md"],
  "requiredFixes": [
    "Run required tests",
    "Attach command output",
    "Update synthesis caveats"
  ],
  "owner": "orchestrator",
  "timestamp": "2026-05-12T19:00:00Z"
}
```

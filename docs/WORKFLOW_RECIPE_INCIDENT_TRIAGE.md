# WORKFLOW_RECIPE_INCIDENT_TRIAGE.md — Runnable incident/triage recipe

## Use case

Service degradation/outage where speed matters but unsafe changes are unacceptable.

## Pattern

- Default: `hierarchical + concurrent`.
- Supervisor coordinates parallel diagnosis lanes, then converges on one remediation plan.

## Flow

1. **Intake**
   - severity, blast radius, user impact, timeline.
2. **Spawn lanes**
   - Lane A: telemetry/logs snapshot,
   - Lane B: recent changes/deploy diff,
   - Lane C: dependency/infrastructure health.
3. **Reconcile**
   - identify likely root-cause candidates and confidence.
4. **Plan remediation**
   - pick lowest-risk reversible fix first.
5. **Safety gate**
   - require human approval for destructive/config/security-impacting actions.
6. **Execute fix + verify**
   - run targeted checks and monitor rollback criteria.
7. **Final acceptance**
   - summarize incident state, actions taken, evidence, and remaining risk.

## Required artifacts

- incident timeline
- candidate root causes with confidence
- approved remediation plan
- verification output (checks/metrics)
- post-incident summary + follow-ups

## Block/repair conditions

- no clear rollback path
- conflicting evidence unresolved
- missing authorization for high-risk action

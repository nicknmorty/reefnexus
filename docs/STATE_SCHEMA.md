# STATE_SCHEMA.md — ReefRelay run/task schema (v0 draft)

This schema standardizes state for orchestration runs.

## Run envelope

```json
{
  "runId": "string",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "goal": "string",
  "mode": "full|lite",
  "pattern": "sequential|concurrent|handoff|group-chat|magentic|hierarchical|hybrid",
  "riskClass": "normal|sensitive|destructive|security|config|public",
  "status": "queued|running|blocked|failed|completed",
  "routing": {
    "routeOutcome": "selected|low_confidence|none_selected|classifier_error",
    "confidence": 0,
    "selectedLane": "string|null",
    "fallbackUsed": false,
    "clarificationAsked": false,
    "escalationTriggered": false,
    "operatorOverride": false,
    "overrideSource": "string|null",
    "autoSelection": {}
  },
  "tasks": [],
  "lite": {},
  "childResults": [],
  "findingDecisions": [],
  "gateRecords": [],
  "gates": {},
  "finalDecision": {},
  "finalSynthesis": {},
  "metrics": {},
  "artifacts": [],
  "decisions": [],
  "blockers": []
}
```

`mode` defaults to `full` for durable TaskFlow-backed runs. Lite runs set
`mode: "lite"` and must not claim durable TaskFlow state. Full-mode schema may
allow every pattern in the run envelope; the current lite compiler allows only
`sequential`, `concurrent`, `handoff`, `hierarchical`, and `hybrid`.

Explicit full command overrides set `routing.operatorOverride: true`, use a
source such as `/reef_relay full`, and preserve the automatic routing evidence in
`routing.autoSelection` so reviewers can distinguish operator intent from
auto-selection.

## Task object

```json
{
  "id": "string",
  "role": "researcher|implementer|reviewer|tester|synthesizer|custom",
  "objective": "string",
  "boundaries": ["..."],
  "inputs": ["..."],
  "outputs": ["..."],
  "timeoutOrDeadline": "string|null",
  "escalationCondition": "string|null",
  "artifactTargets": ["..."],
  "status": "pending|running|blocked|done|failed",
  "owner": "string",
  "startedAt": "ISO-8601|null",
  "endedAt": "ISO-8601|null",
  "evidence": ["path-or-link"],
  "assumptions": ["..."],
  "risks": ["..."],
  "verification": {
    "checks": ["..."],
    "result": "pending|passed|failed"
  }
}
```

Lite-mode tasks add:

```json
{
  "scope": ["path-or-boundary"],
  "mode": "read-only|orchestrator-write",
  "mutationAllowed": false,
  "resultSchema": "reefrelay-lite-child-result@0.1.0"
}
```

For lite runs, child lanes default to `read-only`; shared-authority mutation is
serialized through the orchestrator. `read-only` tasks must use
`mutationAllowed: false`. `orchestrator-write` tasks are reserved for accepted
central mutations and must explicitly use `mutationAllowed: true`.

## Lite object

```json
{
  "durableTaskflow": false,
  "ownerSessionKey": "current|session:<id>",
  "mutationPolicy": "none|orchestrator-only",
  "maxChildLanes": 4,
  "childResultSchema": "reefrelay-lite-child-result@0.1.0",
  "findingDecisionStates": ["accepted", "rejected", "deferred"]
}
```

## Full child result

Full durable TaskFlow-backed runs may persist normalized child results directly on
run state. Each result must reference a known task, and every finding must carry
concrete evidence before an orchestrator decision can reference it. Raw child
output is retained only through `rawArtifact` artifact pointers; it is not final
product or final synthesis.

```json
{
  "taskId": "string",
  "status": "done|blocked|failed",
  "summary": "string",
  "findings": [
    {
      "id": "string",
      "claim": "string",
      "evidence": ["path#line or artifact id"],
      "confidence": "low|medium|high",
      "severity": "low|medium|high|critical",
      "recommendedAction": "accept|reject|defer"
    }
  ],
  "blockers": [],
  "assumptions": [],
  "rawArtifact": "artifact id for retained raw child output",
  "normalizedAt": "ISO-8601"
}
```

## Lite child result

```json
{
  "taskId": "string",
  "status": "done|blocked|failed",
  "summary": "string",
  "findings": [
    {
      "id": "string",
      "claim": "string",
      "evidence": ["path#line or artifact id"],
      "confidence": "low|medium|high",
      "risk": "low|medium|high",
      "recommendedAction": "accept|reject|defer",
      "doNotMutate": true
    }
  ],
  "blockers": [],
  "assumptions": []
}
```

## Finding decision

```json
{
  "findingId": "string",
  "decision": "accepted|rejected|deferred",
  "reason": "string",
  "decider": "orchestrator",
  "evidenceReviewed": ["path#line or artifact id"]
}
```

Every finding decision must reference a known child finding and reviewed
evidence. Lite-mode findings must receive an orchestrator decision before any
final mutation or polished user-facing result. Full durable runs should use the
same accept/reject/defer decision states before final acceptance.

## Gates object

```json
{
  "safety": { "result": "pending|passed|blocked|failed", "notes": "string", "evidence": [] },
  "verification": { "result": "pending|passed|blocked|failed", "notes": "string", "evidence": [] },
  "finalAcceptance": { "result": "pending|passed|blocked|failed", "notes": "string", "evidence": [] }
}
```

`blocked` means the gate was explicitly reviewed and cannot continue to a normal
send, but the orchestrator may still emit a no-send/blocker synthesis if final
acceptance passes and the no-send decision is persisted.

## Gate record

```json
{
  "runId": "string",
  "gate": "safety|verification|finalAcceptance",
  "result": "passed|blocked|failed",
  "decision": "continue|repair|escalate|no-send|send",
  "reason": "string",
  "evidence": ["path#line or artifact id"],
  "requiredFixes": [],
  "owner": "orchestrator",
  "timestamp": "ISO-8601"
}
```

## Final decision

```json
{
  "sendDecision": "send|no-send",
  "reason": "string",
  "persistedAt": "ISO-8601"
}
```

## Final synthesis

```json
{
  "runId": "string",
  "createdAt": "ISO-8601",
  "summary": "string",
  "whatChangedOrFound": [],
  "evidenceReferences": ["path#line or artifact id"],
  "caveatsOrBlockers": [],
  "sendDecision": "send|no-send",
  "decisionReason": "string",
  "artifactId": "optional artifact id"
}
```

Final synthesis must not be emitted until safety and verification gates are
`passed` or explicitly `blocked`, final acceptance is `passed`, and
`finalDecision.sendDecision` is persisted. A `send` synthesis requires evidence
references; a blocked run may emit a `no-send` synthesis for auditability.

## Run metrics

Metrics are additive observability data and must not change routing, gate, or
send/no-send behavior. The deterministic collector can annotate existing lite or
full run artifacts after the run is produced.

```json
{
  "schemaVersion": "reefrelay-run-metrics@0.1.0",
  "runId": "string",
  "collectedAt": "ISO-8601",
  "mode": "full|lite|unknown",
  "status": "queued|running|blocked|failed|completed|unknown",
  "latency": {
    "runMs": 0,
    "taskMs": { "task-id": 0 }
  },
  "tasks": {
    "total": 0,
    "byStatus": { "pending": 0, "running": 0, "blocked": 0, "done": 0, "failed": 0 },
    "childResults": { "total": 0, "byStatus": { "done": 0, "blocked": 0, "failed": 0 } }
  },
  "blockers": {
    "total": 0,
    "byTask": { "task-id": 0 }
  },
  "failures": {
    "failedTaskCount": 0,
    "blockedTaskCount": 0,
    "failedChildCount": 0,
    "blockedChildCount": 0,
    "noSend": false
  },
  "retries": {
    "total": 0,
    "sources": []
  },
  "artifacts": {
    "total": 0,
    "byType": { "report": 0, "archive-manifest": 0 }
  },
  "findings": {
    "total": 0,
    "decisions": { "accepted": 0, "rejected": 0, "deferred": 0 },
    "evidenceReferenceCount": 0
  },
  "gates": {
    "total": 0,
    "byResult": { "passed": 0, "blocked": 0, "failed": 0 },
    "byDecision": { "continue": 0, "repair": 0, "no-send": 0, "send": 0 }
  },
  "costHints": {
    "available": false,
    "reason": "No provider usage or cost metadata persisted on this deterministic run artifact."
  }
}
```

Validation rules:

- `metrics.runId` must match the enclosing run.
- Metrics are derived from persisted run state only; the collector must not call
  providers, mutate routing, or re-run children.
- Counts must cover tasks, child results, blockers, failed/blocked/done states,
  retries, artifacts, finding decisions, gates, and send/no-send state.
- Cost hints are pass-through when run artifacts already include usage/cost
  metadata; otherwise they explicitly record that cost data is unavailable.

## Quality feedback event

Quality feedback is an advisory artifact generated from weak, blocked, failed,
or no-send runs and from coordination-failure regression cases. Feedback events
must not mutate routing decisions, recipes, gates, or send/no-send policy.

```json
{
  "schemaVersion": "reefrelay-quality-feedback@0.1.0",
  "id": "qf-string",
  "createdAt": "ISO-8601",
  "trigger": "weak-worker-output|child-blocked|child-failed|run-failed|no-send|stale-evidence|unsafe-send-attempt|conflicting-findings|malformed-artifact",
  "severity": "low|medium|high|critical",
  "sourceRun": {
    "runId": "string",
    "path": "optional source artifact path",
    "mode": "full|lite|unknown",
    "status": "queued|running|blocked|failed|completed|unknown",
    "sendDecision": "send|no-send|null"
  },
  "affected": {
    "lane": "orchestrator|task role|task id",
    "taskId": "string|null",
    "recipe": "selected lane, pattern, or guard name"
  },
  "evidence": [],
  "recommendedRepair": "string",
  "regressionCandidate": true,
  "advisoryOnly": true,
  "routingPolicyChange": null,
  "gatePolicyChange": null
}
```

Persisted feedback artifact shape:

```json
{
  "schemaVersion": "reefrelay-quality-feedback@0.1.0",
  "generatedAt": "ISO-8601",
  "source": { "type": "run|coordination-cases", "path": "string" },
  "advisoryOnly": true,
  "events": []
}
```

Validation rules:

- Feedback artifacts are stored separately from `run.metrics`; do not attach them
  as implicit routing or gate inputs.
- Every event requires trigger, severity, source run, affected lane/recipe,
  recommended repair, and `regressionCandidate`.
- `advisoryOnly` must be true and policy-change fields must be null until an
  explicit later phase adds operator-reviewed policy mutation.
- A successful clean run may produce zero feedback events.

## Artifact pointer

```json
{
  "id": "string",
  "type": "doc|diff|log|test|report|archive-manifest|other",
  "path": "string",
  "producerTaskId": "string",
  "createdAt": "ISO-8601"
}
```

## Archive manifest artifact

Cleanup/refactor runs should preserve moved, copied, quarantined, rewritten, or deleted source paths as first-class run artifacts before mutation-heavy work proceeds.

Manifest document shape:

```json
{
  "schemaVersion": "reefrelay-archive-manifest@0.1.0",
  "id": "string",
  "runId": "string",
  "createdAt": "ISO-8601",
  "entries": [
    {
      "id": "string",
      "source": "path-or-identifier",
      "archive": "path-or-identifier, required unless action is deleted",
      "action": "copied|moved|rewritten|quarantined|deleted",
      "reason": "string",
      "producerTaskId": "string",
      "checksum": "optional checksum"
    }
  ]
}
```

Attached run-state summary:

```json
{
  "archiveManifests": [
    {
      "artifactId": "archive-manifest-...",
      "schemaVersion": "reefrelay-archive-manifest@0.1.0",
      "runId": "string",
      "createdAt": "ISO-8601",
      "entryCount": 1,
      "actions": ["copied"],
      "sourcePaths": ["path"],
      "archivePaths": ["path"]
    }
  ]
}
```

Validation rules:

- Manifest `runId` must match the run receiving it.
- Entries require unique IDs, source path, action, reason, and producer task ID.
- `archive` is required for copied, moved, rewritten, and quarantined entries.
- `archive` must differ from `source` when present.
- The manifest is referenced from `artifacts[]` with `type: "archive-manifest"`; the run also stores a compact `archiveManifests[]` summary for routing/gate checks.

## Versioning

- Schema version tag should be carried in run state as `schemaVersion`.
- Breaking shape changes increment major version.
- Additive fields increment minor version.

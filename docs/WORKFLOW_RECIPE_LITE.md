# WORKFLOW_RECIPE_LITE.md — ReefRelay lite mode

Lite mode is ReefRelay's short-lived orchestration path: enough structure to coordinate narrow child work, but without the full durable TaskFlow ceremony unless the run escalates.

## Use case

Use lite mode for bounded work where the orchestrator benefits from parallel eyes but should keep final authority centralized.

Good fits:

- read-only audits,
- cleanup candidate discovery,
- docs or memory inventory passes,
- small research sweeps,
- preflight checks before a heavier workflow,
- quick review lanes before a single centralized mutation.

Bad fits:

- long-running work that needs wait/resume,
- destructive, security, config, access, or public actions without explicit human confirmation,
- shared-authority mutation by multiple workers,
- tasks where child outputs cannot be independently checked.

## Selection heuristic

Auto-select lite mode when all are true:

1. The task is short-lived and can finish in the current interaction window.
2. Risk is normal or sensitive-but-read-only.
3. Most child lanes are read-only.
4. Parallel lanes are independent.
5. The orchestrator can accept/reject/defer findings before any mutation.
6. No durable wait state is required.

Escalate to TaskFlow-backed mode when any are true:

- a human approval wait is expected,
- a child task must mutate shared authority directly,
- the work may span sessions,
- evidence or decisions must be persisted beyond lightweight run artifacts,
- risk class is destructive, security, config, or public.

## Current implementation boundary

The current repo contains the lite-mode contract, documentation, fixtures, command parser, compile stub, and deterministic runtime dispatcher prototype. `scripts/reefrelay-lite-runtime.mjs` can parse `/reef_relay lite <goal>`, compile a lite run, dispatch bounded deterministic child lanes, normalize/reject child results, classify findings, enforce gates, and persist a final synthesis artifact.

Live OpenClaw subagent dispatch remains a later integration step; the prototype uses deterministic/mock child lanes while preserving the runtime contract shape expected from real child agents.

## Command shape

Primary skill-command entrypoint:

```text
/reef_relay lite <goal>
```

Supported aliases once packaged as a runtime plugin:

```text
/reef lite <goal>
/reef audit --read-only --parallel <goal>
```

Until a plugin alias exists, `/skill reef-relay lite <goal>` remains the portable fallback.

## Lite run loop

1. **Intake** — capture goal, boundaries, risk class, expected artifacts, and whether mutation is allowed.
2. **Lane split** — create 1–4 narrow child contracts. Default child lanes are read-only.
3. **Dispatch** — run independent lanes in parallel when safe; the current prototype dispatches deterministic lanes and records raw output artifacts.
4. **Normalize child output** — each child returns structured findings, evidence, confidence, risk, recommended action, and `doNotMutate`; malformed raw output is rejected and retained only as evidence.
5. **Classify findings** — orchestrator marks each finding `accepted`, `rejected`, or `deferred`.
6. **Central mutation** — only the orchestrator performs writes, and only for accepted findings. Lite compile stubs may represent this as `mode: "orchestrator-write"` with `mutationAllowed: true`; worker lanes must remain read-only.
7. **Verify** — run the smallest meaningful checks and persist safety/verification/final-acceptance gate records.
8. **Finalize** — send one concise user-facing result only when gates allow `send`; otherwise persist a no-send synthesis. Raw child output is never product output.

## Default lane contract

```json
{
  "taskId": "audit-docs",
  "role": "reviewer",
  "objective": "Find stale docs and cleanup candidates",
  "scope": ["docs/"],
  "mode": "read-only",
  "expectedOutputs": ["structured child result"],
  "verificationRequired": ["evidence paths for every finding"],
  "mutationAllowed": false,
  "timeoutSeconds": 600
}
```

## Child result minimum schema

```json
{
  "taskId": "audit-docs",
  "status": "done",
  "summary": "string",
  "findings": [
    {
      "id": "finding-1",
      "claim": "string",
      "evidence": ["path#line or command output pointer"],
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

## Orchestrator classification

Every finding must be classified before final output:

- `accepted` — supported by evidence and safe to act on.
- `rejected` — unsupported, duplicate, stale, unsafe, or out of scope.
- `deferred` — plausible but needs more evidence, approval, or a heavier workflow.

Classification records include:

```json
{
  "findingId": "finding-1",
  "decision": "accepted|rejected|deferred",
  "reason": "string",
  "decider": "orchestrator",
  "evidenceReviewed": ["path#line"]
}
```

## Safety defaults

- Child lanes are read-only unless explicitly delegated otherwise.
- `orchestrator-write` is reserved for serialized orchestrator-owned mutation after findings are accepted.
- Shared-authority writes are serialized through the orchestrator.
- Raw worker completions are normalized before delivery.
- Lite mode can recommend escalation; it must not fake durable workflow state.

## Minimum artifacts

- lite run state,
- child contracts,
- child result packets,
- finding classification list,
- verification notes,
- final user-facing synthesis.

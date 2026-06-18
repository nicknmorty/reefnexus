# ARCHITECTURE.md — ReefNexus

## Overview

ReefNexus architecture has four layers:

1. **Control layer (ReefNexus)**
   - Pattern selection
   - Policy/gate enforcement
   - Final synthesis and acceptance

2. **Coordination layer (ReefRelay)**
   - Delegation contracts
   - Handoff protocol
   - Routing and retries
   - Checkpoints and escalation

3. **Durability layer (TaskFlow)**
   - Durable run identity and owner session binding
   - Child task linkage and revision-safe updates
   - Wait/resume/cancel lifecycle state
   - Long-running orchestration substrate

4. **Execution layer (specialists/tools)**
   - Researcher/Implementer/Reviewer/Tester/Synthesizer roles
   - First-class OpenClaw tools
   - Evidence artifacts and bounded outputs

See [`docs/SPECIALIZED_AGENTS.md`](SPECIALIZED_AGENTS.md) for role-by-role scope, required outputs, escalation rules, and pattern defaults.

## Complexity ladder

1. Direct model call
2. Single agent with tools
3. Multiagent orchestration

Move up only when lower levels fail reliability/quality/security requirements.

## Pattern map

- **Sequential**: deterministic pipelines.
- **Concurrent**: fan-out/fan-in independent branches.
- **Handoff**: dynamic specialist routing.
- **Group chat**: collaborative debate/refinement.
- **Magentic**: adaptive manager loop for uncertain paths.
- **Hierarchical**: default manager-mode structure.
- **Hybrid**: compose patterns for complex real tasks.

## Shared state model (draft)

```json
{
  "runId": "string",
  "goal": "string",
  "pattern": "sequential|concurrent|handoff|group-chat|magentic|hierarchical|hybrid",
  "status": "queued|running|blocked|failed|completed",
  "tasks": [
    {
      "id": "string",
      "role": "researcher|implementer|reviewer|tester|synthesizer|custom",
      "objective": "string",
      "inputs": ["..."],
      "outputs": ["..."],
      "status": "pending|running|blocked|done|failed",
      "evidence": ["path-or-link"],
      "assumptions": ["..."],
      "risks": ["..."]
    }
  ],
  "gates": {
    "safety": "pending|passed|failed",
    "verification": "pending|passed|failed",
    "finalAcceptance": "pending|passed|failed"
  }
}
```

## Checkpoint protocol

At each checkpoint:

1. Refresh constraints and current state.
2. Evaluate policy/heuristics.
3. Decide next step (route, retry, stop, escalate).
4. Update plan/state.
5. Continue or pause for human decision.

## Guardrails

- Fail closed on destructive/config/security/public operations.
- Keep one active in-progress plan step where possible.
- Avoid overlapping file edits without isolation.
- Keep handoffs short, structured, and auditable.
- Treat subagent output as evidence, not acceptance.
- Enforce universal quality gates for all users/runs; vary diagnostics visibility by audience, not gate strictness.
- Keep a canonical front-door routing path for orchestrated requests.

## Operating-model requirements

Architecture-level requirements:

1. Orchestrator owns final acceptance.
2. Front-door routing is canonical and bypass-resistant.
3. Role boundaries and state ownership are explicit.
4. Handoffs are structured artifacts, not transcript dumps.
5. Feedback/review loops are first-class product infrastructure.

---
name: reef-relay
description: "Coordinate multiagent OpenClaw work with explicit contracts, routing patterns, checkpoints, and final acceptance gates."
user-invocable: true
---

# ReefRelay Skill

## Purpose

ReefRelay is the coordination layer for ReefNexus. It helps an orchestrator run multiagent work with clear contracts, safe routing, and verifiable outputs.

## When to use

Use ReefRelay when work is:

- multi-step and quality-sensitive,
- parallelizable across independent specialist roles,
- likely to produce conflicting drafts that need synthesis,
- or likely to fail without explicit handoff/checkpoint discipline.

## When not to use

Do not use ReefRelay for:

- simple one-step tasks,
- tasks solvable by direct tools or a single agent,
- urgent operations where orchestration overhead would harm outcomes.

## Automatic full-mode use

Full ReefRelay should primarily be automatic behavior. Use full mode when a request warrants durable multiagent coordination: multi-phase work, code/config changes with review and tests, long-running or resumable work, high-quality evidence requirements, or tasks where independent specialist passes materially reduce risk.

The orchestrator should classify the request into direct, lite, or full mode before delegating. Full mode creates durable TaskFlow-backed run state, child contracts, normalized child results, orchestrator accept/reject/defer decisions, and safety/verification/final-acceptance gates.

## Slash command use

ReefRelay is user-invocable for lightweight explicit routing. OpenClaw exposes the skill as `/reef_relay` when native skill commands are enabled, with `/skill reef-relay` as the portable fallback.

Primary private/trusted-beta command shapes:

```text
/reef_relay lite <goal>
/reef_relay full <goal>
/reef_relay live-lite <goal>
/reef_relay live-full <goal>
```

Use `lite` for short-lived, low-risk orchestration with read-only child lanes, structured findings, centralized accept/reject/defer decisions, and no full durable TaskFlow ceremony unless escalation is needed. Use `full` only as an explicit operator override for durable orchestration. Use `live-lite`/`live-full` only for bounded trusted-beta testing where real child dispatch is desired. See `docs/WORKFLOW_RECIPE_LITE.md`, `docs/SLASH_COMMANDS.md`, `docs/AUTO_ORCHESTRATION.md`, `docs/RUNTIME_WRAPPER.md`, and `docs/NATIVE_COMMAND.md`.

Private/local wrapper smoke path:

```bash
node skills/reef-relay/scripts/runtime-wrapper.mjs --command '/reef_relay lite <goal>' --out-dir runs/wrapper-smoke/lite
node skills/reef-relay/scripts/runtime-wrapper.mjs --command '/reef_relay full <goal>' --out-dir runs/wrapper-smoke/full
```

This wrapper uses the project-local stable API and deterministic/mock child dispatch by default, with explicit guarded live dispatch available through an adapter. It does not publish ReefRelay, register `/reef`, or make production-readiness claims.

## Required operating behavior

1. Choose lowest reliable complexity level first.
2. Pick an orchestration pattern and state why.
3. Create explicit subtask contracts.
4. Keep a shared state record.
5. Enforce checkpoints and safety gates.
6. Verify evidence before final synthesis.
7. Return one coherent final answer.

## Patterns

- Lite read-only audit
- Sequential
- Concurrent
- Handoff
- Group chat
- Magentic/dynamic
- Hierarchical
- Hybrid

## Contract template

Each delegated task must include:

- objective,
- scope boundaries,
- required inputs,
- expected outputs/artifact paths,
- verification required,
- timeout/escalation condition.

## Checkpoint template

At each checkpoint, evaluate:

- current constraints,
- route quality,
- blocker status,
- safety/privacy/config risk,
- evidence sufficiency.

Then decide: continue, reroute, retry, pause, or escalate.

## Final acceptance gate

Before user-ready output:

- [ ] request intent satisfied,
- [ ] evidence inspected,
- [ ] tests/checks run where applicable,
- [ ] assumptions and caveats labeled,
- [ ] safety/privacy constraints respected.

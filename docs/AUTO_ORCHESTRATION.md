# AUTO_ORCHESTRATION.md — Full ReefRelay automatic behavior

## Target behavior

Full ReefRelay is primarily an **automatic orchestration behavior**. The main product goal is that the assistant/orchestrator recognizes when durable multiagent coordination is warranted and engages ReefRelay without the user needing to know or type a command.

Slash commands are a secondary invocation path. They can explicitly trigger the same process for operators who want manual control, but they should not define or constrain the automatic behavior. Lite mode remains the explicit/low-friction command surface for bounded read-only audits and short fan-out checks. `/reef_relay full <goal>` can be a later operator-override command after automatic full mode is stable.

## Mode ladder

1. **Direct** — answer or use tools directly when the task is simple, low-risk, and not meaningfully improved by delegation.
2. **Lite ReefRelay** — short-lived read-only fan-out/fan-in when multiple eyes help but durable TaskFlow ceremony is not needed.
3. **Full ReefRelay** — automatic durable orchestration for complex, quality-sensitive, multi-step, risky, or long-running work.

## Automatic full-mode triggers

Route to full ReefRelay when one or more of these are true:

- The task needs distinct phases such as research → implementation → review → test → synthesis.
- Work is naturally parallelizable across specialist lanes.
- The task is expected to outlive one turn or wait on subagents/human input.
- The task involves code/config/system changes that require review and verification.
- The task is quality-sensitive enough that independent review materially reduces risk.
- The task needs durable state, evidence linkage, retries, or resumability.
- The user explicitly asks for manager-style/full ReefRelay/orchestrated behavior.

## Do not auto-orchestrate when

- The request is a simple one-step answer, rewrite, summary, or lookup.
- Orchestration overhead would be slower than direct execution with no quality gain.
- The request is urgent and latency matters more than parallel review.
- A risky/destructive/security/public action lacks required human confirmation; block/clarify first.

## Full-mode run loop

1. **Classify** request into direct/lite/full with risk class and route evidence.
2. **Create durable run** with `mode: "full"`, owner session, risk class, route fields, tasks, gates, and artifacts.
3. **Plan contracts** for bounded child tasks with objectives, boundaries, outputs, verification, and escalation.
4. **Dispatch children** according to selected pattern.
5. **Normalize child outputs** into `childResults[]`; raw worker output is evidence, not product.
6. **Judge findings** with orchestrator `accepted|rejected|deferred` decisions in `findingDecisions[]`.
7. **Gate** safety, verification, and final acceptance.
8. **Finalize** only after final send/no-send state is persisted.

## Current prototype surface

- `scripts/reefrelay-auto-router.mjs` deterministically classifies requests into `direct`, `lite`, or `full`.
- `specs/auto-routing-cases.json` captures expected automatic behavior.
- `scripts/test-auto-routing.mjs` enforces routing invariants.
- `scripts/reefrelay-taskflow-stub.mjs` compiles full durable run state and validates child-result/finding-decision linkage.
- `scripts/reefrelay-full-run-generator.mjs` turns a natural full-mode request into a durable full run artifact.
- `scripts/reefrelay-full-dispatcher.mjs` dispatches deterministic bounded child lanes and normalizes child results.
- `scripts/reefrelay-full-finalizer.mjs` records orchestrator finding decisions, gates, send/no-send state, and final synthesis.
- `scripts/reefrelay-full-pipeline.mjs` demonstrates the project-local MVP path:

```text
natural request → auto-route full → durable run → child dispatch → normalized results → finding decisions → gates → final synthesis
```

## Next implementation step

Move from the deterministic project-local prototype toward a live OpenClaw runtime path, while keeping the same persisted contracts and gate requirements.

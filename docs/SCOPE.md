# SCOPE.md — ReefNexus

## In scope (v0 / completed foundations)

- Docs-first architecture and operating model.
- ReefRelay skill contract (draft) for multiagent coordination.
- Automatic direct/lite/full routing policy for deciding when full ReefRelay should engage without explicit user command.
- Scoped specialized-agent roster with responsibilities, outputs, and escalation boundaries.
- Pattern selection guidance:
  - sequential,
  - concurrent,
  - handoff,
  - group chat,
  - magentic/dynamic planner,
  - hierarchical/hybrid overlays.
- Orchestration checklist and acceptance gates.
- Shared state + handoff schema (initial draft).
- Example workflows for research/docs/code/review.

## In scope (V1 private/trusted beta)

- Implemented ReefRelay coordination templates.
- Runnable workflow recipes for common task types.
- TaskFlow-backed durable orchestration for long-running/multi-step runs (owner session, child linkage, wait/resume/cancel).
- Stable project-local ReefRelay API and private runtime wrapper.
- Native `/reef_relay` runtime-only plugin testing for authorized private/trusted-beta surfaces.
- Deterministic `lite`/`full` and explicit bounded `live-lite`/`live-full` smoke paths.
- Structured run artifacts (`state/` and `runs/`) with traceability.
- Basic metrics: run count, retries, failure modes, average completion time.
- Private beta feedback capture from trusted operators.
- User-facing output polish so chat summaries are concise and raw child/tool evidence stays in artifacts unless explicitly requested.

## Out of scope (for now)

- Full GUI dashboard.
- Autonomous always-on background orchestration daemon.
- Broad external integrations beyond OpenClaw primitives.
- Public package/release, `/reef` alias, broad rollout, or default-on routing without the operator's later explicit approval.
- Slash commands as the primary product path; they are secondary/manual triggers for the same automatic orchestration process.
- Replacing OpenClaw core behavior.

## Non-goals

- "More agents" as a success metric.
- Unbounded autonomous retries.
- Hiding uncertainty behind synthetic confidence.

## Risks

- Over-engineering before real usage feedback.
- Cost/latency increases from premature parallelism.
- Context bloat in handoffs.
- False confidence from unverified subagent outputs.

## Mitigations

- Start with narrow, repeatable workflows.
- Default to lower complexity unless strong justification exists.
- Keep contracts concise and testable.
- Require verification evidence before final synthesis.

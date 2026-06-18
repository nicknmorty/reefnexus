# SCOPE.md — ReefNexus

## In scope

- Docs-first architecture and operating model.
- ReefRelay coordination contract for multiagent work.
- Automatic direct/lite/full routing policy for deciding when full ReefRelay should engage.
- Scoped specialized-agent roster with responsibilities, outputs, and escalation boundaries.
- Pattern selection guidance: sequential, concurrent, handoff, group chat, magentic/dynamic planner, and hierarchical/hybrid overlays.
- Orchestration checklist and acceptance gates.
- Shared state and handoff schema.
- Implemented ReefRelay coordination templates and runnable workflow recipes.
- TaskFlow-backed durable orchestration for long-running/multi-step runs (owner session, child linkage, wait/resume/cancel).
- Stable project-local ReefRelay API and runtime wrapper.
- Native `/reef_relay` command with deterministic `lite`/`full` and opt-in bounded `live-lite`/`live-full` paths.
- Structured run artifacts with traceability.
- Basic metrics: run count, retries, failure modes, average completion time.
- Concise user-facing output, with raw child/tool evidence kept in artifacts.

## Out of scope

- Full GUI dashboard.
- Autonomous always-on background orchestration daemon.
- Broad external integrations beyond OpenClaw primitives.
- Default-on routing without explicit operator approval.
- Slash commands as the primary product path; they are secondary/manual triggers for the same orchestration process.
- Replacing OpenClaw core behavior.

## Non-goals

- "More agents" as a success metric.
- Unbounded autonomous retries.
- Hiding uncertainty behind synthetic confidence.

## Risks and mitigations

- Over-engineering before real usage feedback - start with narrow, repeatable workflows.
- Cost/latency increases from premature parallelism - default to lower complexity unless justified.
- Context bloat in handoffs - keep contracts concise and testable.
- False confidence from unverified subagent outputs - require verification evidence before final synthesis.

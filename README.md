# ReefNexus

**ReefNexus** is a docs-first project for designing automatic multiagent
orchestration behavior and a coordination skill for OpenClaw.

The naming split:

- **ReefNexus** - the project/repo: the multiagent architecture and coordination hub.
- **ReefRelay** - the core skill/module: orchestration policy, handoff/routing/contracts, gate logic, and review checkpoints.
- **Clawstro** - the mascot/brand flourish.

## Vision

Make multiagent work feel less like manually spawning assistants and more like
having a lead assistant operate a coordinated team when the work calls for it:
visible, bounded, steerable, testable, and safe.

TaskFlow is the durable runtime substrate. ReefNexus/ReefRelay defines the
orchestration policy and operating model on top.

ReefNexus helps an orchestrator decide:

1. whether orchestration is actually needed,
2. whether the request should stay direct, use lite mode, or escalate into full ReefRelay,
3. which pattern fits the task,
4. what each specialist agent should do,
5. how state and handoffs are managed,
6. when humans must approve or steer,
7. and what evidence is required before final synthesis.

## Current Shape

ReefRelay is a runtime-ready MVP for intentional local operator use. It exposes a
stable project-local API through `reefnexus` / `reefnexus/reefrelay`, an
AgentSkill wrapper at `skills/reef-relay/scripts/runtime-wrapper.mjs`, and a
runtime-only OpenClaw plugin package for native `/reef_relay` testing.

The wrapper/native paths support deterministic `lite|full`, explicit guarded
live `live-lite|live-full`, persisted run/metrics/feedback artifacts, raw
child-result quarantine, and gated final synthesis. Live modes are opt-in beta
paths for authorized operators, not default-on automation.

## Core Docs

- `docs/VISION.md` - product direction and principles.
- `docs/SCOPE.md` - what is in/out for early versions.
- `docs/ARCHITECTURE.md` - conceptual architecture and patterns.
- `docs/ROADMAP.md` - roadmap.
- `docs/API.md` - stable ReefRelay API, internal boundaries, and migration notes.
- `docs/RUNTIME_WRAPPER.md` - local wrapper, live dispatcher options, and artifact layout.
- `docs/NATIVE_COMMAND.md` - native OpenClaw `/reef_relay` plugin command contract and safety posture.
- `docs/REEFRELAY_RUNBOOK.md` - practical operator flow and mandatory gates.
- `docs/AUTO_ORCHESTRATION.md` - automatic direct/lite/full routing behavior.
- `docs/STATE_SCHEMA.md` - run/task/gate/artifact schema draft.
- `docs/TASKFLOW_BINDING.md` - ReefRelay-to-TaskFlow runtime mapping.
- `docs/WORKFLOW_RECIPE_*.md` - runnable orchestration recipe families.
- `docs/runbooks/project-standard.md` - project-work runbook authority.

## Code And Fixtures

- `src/reefrelay/index.mjs` - stable project-local API surface.
- `src/reefrelay/internal.mjs` - internal implementation re-export surface for wrappers/tests.
- `src/openclaw-plugin/index.mjs` - OpenClaw plugin entry for the native `/reef_relay` command.
- `skills/reef-relay/SKILL.md` - skill contract.
- `skills/reef-relay/scripts/runtime-wrapper.mjs` - wrapper around `/reef_relay lite` and `/reef_relay full`.
- `scripts/` - deterministic routing, runtime, validation, and test scripts.
- `specs/` - canonical brief and routing fixtures.
- `runs/` - sanitized deterministic fixture artifacts used by the test suite.

## Safety Posture

- Start with the lowest reliable complexity.
- Prefer direct tools or a single agent when enough.
- Use multiagent orchestration only when specialization, security boundaries, parallelism, or review quality justify the overhead.
- Keep visibility, policy, and authority explicit.
- Treat child-agent output as evidence, not final acceptance.
- Keep handoffs concise, structured, and auditable.
- Fail closed on safety, privacy, config, access, destructive actions, and external/public messaging.

## Usage

```bash
npm test
node skills/reef-relay/scripts/runtime-wrapper.mjs \
  --command '/reef_relay lite audit docs' \
  --out-dir runs/local-smoke/lite
node skills/reef-relay/scripts/runtime-wrapper.mjs \
  --command '/reef_relay full review wrapper behavior and verify tests' \
  --out-dir runs/local-smoke/full
```

Live modes (`live-lite`, `live-full`) are opt-in, require operator approval, run
bounded isolated child lanes, and fail closed on malformed child output.

## Status

Active project. Deterministic `lite`/`full` paths are covered by fixture tests;
live modes are opt-in. See `docs/ROADMAP.md`.

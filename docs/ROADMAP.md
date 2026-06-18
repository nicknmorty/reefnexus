# Roadmap

ReefRelay is a deterministic multiagent orchestration policy and runtime wrapper
for OpenClaw. This roadmap describes current capabilities and planned direction.

## Current capabilities

- Automatic direct/lite/full routing.
- Deterministic `lite` and `full` runs with persisted artifacts.
- Full run generation, dispatch, finalization, and gated final synthesis.
- TaskFlow-shaped compile artifacts for durable orchestration.
- Gate transitions, metrics, feedback, archive manifests, and coordination-failure handling.
- Stable project-local API (`src/reefrelay/index.mjs`).
- Native `/reef_relay` command with `lite`, `full`, and opt-in `live-lite`/`live-full` modes.
- Guarded live child dispatch: opt-in, bounded, isolated by child session ID, fail-closed on malformed output.

## Planned

- Broaden routing quality fixtures.
- Richer source-quality and freshness gates.
- Optional UI/reporting around run artifacts.
- Deeper integration with durable TaskFlow job state.
- Package naming, release process, and artifact-retention defaults.

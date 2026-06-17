# Project Status

## Summary

ReefNexus contains ReefRelay, a deterministic orchestration policy and runtime
wrapper for coordinating bounded multiagent work. The public repo contains the
generic product code, docs, tests, and sanitized fixtures. Local operator logs,
live dogfood evidence, deployment details, and environment-specific overlays
belong in private repos or ignored runtime paths.

## Current Phase

- Phase: runtime-ready MVP with guarded beta operator testing.
- Status: deterministic `lite` and `full` paths are covered by fixture tests;
  explicit `live-lite` and `live-full` paths remain opt-in beta features for
  authorized operators.
- Public transition: V2 is the first public-eligible track for broader rollout,
  packaging, aliases, or default-on routing.

## Implemented

- Direct/lite/full routing prototype and quality fixtures.
- Full ReefRelay run generator, dispatcher, finalizer, and pipeline contracts.
- Lite runtime wrapper and parser contract.
- TaskFlow-shaped run-state compile stub.
- Gate transition simulator and regression checks.
- Metrics, feedback, archive-manifest, and coordination-failure checks.
- Stable public API exports from `src/reefrelay/index.mjs`.
- OpenClaw native command plugin entry for `/reef_relay`.
- Guarded live adapter contract with isolated child session IDs and fail-closed
  child output normalization.
- Operator runbooks and workflow recipe docs.

## Verification

- `npm test` is the canonical local verification command.
- `scripts/validate-docs.mjs` checks required public docs and manifest shape.
- Fixture tests cover routing, auto-routing, full generation/dispatch/finalize,
  full command behavior, TaskFlow compile artifacts, lite mode, live dispatcher
  contracts, archive manifests, coordination failures, gate transitions,
  metrics, feedback, public API contracts, runtime wrapper behavior, native
  plugin command behavior, and the PC-offload smoke manifest contract.

## Privacy Boundary

Do not commit real live child outputs, local runtime state, private deployment
paths, Gateway config snippets, real chat IDs, account IDs, private hostnames,
or operator-specific evidence logs. Keep generated runtime outputs under
ignored `runs/` paths unless they are deliberately sanitized deterministic
fixtures.

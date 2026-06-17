# Roadmap

## V0 - Design Spine

- [x] Define the ReefNexus/ReefRelay naming split.
- [x] Document architecture, scope, routing patterns, and handoff contracts.
- [x] Add workflow recipes for incident triage, sensitive changes, code review,
      research-heavy work, lite mode, and TaskFlow-backed orchestration.

## V1 - Deterministic Runtime MVP

- [x] Add direct/lite/full routing fixtures.
- [x] Add full run generation, dispatch, finalization, and final synthesis.
- [x] Add lite-mode parsing and runtime wrapper.
- [x] Add TaskFlow-shaped compile artifacts for durable orchestration.
- [x] Add gate transition, metrics, feedback, archive, and coordination-failure
      regression checks.
- [x] Expose a stable public API from `src/reefrelay/index.mjs`.

## V1 Beta - Native Command And Live Adapter

- [x] Add `openclaw-runtime-plugin/` and `src/openclaw-plugin/index.mjs`.
- [x] Register `/reef_relay` with explicit `lite`, `full`, `live-lite`, and
      `live-full` modes.
- [x] Keep `/reef` unclaimed.
- [x] Require auth for native command execution.
- [x] Make live child dispatch opt-in, bounded, isolated by child session ID,
      and fail-closed on malformed child output.
- [x] Keep raw child output in artifacts and only surface normalized summaries.

## V2 - Public-Eligible Track

- [ ] Verify public install docs from a clean checkout.
- [ ] Decide package naming and release process.
- [ ] Decide artifact retention defaults for generated `runs/` output.
- [ ] Review trusted operator beta feedback and address blockers.
- [ ] Add CI once the public repo owns the generic product lane.
- [ ] Tag the first release only after the production-readiness checklist in
      `docs/RUNTIME_READY.md` is satisfied.

## Later

- Broaden routing quality fixtures.
- Add richer source-quality and freshness gates.
- Add optional UI/reporting around run artifacts.
- Integrate more deeply with durable TaskFlow job state when available.

# Runtime Ready

Scope: ReefRelay runtime-ready MVP closeout and public-safe operator guidance.
This is not a default-on production release. V1 is a guarded beta lane for
trusted operators; V2 is the first public-eligible track for broader packaging,
aliases, or rollout.

## Runtime-Ready MVP

ReefRelay is runtime-ready for intentional local operator use when the operator
invokes the project-local wrapper or stable API directly. It remains opt-in and
bounded by the operator gates in `docs/REEFRELAY_RUNBOOK.md`.

Supported paths:

- deterministic `lite`
- deterministic `full`
- explicit guarded `live-lite`
- explicit guarded `live-full`

Live modes require operator approval, bounded child lanes, isolated child
session IDs, raw child-result quarantine, and final acceptance by the
orchestrator.

## Quickstart

```bash
npm test
node skills/reef-relay/scripts/runtime-wrapper.mjs \
  --command '/reef_relay lite audit docs' \
  --out-dir runs/local-smoke/lite
node skills/reef-relay/scripts/runtime-wrapper.mjs \
  --command '/reef_relay full review wrapper behavior and verify tests' \
  --out-dir runs/local-smoke/full
```

## Production-Readiness Checklist

- [ ] operator approval starts production-readiness work for the target environment.
- [ ] trusted operator beta feedback has been reviewed.
- [ ] generated artifacts have a retention policy.
- [ ] public packaging and install instructions are verified from a clean checkout.
- [ ] live child dispatch has environment-specific authorization and resource guards.
- [ ] broad aliases and default-on behavior are explicitly approved.

## Known Limits

- Fixture and script tests are evidence, not final acceptance.
- Live child dispatch depends on the host OpenClaw runtime and configured agents.
- Long-running or human-waiting workflows should compile into TaskFlow-backed
  durable state rather than improvising ad hoc state.
- Runtime outputs may contain sensitive task context and should stay in ignored
  local paths unless intentionally sanitized.

## Acceptance Criteria

Runtime-ready means:

- docs explain the supported operator paths,
- deterministic `lite` and `full` tests pass,
- live adapter behavior fails closed,
- child output remains quarantined until normalized,
- final synthesis is gated by explicit acceptance,
- public docs do not depend on private deployment evidence.

# Beta Review

This document defines the V1 beta feedback lane for trusted operators. V2 is the first public-eligible track.

## Goals

- Confirm that `lite` mode is useful for short, low-risk orchestration.
- Confirm that `full` mode creates enough structure for multi-step work.
- Confirm that live modes are clearly opt-in and fail closed.
- Find confusing docs, weak summaries, missing guardrails, and setup gaps.

## Trusted Operators

Trusted operators have collaborator pull/view access to the repository or a
private deployment overlay before running beta workflows with real task data.
trusted operator feedback is required before any Public transition.

## Review Path

1. Read `README.md`, `docs/RUNTIME_READY.md`, `docs/RUNTIME_WRAPPER.md`, and
   `docs/REEFRELAY_RUNBOOK.md`.
2. Run `npm test`.
3. Run one deterministic `lite` wrapper smoke.
4. Run one deterministic `full` wrapper smoke.
5. Review generated summaries for accuracy, useful closeout, and artifact paths.
6. Record accepted findings, blockers, and follow-up tasks.

## Public Transition

Before broad packaging, aliases, or default-on behavior:

- V2 scope is agreed.
- trusted operator feedback is reviewed.
- private deployment overlays are separated from generic product code.
- public install docs are verified from a clean checkout.
- artifact-retention and privacy rules are documented.

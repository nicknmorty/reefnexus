# FALLBACK_MATRIX.md — Routing behavior for low-confidence/no-selection

This matrix defines expected ReefRelay behavior when routing is uncertain.

## Route outcomes

- `selected`: classifier selected a lane with acceptable confidence.
- `low_confidence`: a lane was selected but confidence is below threshold.
- `none_selected`: classifier could not select a lane.
- `classifier_error`: classifier failed.

## Default policy

| Outcome | Behavior | User-facing mode | Next action |
|---|---|---|---|
| selected | proceed | normal | execute contract |
| low_confidence | cautious proceed OR clarify | concise uncertainty | run clarifying question if risk-sensitive |
| none_selected | block for clarification OR default safe lane | explain ambiguity | ask one targeted clarifying question |
| classifier_error | fail closed | explicit blocked notice | retry once with bounded context; then escalate |

## Risk-class override

For `sensitive/destructive/config/security/public` requests:
- low_confidence => **do not execute risky action**; clarify or escalate.
- none_selected => **block + clarify**.
- classifier_error => **block + escalate**.

## Fallback lane policy

A default lane may be used only when:
- request is low-risk,
- user intent is broad but harmless,
- default lane has clear boundaries,
- and output is explicitly marked as provisional when uncertainty remains.

## Telemetry fields to capture

- routeOutcome
- confidence
- selectedLane
- fallbackUsed (bool)
- clarificationAsked (bool)
- escalationTriggered (bool)
- finalGateResult

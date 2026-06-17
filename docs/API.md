# ReefRelay API and contract boundaries

Phase 6 defines ReefRelay's reusable deterministic runtime spine as a small project-local library. The package is still private and pre-production, but callers no longer need to import CLI scripts directly.

## Stable import surface

Use either stable entry point:

```js
import * as ReefRelay from 'reefnexus';
// or
import * as ReefRelay from 'reefnexus/reefrelay';
```

These entry points are side-effect safe: importing them does not parse CLI args, read/write run artifacts, or assume a working-directory layout. File writes happen only when a caller passes output options such as `artifactDir` or `synthesisOut` to runtime functions.

## Public API groups

### Routing

- `routeRequest(input, options?)`
  - Deterministic direct/lite/full route selection.
  - Stable contract: returns route metadata including `mode`, `routeOutcome`, `confidence`, `riskClass`, `selectedLane`, `reasons`, and `expectedBehavior`.

### Lite command parsing and runtime

- `parseLiteCommand(command)`
- `compileLiteRun(brief, options?)`
- `dispatchLiteRun(run, options?)`
- `runLiteCommand(command, options?)`

Stable contracts:

- Lite runs have `mode: "lite"`, `lite.durableTaskflow: false`, bounded child lanes, orchestrator-owned decisions, persisted gates, and final `send`/`no-send` state.
- Child outputs are normalized to structured child results; malformed raw output is retained only as an artifact pointer and must not leak into synthesis.
- Read-only child lanes cannot mutate; any write-capable lite lane must remain orchestrator-owned.

### Full command parsing, generation, dispatch, and finalization

- `parseFullCommand(command)`
- `fullCommandRouting(goal, commandOptions?)`
- `compileFullCommand(command, options?)`
- `runFullCommandPipeline(command, options?)`
- `generateFullBrief(request, options?)`
- `compileFullRun(brief, options?)`
- `dispatchFullRun(run, options?)`
- `reviewFindings(run, options?)`
- `enforceGates(run, options?)`
- `createFinalSynthesis(run, options?)`
- `finalizeFullRun(run, options?)`
- `runFullPipeline(request, options?)`

Stable contracts:

- Full runs have `mode: "full"`, TaskFlow-shaped state, bounded child tasks, normalized child-result packets, explicit orchestrator finding decisions, gate records, and persisted final `send`/`no-send` decisions.
- `/reef_relay full` and `/skill reef-relay full` are operator overrides. They preserve auto-router evidence instead of hiding it.
- Risky immediate actions are rejected at parse time unless a future wrapper adds a separate confirmation gate.
- Final synthesis can only be created after safety, verification, final-acceptance, and final-decision state is persisted.

### Live dispatcher

- `dispatchLiveRun(run, options)`
- `loadLiveAdapter(adapterPath)`

Stable contracts:

- Live dispatch is opt-in and adapter-backed; deterministic dispatch remains the default fixture path.
- Adapters must return structured child-result packets. Timeouts and adapter errors are converted into blocked child results.
- Raw child packets are retained as artifacts and still pass through the same lite/full normalization, gate, and no-send behavior as deterministic dispatch.

### Metrics and feedback

- `collectRunMetrics(run, options?)`
- `annotateRunMetrics(run, options?)`
- `generateFeedbackFromRun(run, options?)`
- `generateFeedbackFromCoordinationCases(cases, options?)`
- `feedbackArtifact(events, options?)`

Stable contracts:

- Metrics are read-only derived summaries. They do not mutate routing/gate policy unless the caller explicitly persists the annotated run returned by `annotateRunMetrics`.
- Feedback events are advisory-only and cannot directly change routing, gate, or policy behavior.

## Internal implementation surface

`reefnexus/reefrelay/internal` re-exports the current deterministic implementation modules for local tests/wrappers that need lower-level access. It is **not** a stability promise. Prefer the public API above unless you are editing ReefRelay itself.

Current CLI files under `scripts/` remain executable for fixtures and operator smoke tests. Treat them as wrappers/implementation details, not as the import contract for new callers.

The private/local runtime wrapper lives at `skills/reef-relay/scripts/runtime-wrapper.mjs`. It calls the stable public API, writes predictable operator artifacts, and is the preferred local AgentSkill bridge until a future native command/plugin route exists. Phase 8 adds opt-in live dispatch through `--dispatcher live --adapter <module>` while keeping deterministic dispatch as the default.

## Migration notes

- Replace direct imports from `scripts/reefrelay-auto-router.mjs` with `routeRequest` from `reefnexus`.
- Replace direct imports from `scripts/reefrelay-taskflow-stub.mjs` with `compileFullRun` from `reefnexus`.
- Replace direct imports from runtime/finalizer/metrics/feedback scripts with the same-named public functions from `reefnexus` where available.
- Keep CLI invocations for deterministic fixtures and manual smoke commands; do not build new wrappers around shelling out to scripts when a public function exists.
- For local OpenClaw invocation, prefer `skills/reef-relay/scripts/runtime-wrapper.mjs` or the package-local `reef-relay-runtime` bin over direct script imports.

## Compatibility checks

`npm test` includes `scripts/test-public-api-contract.mjs`, which verifies:

- root and `reefnexus/reefrelay` exports match,
- expected API groups are importable without CLI side effects,
- lite and full public pipelines preserve fixture behavior,
- metrics and feedback accept public run artifacts,
- final synthesis artifacts are still written only when requested,
- the runtime wrapper smoke-tests lite/full command paths and artifact output,
- the live dispatcher contract test covers fake live children, timeout blocking, lane limits, and wrapper live-mode metadata.

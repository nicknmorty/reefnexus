# SLASH_COMMANDS.md — ReefRelay command surface

ReefRelay's primary path is automatic orchestration behavior. Slash commands are a secondary/manual invocation path for operators who want to trigger or steer the same process explicitly.

## Current skill-command target

The skill name is `reef-relay`, which OpenClaw sanitizes as a direct skill command:

```text
/reef_relay <args>
```

Portable fallback:

```text
/skill reef-relay <args>
```

## Current capability

The repo currently defines deterministic command paths for:

- `/reef_relay lite <goal>` / `/skill reef-relay lite <goal>` — compile and run bounded lite dispatch with normalized child outputs, finding decisions, gates, and final synthesis.
- `/reef_relay full <goal>` / `/skill reef-relay full <goal>` — explicit operator override into the proven full run generator, TaskFlow compile stub, dispatcher, finalizer, and final synthesis contracts.

Deterministic `lite`/`full` uses mock child runners for contract validation and routine smokes. Opt-in `live-lite`/`live-full` uses the guarded OpenClaw CLI live adapter for bounded real child dispatch when explicitly requested; see `docs/RUNTIME_WRAPPER.md` and `docs/NATIVE_COMMAND.md`.

## Command paths

- **Primary product path:** automatic direct/lite/full routing and full ReefRelay engagement when task shape warrants it.
- **Explicit path:** `/reef_relay lite <goal>` and `/reef_relay full <goal>` for bounded runs, plus opt-in `live-lite`/`live-full` for guarded live operator testing.

## Commands

### `/reef_relay lite <goal>`

Selects ReefRelay lite mode for bounded orchestration when the skill is available to the active agent.

Equivalent intent:

```text
Use ReefRelay lite mode for: <goal>
```

Intended behavior once runtime dispatch exists:

- classify the request against lite-mode heuristics,
- split into 1–4 narrow child lanes when helpful,
- default child lanes to read-only,
- require child outputs to follow the lite child-result schema,
- require orchestrator accept/reject/defer decisions before mutation,
- produce one normalized final response.

Current lite runtime behavior:

- reads either a structured lite brief JSON or a slash-command string,
- parses `/reef_relay lite <goal>` and `/skill reef-relay lite <goal>` deterministically,
- supports minimal command options: `--pattern`, `--risk`, `--mutation-policy`, `--owner-session`, and `--read-only`,
- validates lite risk/pattern/lane/mutation constraints,
- dispatches child lanes through deterministic or explicit guarded live runtime paths,
- normalizes child-result packets, records accept/reject/defer finding decisions, evaluates safety/verification/final-acceptance gates, and writes final synthesis artifacts.

Examples:

```text
/reef_relay lite audit docs for stale project status references
/reef_relay lite --read-only find memory cleanup candidates without editing files
/skill reef-relay lite --pattern hierarchical --risk sensitive "check safe config drift"
```

Local deterministic parser smoke test:

```bash
node scripts/reefrelay-lite-stub.mjs --command '/reef_relay lite --read-only audit docs for stale status' --out /tmp/reef-lite-command.json
```

### `/reef_relay audit --read-only --parallel <goal>`

Planned ergonomic wrapper for lite mode. It should compile to:

```text
/reef_relay lite <goal>
```

with:

- `pattern: concurrent`,
- `mutationPolicy: orchestrator-only`,
- child `mutationAllowed: false`.

## Full-mode command

```text
/reef_relay full <goal>
/skill reef-relay full <goal>
```

This is a secondary/operator-override surface, not the main product path. It triggers the same underlying process as automatic full mode: TaskFlow compile contract, child-result normalization, finding decisions, gates, final acceptance, and final synthesis. It is available for private operator/trusted-beta testing; public/broad use remains blocked.

Operator override rules:

- The command itself provides clear operator intent, but the run still records what automatic routing would have selected.
- `run.routing.operatorOverride` is `true`, `selectedLane` is `full-command-operator-override`, and `autoSelection` preserves the original route evidence.
- Missing goals, unsupported options, and risky immediate actions such as “delete secrets now” are rejected before run generation.
- Raw worker output is retained only as artifacts and must not leak into final synthesis.

Supported options:

```text
--pattern sequential|concurrent|handoff|group-chat|magentic|hierarchical|hybrid
--risk normal|sensitive|destructive|security|config|public
--owner-session current|session:<id>
```

Local deterministic smoke tests:

```bash
node scripts/reefrelay-full-command.mjs --command '/reef_relay full implement operator controls, review route evidence, and verify tests' --out /tmp/reef-full-command.json
node scripts/reefrelay-full-command.mjs --command '/reef_relay full implement operator controls, review route evidence, and verify tests' --out-dir /tmp/reef-full-command-run
```

## Future short alias

The nicer command is:

```text
/reef lite <goal>
```

That requires runtime plugin command registration or a packaged command alias. A plain AgentSkill can reliably expose `/reef_relay`, but it should not claim `/reef` until a plugin registers that command.

## Auto-routing relationship

Slash commands and automatic behavior should use the same policy:

- lite slash command: explicit lightweight operator selection,
- auto-routing: choose direct/lite/full based on task shape and risk,
- full slash command: explicit private operator override after automatic full mode is stable,
- all modes: same lane contracts, child-result schema, classification states, gates, and final acceptance.

## Private/local wrapper

For local OpenClaw/AgentSkill operation, use the wrapper rather than older implementation scripts directly:

```bash
node skills/reef-relay/scripts/runtime-wrapper.mjs --command '/reef_relay lite audit docs' --out-dir runs/wrapper-smoke/lite
node skills/reef-relay/scripts/runtime-wrapper.mjs --command '/reef_relay full review wrapper behavior and verify tests' --out-dir runs/wrapper-smoke/full
```

The wrapper writes `final-run.json`, `final-synthesis.md`, `wrapper-summary.md`, `metrics.json`, `feedback.json`, and quarantined child artifacts under the requested output directory.

## Native command notes

OpenClaw exposes user-invocable skills as native commands when `commands.nativeSkills` is enabled for the provider. Text command fallback remains available even when native menus are stale or unavailable. ReefRelay's runtime-only plugin package registers `/reef_relay` for trusted-beta testing, including deterministic `lite`/`full` and explicit bounded `live-lite`/`live-full`. ReefRelay still does not claim a `/reef` alias.

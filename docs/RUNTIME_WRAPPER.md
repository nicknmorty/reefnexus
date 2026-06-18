# Runtime wrapper

ReefRelay ships as a **project-local library plus AgentSkill wrapper**, with a native `/reef_relay` OpenClaw plugin command. The native command is the preferred visible command surface; the wrapper remains the shell/API fallback and artifact-producing layer.

## Decision

Use the stable API from `src/reefrelay/index.mjs` as the library boundary. The runtime wrapper remains the shell/API fallback and artifact-producing implementation layer:

```bash
node skills/reef-relay/scripts/runtime-wrapper.mjs --command '/reef_relay lite <goal>' --out-dir runs/wrapper-smoke/lite
node skills/reef-relay/scripts/runtime-wrapper.mjs --command '/reef_relay full <goal>' --out-dir runs/wrapper-smoke/full
```

Equivalent mode/goal form:

```bash
node skills/reef-relay/scripts/runtime-wrapper.mjs --mode lite --goal '<goal>' --out-dir <dir>
node skills/reef-relay/scripts/runtime-wrapper.mjs --mode full --goal '<goal>' --out-dir <dir>
```

The private package also declares a local bin name, `reef-relay-runtime`, for future `npm link`/local install use. This is **not** a publication or production rollout.

## Rationale

- **Skill-only** would be too thin: it would force agents to reimplement wrapper logic or shell directly to older scripts.
- **Project-local library plus AgentSkill wrapper** is the smallest useful runtime shape: the wrapper calls the stable API, writes predictable artifacts, and keeps OpenClaw invocation local/private.
- **Native OpenClaw command registration** is implemented for private trusted-beta testing through the project-local runtime plugin. This is not public/default rollout: broad enablement, aliases, packaging, release tags, or public docs still require separate operator approval.

## Migration cost

- The native OpenClaw plugin/command now wraps this same API surface; future command changes should keep the wrapper/API call shape stable and replace only command registration/routing details.
- If the package later publishes, the wrapper can move from private bin to public bin after production readiness is separately approved.
- Existing deterministic scripts remain fixture/implementation tools; shell callers should prefer this wrapper or the stable API, while visible trusted-beta command-surface tests should prefer `/reef_relay live-lite` or `/reef_relay live-full`.

## Command scope

Supported private/local command inputs:

- `/reef_relay lite <goal>`
- `/skill reef-relay lite <goal>`
- `/reef_relay full <goal>`
- `/skill reef-relay full <goal>`

No `/reef` alias is claimed. That requires a real command/plugin route in a later phase.

## Outputs

For each run, the wrapper writes:

- `final-run.json` — final run artifact.
- `final-synthesis.md` — API-generated synthesis artifact.
- `wrapper-summary.md` — small operator-readable summary.
- `wrapper-result.json` — wrapper metadata and summary pointer.
- `metrics.json` — derived run metrics.
- `feedback.json` — advisory feedback events.
- `artifacts/` — raw child-result quarantine artifacts.

Full mode also writes `brief.json`, `generated-run.json`, and `dispatched-run.json` to preserve route/run-generation evidence.


## Live dispatcher

Deterministic/mock dispatch remains the default. A guarded live-child path is available only when explicitly requested:

```bash
node skills/reef-relay/scripts/runtime-wrapper.mjs \
  --mode lite \
  --goal 'read-only live smoke' \
  --dispatcher live \
  --adapter skills/reef-relay/adapters/openclaw-cli-live-adapter.mjs \
  --agent default-agent \
  --out-dir runs/live-smoke/lite
```

Test/demo adapter for deterministic contract coverage:

```bash
node skills/reef-relay/scripts/runtime-wrapper.mjs \
  --mode lite \
  --goal 'fake live wrapper contract smoke' \
  --dispatcher live \
  --adapter skills/reef-relay/adapters/fake-live-adapter.mjs \
  --out-dir runs/live-smoke/fake-lite
```

Live adapter contract: an adapter module must export `spawnChildTask(input)` and return one structured child-result packet with `taskId`, `status`, `summary`, `findings`, `blockers`, and `assumptions`. Lite findings must include `risk` and `doNotMutate:true`; full findings must include `severity`.

Guardrails:

- `--dispatcher live` is opt-in; omitting it uses deterministic/mock dispatch.
- `--adapter <module>` is required for live mode. The OpenClaw CLI adapter defaults to `--agent default-agent` unless `--agent <id>` or `REEFRELAY_LIVE_AGENT` overrides it.
- `--timeout-ms <ms>` bounds each child; timeout becomes a blocked child result and final no-send.
- `--max-child-lanes <n>` rejects oversized runs before spawning children.
- Raw child packets are always retained under `artifacts/` and normalized through the existing gates; malformed raw output is quarantined and blocked/failed instead of being sent as product.
- Resume/retry can reuse previous successful child results only when the live prompt/context fingerprint matches; blocked/failed lanes can be respawned with `--resume-from <final-run.json> --retry-blocked`.
- For read-only dogfood/code-review tasks, pass enough evidence in the goal or via `--context-file <path>`; live children should block rather than invent findings when they lack inspectable context.

Rollback/fallback: rerun the same command without `--dispatcher live` to use deterministic dispatch, or switch the adapter back to `skills/reef-relay/adapters/fake-live-adapter.mjs` for contract-only smoke coverage. The OpenClaw CLI adapter is opt-in: acceptable for low-risk smokes with supplied context, but not default-on behavior.

## Verification

`npm test` includes `scripts/test-runtime-wrapper.mjs`, which smoke-tests lite and full wrapper paths, and `scripts/test-live-dispatcher.mjs`, which verifies the fake live adapter, timeout/no-send handling, max-child-lane enforcement, persisted raw artifacts, and wrapper live-mode metadata.

## Boundaries

- Deterministic/mock dispatch remains the default; live dispatch is opt-in and guarded.
- No broad command alias claims.

# Native Command

Status: native-command readiness is implemented for guarded beta testing. This
is not a default-on rollout.

## Command Contract

The OpenClaw plugin registers one authenticated command through
`api.registerCommand`:

```text
/reef_relay help
/reef_relay lite <goal>
/reef_relay full <goal>
/reef_relay live-lite <goal>
/reef_relay live-full <goal>
```

`requireAuth: true` is mandatory. No `/reef` alias is claimed.

## Runtime Package

The runtime-only package lives in `openclaw-runtime-plugin/`. Install from a
checkout when intentionally testing:

```bash
openclaw plugins install --link ./openclaw-runtime-plugin
```

Installing or linking the runtime-only package may update plugin registry state,
but it does not approve broad rollout, release tags, default-on routing, or
extra aliases by itself.

## Output And Artifacts

Deterministic runs write artifacts under:

```text
runs/native-command/<timestamp>-<mode>/
```

Live beta runs write artifacts under:

```text
runs/native-command-live/<timestamp>-live-<mode>/
```

Generated artifacts may contain sensitive task context. Keep them ignored unless
they are intentionally sanitized fixtures.

## Safety Posture

- Native command output is a concise summary, not raw child output.
- Raw child output is quarantined in artifacts and normalized before use.
- Live dispatch is explicit and bounded by lane/time/resource controls.
- Final acceptance still belongs to the orchestrator; tests and command output
  are evidence, not product approval by themselves.
- Broad aliases, package releases, and default-on behavior require a separate
  production-readiness decision.

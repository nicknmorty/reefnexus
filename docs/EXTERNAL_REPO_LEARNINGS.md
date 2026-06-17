# EXTERNAL_REPO_LEARNINGS.md

## Reviewed: `t1seungy/multi-agent-orchestrator`

Review timestamp: 2026-05-12

### What it is

- Repository is a forked snapshot, not primary active origin.
- README indicates project was renamed/moved to **Agent Squad** (`awslabs/agent-squad`).
- Contributor/commit signal suggests this fork is mainly a reference mirror rather than original implementation work by this owner.

### Useful learnings carried into ReefNexus

1. **Classifier-first routing**
   - Route based on intent/context to best specialist, not fixed lane by default.

2. **Supervisor orchestration pattern**
   - A lead coordinator can delegate to multiple specialists and synthesize one coherent output.

3. **Context-aware routing**
   - Agent selection should incorporate conversation history, not only the latest message.

4. **Streaming abstraction**
   - Orchestration layer should normalize streaming and non-streaming agent responses.

5. **Pluggable agent model**
   - Keep agent interfaces modular so providers and specialist roles can swap without major orchestrator rewrites.

6. **Examples as adoption engine**
   - Concrete end-to-end workflow examples accelerate adoption more than abstract architecture docs.

### Cautions for ReefNexus

- Do not confuse README polish with production operating rigor.
- Preserve ReefRelay’s hard gates (safety, verification, final acceptance) even when classifier confidence is high.
- Keep diagnostics and user-facing output separation strict.

### Next source of truth

- Upstream project moved again and is now actively maintained at `2FastLabs/agent-squad`.
- ReefNexus decisions should rely on active upstream behavior and docs, not stale fork snapshots.

## Reviewed upstream: `2FastLabs/agent-squad` (formerly `awslabs/agent-squad`)

Review timestamp: 2026-05-12

### What stands out

1. **Mature orchestrator primitives**
   - Clear split across orchestrator, classifier, agents, storage, and retrievers.
   - Good conceptual parity with ReefNexus control/coordination/execution layers.

2. **SupervisorAgent pattern is first-class**
   - Explicit agent-as-tools model.
   - Parallel delegation with a lead coordinator.
   - Multi-tier memory model for user↔lead and lead↔team context.

3. **Classifier architecture is configurable and testable**
   - Multiple classifier backends.
   - Explicit default/fallback behavior when no agent is selected.
   - Direct classifier test methods encourage routing quality checks.

4. **Storage abstraction is treated as core, not optional**
   - Stable keys (`userId`, `sessionId`, `agentId`) and pluggable backends.
   - This aligns with ReefRelay’s run-state and handoff artifact requirements.

5. **Dual implementation discipline (Python + TypeScript)**
   - Feature parity expectation and mirrored tests are part of project culture.
   - Strong signal for keeping contracts explicit and implementation-independent.

6. **Contribution/CI hygiene is explicit**
   - Issue-first PR policy, independent language CI, lint/test gates, and link checks.
   - Good model for ReefNexus governance as the project grows.

### Adapt for ReefNexus (adopt)

- Keep **orchestrator/classifier/worker/storage** boundaries explicit.
- Add a dedicated **ReefRelay supervisor mode** profile for complex delegated tasks.
- Preserve configurable **fallback behavior** when routing confidence is low.
- Strengthen **routing tests** (classifier-only and end-to-end route paths).
- Treat **state/storage contracts** as versioned interfaces, not implementation details.

### Adapt with caution (avoid blind copy)

- Do not rely on classifier confidence alone for send/no-send.
- Do not weaken hard safety/verification/final-acceptance gates for convenience.
- Do not let memory growth become unbounded; enforce trimming/retention policy.
- Do not overfit to one provider stack; keep provider-agnostic role contracts.

### ReefNexus action items from upstream review

1. Add a "Supervisor Mode" section to ReefRelay docs (lead + team + memory boundaries).
2. Define fallback behavior matrix for low-confidence/no-selection routes.
3. Add routing-quality tests to planned Phase 1 artifacts.
4. Formalize state key schema (`runId`, role/task IDs, artifact pointers, gates).

## Reviewed article: Claude Flow / Ruflo guide (Pasquale Pillitteri)

Source reviewed: https://pasqualepillitteri.it/en/news/774/claude-flow-ruflo-multi-agent-orchestration-guide
Review timestamp: 2026-05-12

### What’s useful

1. **Topology selection as first-class decision**
   - Mesh, hierarchical, ring, star pattern framing is practical.
   - Matches ReefRelay pattern-selection requirements.

2. **Supervisor + specialist decomposition**
   - Strong alignment with ReefNexus lead/specialist model.
   - Reinforces explicit role lanes and delegation contracts.

3. **Workflow modes (e.g., TDD-first/SPARC-like lanes)**
   - Suggests value in predefined orchestration presets per task class (API, refactor, test hardening, docs).

4. **Operational hooks**
   - Pre/post-task hooks pattern is useful for enforced lint/test/build gates and branch hygiene.

5. **Multi-provider strategy**
   - Practical cost/latency optimization: assign model/provider by role.

### What to treat cautiously

- Performance/benchmark claims (solve rates, speedups, token savings) should be treated as marketing unless independently reproduced.
- "Self-learning" claims need careful validation and guardrails to avoid opaque behavior.
- Mesh-heavy patterns can inflate cost/context traffic; ReefRelay should prefer bounded/hierarchical defaults.

### ReefNexus takeaways from this article

- Keep topology choice explicit in every run contract.
- Add preset workflow templates (TDD, refactor, API, docs).
- Add hook-ready runbook guidance (pre-task lint, post-task test/build, on-error logging).
- Preserve hard send/no-send gates regardless of routing confidence.
- Track our own benchmark data before adopting external performance claims.

## Reviewed upstream repo: `ruvnet/ruflo`

Source reviewed: https://github.com/ruvnet/ruflo
Review timestamp: 2026-05-12

### Snapshot

- Public, active repo with high velocity and large adoption signal.
- Reported metadata at review time: ~49k stars, ~5.5k forks, updated/pushed today.
- README frames two install modes (lite plugin path vs full CLI/runtime path) and is explicit that capability surface differs heavily by path.

### What’s useful for ReefNexus

1. **Install-path clarity**
   - Their split between plugin-only vs full runtime is operationally important.
   - ReefNexus should document capability tiers explicitly (what works in "lite" vs "full").

2. **Capability modularity**
   - Plugin architecture with domain packs (security, docs, testing, memory, workflows) mirrors how teams adopt incrementally.
   - ReefRelay should keep module boundaries sharp so teams can adopt coordination features in stages.

3. **Federation as a distinct concern**
   - Cross-machine/cross-trust-boundary collaboration is treated as first-class, not bolted on.
   - For ReefNexus, federation should be a separate phase with strict security and audit constraints.

4. **Run-time observability + cost tracking**
   - They emphasize execution visibility and cost tooling.
   - ReefNexus should retain run telemetry as a core surface, not optional polish.

5. **Methodology presets**
   - Built-in workflow/methodology packs suggest value in opinionated presets.
   - ReefRelay should define presets for common operating patterns (investigate/fix/review, docs pass, release prep, etc.).

### Cautions and anti-copy notes

- The repo is broad and marketing-heavy; avoid importing complexity as default.
- Keep ReefNexus focused on reliable orchestration behavior before large plugin breadth.
- Claims around autonomous self-learning and huge speedups should not drive design without local validation.
- Large tool/plugin surfaces increase failure modes; strict gates and bounded contracts remain essential.

### ReefNexus action items from Ruflo repo review

1. Add a **Capability Tiers** section (lite vs full runtime behavior).
2. Add **Preset Workflow Profiles** to runbook docs.
3. Add **Telemetry Baseline** requirements (route outcome, retries, gate failures, manual edits, latency).
4. Keep federation explicitly in a later phase with security-first scope.

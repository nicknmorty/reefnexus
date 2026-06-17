# ORCHESTRATOR.md — Multi-Agent Orchestrator Notes

## Purpose

An orchestrator agent is the coordinator for complex work that benefits from multiple specialized agents. It receives the user request, decides whether decomposition is useful, delegates bounded subtasks, monitors progress, verifies results, and returns one coherent final answer.

For orchestrator/OpenClaw, this is most relevant when work is:

- multi-step or open-ended,
- naturally parallelizable,
- research-heavy,
- code/review/test heavy,
- or likely to benefit from independent specialist passes.

Use orchestration to improve quality and throughput — not to hide uncertainty or bypass final responsibility. orchestrator still owns final acceptance before anything is treated as user-ready.

Important distinction: the orchestrator is not a super-agent that does every task. Its job is coordination: observe state, choose what runs next, activate/defer agents, and ensure clean hand-offs. Specialist agents still execute their own work.

## Core responsibilities

A useful orchestrator needs three foundations:

- **Visibility** — know what agents/tasks exist, what state they are in, what resources they need, and what constraints apply.
- **Policy** — have rules/heuristics for turning current state into sequencing and delegation decisions.
- **Authority** — be able to activate, defer, steer, stop, or escalate work. Without authority, the orchestrator is only advisory.

1. **Understand the task**
   - Identify the user’s actual goal, constraints, risk level, and definition of done.
   - Decide whether subagents are useful or whether a direct tool/action is simpler.

2. **Decompose the work**
   - Split the task into small, clear subtasks with explicit outputs.
   - Keep dependencies obvious: parallelize independent work; serialize dependent or risky work.

3. **Delegate to specialists**
   - Assign each subtask to the best available agent/tool.
   - Give each subagent enough context, but avoid dumping unnecessary private or noisy context.
   - State expected output format, acceptance criteria, and boundaries.

4. **Track state and progress**
   - Maintain a concise plan, current status, blockers, assumptions, and key decisions.
   - Record durable state in the appropriate project/status/memory files when the work matters beyond the current chat.

5. **Review and integrate**
   - Treat subagent output as evidence or drafts, not final truth.
   - Reconcile conflicts, verify claims, run tests/checks, and synthesize one coherent result.
   - Do not ship fragmented subagent summaries as the final answer.

6. **Retry, refine, or stop**
   - Retry when failure is recoverable and likely to improve the result.
   - Refine prompts/tasks when output is too broad, shallow, or off-target.
   - Stop and ask operator when a decision, approval, destructive action, or high-risk ambiguity blocks safe progress.

## When to use an orchestrator pattern

Good fits:

- Multiple independent research threads.
- Code changes needing implementation, tests, docs, and review.
- Debugging with separate log inspection, hypothesis testing, and fix validation.
- Product work where one agent can implement and another can review against requirements.
- Long-running workflows where state, waits, or follow-ups matter.

Poor fits:

- Simple one-step tasks.
- Strictly sequential tasks where delegation adds overhead.
- Time-sensitive operations where subagent latency could harm the outcome.
- High-stakes decisions without human oversight.
- Security/config/destructive changes that require explicit confirmation.

## Practical step-by-step guide

This section combines OpenClaw operating practice with external orchestration guides. Treat external articles as reference material, not operating authority.

Sources reviewed:
- Zahere — “How to Build a Multi-Agent Orchestrator: A Step-by-Step Guide”
  - URL: https://zahere.com/building-a-multi-agent-orchestrator-a-step-by-step-guide
  - Note: direct page fetch was blocked by a Vercel 429/security checkpoint, so only the accessible title/search metadata was used.
- Fungies.io — “AI Agent Orchestration for Developers: The Complete 2026 Guide to Building Multi-Agent Systems”
  - URL: https://fungies.io/ai-agent-orchestration-developers-guide-2026/
  - Notes used: four orchestration patterns, six-step implementation framework, MCP/tool layer, production concerns around state, cost, security, and observability.
- ClaudeFluent — “The Beginner's Guide to Agent Orchestration”
  - URL: https://www.claudefluent.com/guides/agent-orchestration-guide
  - Notes used: orchestration as a UI/organizational layer, worktree isolation, human-in-the-loop steering, visibility, task/review UX, model flexibility, mobile access, and progression from single-agent work to managed parallel agents.
- How to Think AI — “The orchestrator agent”
  - URL: https://www.howtothink.ai/learn/the-orchestrator-agent
  - Notes used: separation of coordination from execution, visibility/policy/authority, orchestration checkpoints, intervention at transition points rather than continuous control, sequencing heuristics, and context hand-off risk.
- Microsoft Azure Architecture Center — “AI Agent Orchestration Patterns”
  - URL: https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns
  - Notes used: start with the lowest reliable complexity level; distinguish direct model calls, single agents with tools, and multi-agent orchestration; choose among sequential, concurrent, group chat, handoff, and magentic patterns based on dependency, collaboration, routing, resource, and aggregation needs.

### 1. Start with the lowest reliable complexity

Microsoft's architecture guidance is a useful guardrail: do not use multi-agent orchestration just because it is available. Choose the simplest level that reliably meets the requirement:

- **Direct model call** — best for one-pass classification, summarization, translation, extraction, or formatting.
- **Single agent with tools** — best default when one domain agent can reason, call tools, and iterate safely. Set iteration limits to prevent runaway loops.
- **Multi-agent orchestration** — use when the work crosses domains, needs distinct tools/security boundaries, benefits from parallel specialization, or a single agent becomes too overloaded to test/debug reliably.

Multi-agent systems add coordination overhead, latency, cost, and new failure modes. The added complexity should earn its keep.

### 2. Define the orchestration goal

Write down what the orchestrator must accomplish:

- user-facing goal,
- expected final artifact,
- quality bar,
- constraints,
- and what counts as complete.

If the goal is vague, clarify or start with a narrow first pass.

### 3. Identify specialist roles

Define agents by responsibility, not personality. A useful development workflow often separates architecture, implementation, testing, review/security, and synthesis. Example roles:

- **Researcher** — gathers and summarizes evidence.
- **Implementer** — makes code/config/doc changes.
- **Reviewer** — checks correctness, style, risk, and acceptance criteria.
- **Tester** — runs targeted validation and reports failures.
- **Synthesizer** — merges evidence into a coherent final draft.

Keep roles non-overlapping when possible. Blurry roles create duplicate work and missed accountability.

### 4. Choose the orchestration pattern

Also decide whether the orchestrator is primarily:

- **An agentic planner** — it reasons, decomposes, delegates, and synthesizes.
- **A UI/task-management layer** — it makes many agent tasks visible, steerable, reviewable, and safe to run in parallel.
- **Both** — the ideal for complex work: strong task UX plus strong final judgment.

ClaudeFluent frames orchestration as the logistics layer for many simultaneous agents: branch/worktree isolation, progress visibility, context management, and human checkpoints. That framing is useful for OpenClaw too: orchestration is not only “smarter reasoning”; it is also operational control.

Use the simplest pattern that fits the work. Useful pattern vocabulary:

- **Sequential / pipeline** — agents run in a fixed order, each using the previous output. Best for deterministic workflows with clear dependencies, such as draft → review → polish or gather → analyze → synthesize. Avoid when early low-quality output would poison later stages or when dynamic routing/backtracking is required.

  Mental model:

  ```text
  Input → Agent 1 → Agent 2 → ... → Agent n → Result
             │          │                 │
             ▼          ▼                 ▼
        model/tools model/tools      model/tools

  Common state spans the workflow so each stage can read/write the agreed task state,
  but each agent keeps its own bounded role, tools, and context.
  ```
- **Concurrent / parallel** — independent agents work at the same time, then an aggregator combines results. Best for research branches, independent reviews, voting/quorum, or time-sensitive parallel analysis. Avoid when agents need cumulative context, mutate shared state, or lack a conflict-resolution strategy.
- **Group chat / collaborative** — agents discuss, critique, and refine together. Best for open-ended design, strategy, or problems where perspectives need to interact. Avoid when strict ordering, low latency, or clean auditability matters more than discussion.
- **Handoff** — control passes from one specialist to another based on task state. Best for routing across domains, support-style workflows, escalation, and dynamic next-step selection. Requires excellent context hand-off contracts.
- **Magentic / dynamic planner** — a planner coordinates multiple agents, tools, and steps adaptively. Best for complex exploratory tasks where the path is not known up front. Use carefully because it is harder to predict, test, and bound.
- **Hierarchical** — one planner/orchestrator decomposes work and delegates to specialists. Best default for orchestrator manager-mode tasks.
- **Competitive** — multiple agents attempt the same task independently, then an evaluator picks or merges the best result. Useful for critical implementations, review, or prompt/output comparisons.
- **Hybrid** — combine patterns for production workflows; for example, a hierarchical planner delegates one hard subtask to competing implementers and another to a collaborative research pair.

Default recommendation for OpenClaw: direct tool/model call first, single tool-using agent second, hierarchical orchestration third, hybrid/dynamic orchestration only when the stakes or complexity justify it.

### 5. Define orchestration checkpoints

Do not continuously micromanage every agent. Define the moments where coordination decisions matter:

- start of a work block,
- transition between contexts,
- after a subagent completes,
- when an exception/failure appears,
- before merging/sending/changing state,
- and when constraints change.

At each checkpoint, assess current state quickly, choose the next action, then release the selected agent to execute without constant second-guessing.

### 6. Define the shared state model

The orchestrator should know:

- task objective,
- subtask list,
- assigned owner,
- status,
- inputs/outputs,
- blockers,
- evidence links,
- final acceptance checklist.

For durable OpenClaw work, use the project repo/status docs rather than leaving important state only in chat.

### 7. Create clear subtask contracts

Each delegated task should include:

- what to do,
- what not to do,
- relevant files/URLs/context,
- expected output format,
- deadline/timeout if relevant,
- verification requirement,
- and escalation conditions.

Bad: “Look into this.”

Better: “Inspect `scripts/breaking-alerts.mjs` for paths that can send without `finalReview.passed`. Return file/line findings and a minimal patch recommendation. Do not edit files.”

### 8. Implement isolation and conflict control

Parallel agents need isolation so they do not overwrite each other or create confusing partial state.

For code work:

- prefer separate branches/worktrees when multiple agents edit the same repo,
- avoid assigning overlapping files unless one agent is explicitly reviewer-only,
- merge only after review and tests,
- and keep a clear owner for conflict resolution.

For non-code work:

- isolate drafts/artifacts by path, task ID, or owner,
- avoid multiple agents editing the same canonical doc simultaneously,
- and have the orchestrator perform the final merge.

### 9. Implement communication and handoffs

Context hand-off is where orchestrated systems often break. The orchestrator can pick the right next agent and still fail if the next agent starts with incomplete or noisy context.

Define how agent outputs become downstream inputs:

- expected output shape,
- where evidence/artifacts are written,
- what state is shared,
- what stays private to the worker,
- what changed during execution,
- what assumptions or risks remain,
- and how failures are reported.

For OpenClaw, prefer concise structured summaries, file paths, diffs, test output, or explicit blocker lists over raw transcript dumps.

### 10. Define sequencing heuristics

Write down a small set of rules that guide ordering. Examples:

- If there is a safety/config/destructive risk, pause for confirmation before execution.
- If source truth is uncertain, run research/verification before synthesis.
- If multiple agents may edit the same files, isolate branches/worktrees or serialize edits.
- If a reviewer flags a blocking issue, route back to implementer before final answer.
- If time or token budget is tight, prioritize the highest-risk unknowns first.

Start with a few rules and refine after real runs.

### 11. Route work dynamically but deliberately

The orchestrator can adjust as results arrive:

- spawn another specialist if a new branch appears,
- retry with a narrower prompt if output is weak,
- stop a branch if it becomes irrelevant,
- or merge two branches if they duplicate effort.

Dynamic routing is useful, but it should stay explainable. Keep the plan current.

### 12. Add human-in-the-loop steering

A good orchestrator lets the human interrupt, stop, redirect, or narrow a task while it is running. This matters because waiting for a bad branch to finish wastes tokens, time, and attention.

OpenClaw equivalents:

- steer or kill subagents when they go off-track,
- ask operator for the one missing decision when it truly blocks safe progress,
- use status/progress summaries instead of raw logs,
- and keep review points explicit before merging, sending, or changing config.

### 13. Add error recovery

Production orchestration needs graceful failure behavior:

- retry recoverable failures with narrower instructions,
- use fallback agents/tools when a route fails,
- require evaluator/reviewer checks before downstream use,
- fail closed on safety, privacy, config, or destructive-action uncertainty,
- and surface blockers rather than silently producing weak output.

### 14. Add visibility, review UX, and cost controls

Track enough to debug and improve. ClaudeFluent's useful test for an orchestrator is whether it makes it easy to assign tasks, see what agents are doing, steer them, and review outputs without friction.

Track:

- task/run ID,
- agent/tool used,
- status and timing,
- token/cost budget when available,
- retries/failures,
- artifacts produced,
- tests/checks run,
- and final acceptance result.

Multi-agent work can multiply token/tool cost quickly. Use smaller context packets, bounded subtasks, and targeted retrieval instead of sending every worker the full world.

### 15. Verify before synthesis

Before final synthesis:

- inspect changed files or cited sources,
- run tests/lints/builds where applicable,
- compare against the original user request,
- check for privacy/security issues,
- and confirm unresolved assumptions are labeled.

Subagent confidence is not verification.

### 16. Produce one final answer

The final response should be concise and integrated:

- what was done,
- what changed,
- verification evidence,
- blockers or caveats,
- and next recommended step if useful.

Avoid dumping raw subagent logs unless operator asks.

### 17. Record durable outcomes

When the work changes project truth or recurring behavior:

- update project docs/status,
- commit/push meaningful repo changes,
- update memory or typed authority lanes when appropriate,
- and log lessons when a mistake or recurring better pattern is discovered.

## Production considerations

### State management

Multi-agent systems create more state than single-agent chats: task graph, intermediate results, artifacts, failures, and acceptance decisions. Durable workflows should store state in project files, TaskFlow jobs, issue/PR threads, or purpose-built state JSON — not only in chat.

### Tool/capability layer

Agents should use explicit tools/capability interfaces rather than improvising access. The Fungies guide highlights MCP as a common standard for connecting agents to databases, APIs, search, filesystem, terminal, and browser automation. In OpenClaw, prefer first-class tools when available and keep tool access scoped to the task.

### Security and governance

Multi-agent output can compound mistakes: one weak agent result becomes another agent's premise. Use review gates for code, security-sensitive work, config, access, messaging, and public/external actions. Human approval remains required for destructive, high-sensitivity, or hard-to-undo changes.

### Observability

Log what matters: which agents ran, what they produced, what failed, what was verified, and what was finally accepted. Without traceability, orchestration becomes harder to debug than a single-agent workflow.

### Model flexibility

Do not assume one model should do every subtask. Cheap/fast models may be enough for extraction, formatting, or first-pass search; stronger models belong on judgment, synthesis, architecture, and final review. Provider/model flexibility matters because model quality and pricing shift over time.

### Mobile/task UX

A practical orchestrator should reduce task-assignment friction. If creating, steering, or reviewing agent work is annoying, orchestration will only be used for big tasks. Good task UX — including mobile-friendly capture/review when available — makes it natural to hand off small, useful tasks throughout the day.

## OpenClaw/orchestrator orchestration checklist

Before delegating:

- [ ] Is the task complex enough to justify subagents?
- [ ] Is the user’s goal and definition of done clear?
- [ ] Are there security/destructive/config risks requiring confirmation?
- [ ] Can subtasks run independently?

While delegating:

- [ ] Give each subagent bounded context and clear output requirements.
- [ ] Isolate parallel code changes with branches/worktrees when needed.
- [ ] Keep at most one active plan step marked in progress.
- [ ] Do not leak private/unnecessary context.
- [ ] Maintain visibility into what agents are doing and where artifacts live.
- [ ] Steer or stop off-track agents early instead of waiting for bad output.
- [ ] Avoid polling loops; rely on push completion or check on demand.

Before final answer:

- [ ] Integrate results into one coherent answer.
- [ ] Verify with tests, source inspection, or direct evidence.
- [ ] Apply orchestrator final acceptance: would I defend this to operator as accurate, useful, complete-enough, and user-ready?
- [ ] Document/commit durable changes when needed.

## Anti-patterns

- Delegating a task that is faster and safer to do directly.
- Giving every subagent the full chat history by default.
- Treating a subagent draft as final acceptance.
- Letting parallel agents edit overlapping files without coordination.
- Running many agents without visibility, review points, or cost awareness.
- Locking every task to one model/provider when cheaper or stronger options fit different subtasks.
- Shipping a stitched-together pile of partial answers.
- Continuing autonomous retries when human approval is the real blocker.

## Relationship to manager mode

Manager mode is the orchestrator's operational posture for owning planning, delegation, execution, and follow-through. Orchestration is one technique used inside manager mode. The final responsibility does not move to the subagents: orchestrator owns the plan, integration, verification, and final user-facing answer.

## Naming direction

operator is considering turning this into a standalone repo/project. Naming should fit a multiagent architecture and coordination skill, while staying unique/memorable and ideally carrying lobster + AI + orchestration/business themes.

Current direction:

- **Project/repo:** ReefNexus — the multiagent architecture/coordination hub; a reef as an ecosystem plus nexus as the connective center.
- **Core skill/module:** ReefRelay — the handoff, routing, and agent-to-agent coordination layer.
- **Brand/mascot flourish:** Clawstro — the memorable lobster-conductor identity.

## Naming parking lot

Previous brainstorm candidates to keep for later:

- Clawductor
- CommandDeck
- AgentWeave
- MissionControl
- OpenOrch
- Conductor
- Overture
- Maestro
- Baton
- Podium
- Concertmaster
- OrchestraKit
- TaskWeaver
- AgentMesh
- Relay
- Switchboard
- Dispatch
- ControlPlane
- TaskPlane
- Clawchestra
- ClawFlow
- ClawRelay
- ClawTask
- OrchClaw
- TaskForge
- WorkGraph
- FlowState
- Runbook
- AgentOps
- ControlRoom
- ClawCorp
- ClawCommander
- ClawSync
- OpsSphere
- ClawLink
- OpenLink
- ClawIQ
- Core Nexus
- ClawNexus
- ClawSphere
- Synaptix
- Auralis
- ReefSync
- KelpChorus
- CoralChain
- ClawChain
- KelpConnect
- Clawstro
- Rostrum
- ReefPilot
- ReefNexus
- ReefRelay

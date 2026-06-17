# VISION.md — ReefNexus

## Vision

ReefNexus is a practical multiagent architecture for OpenClaw work: an operating system for coordination, not just agent spawning.

It should make complex work:

- **visible** (what is running, why, and where output lives),
- **bounded** (clear contracts, scope, and role isolation),
- **steerable** (human interrupt/redirect/approval checkpoints),
- **verifiable** (evidence before synthesis),
- **safe** (fail closed on high-risk operations).

## Product statement

ReefNexus helps an orchestrator choose the lowest reliable complexity level, select the right orchestration pattern, route work to specialists, preserve shared state quality, and deliver one coherent final answer with audit-ready evidence.

## Design principles

1. **Lowest reliable complexity first**
   - Direct model call when possible.
   - Single tool-using agent when sufficient.
   - Multiagent orchestration only when justified.

2. **Visibility, policy, authority**
   - Visibility into tasks/agents/state.
   - Explicit decision policy and sequencing heuristics.
   - Authority to activate/defer/steer/stop/escalate.

3. **Separation of coordination from execution**
   - ReefRelay coordinates.
   - Specialists execute.
   - Final acceptance remains with the orchestrator.

4. **Structured handoffs beat raw transcripts**
   - Compact, typed outputs.
   - Known artifacts/paths.
   - Explicit assumptions, risks, blockers.

5. **Human oversight where it matters**
   - Mandatory gates for destructive/security/config/public actions.
   - Clear escalation path when confidence is low.

## Success criteria

- Faster high-quality completion of complex tasks.
- Lower rate of coordination failures (duplication, conflicts, dropped context).
- Better final-answer quality with explicit verification evidence.
- Controlled cost/latency via bounded delegation and adaptive routing.

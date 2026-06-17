# TASKFLOW_BINDING.md — ReefRelay ↔ TaskFlow runtime mapping

This doc defines how ReefRelay orchestration state compiles into TaskFlow durable jobs.

## Positioning

- **TaskFlow**: durable runtime substrate.
- **ReefRelay**: orchestration policy and operating model.

ReefRelay should use TaskFlow whenever work outlives one prompt, waits on child tasks/humans, or needs revision-safe continuation.

## Ownership split

### TaskFlow owns
- durable job identity
- owner session binding
- child-task linkage
- wait/resume/cancel lifecycle
- revision-safe state transitions

### ReefRelay owns
- orchestration decision (orchestrate vs not)
- pattern selection
- role/task contracts
- gate policy (safety, verification, final acceptance)
- final synthesis/send-no-send decision

## State mapping

ReefRelay run fields map to TaskFlow as follows:

- `runId` -> TaskFlow `jobId`
- `goal` -> TaskFlow top-level objective/description
- `pattern` -> TaskFlow metadata
- `tasks[]` -> TaskFlow child tasks
- `childResults[]` -> normalized child output packets linked to TaskFlow child tasks
- `findingDecisions[]` -> orchestrator accept/reject/defer judgments linked to child findings
- `status` -> TaskFlow job state
- `gates.*` -> ReefRelay policy state stored in TaskFlow metadata
- `artifacts[]` -> TaskFlow-linked artifact references

## Lifecycle mapping

1. **Create**
   - ReefRelay classifies request.
   - If orchestration required, create TaskFlow job with owner session and initial metadata.

2. **Plan**
   - Create child tasks from ReefRelay contracts.
   - Persist each task with role, objective, inputs, outputs, verification requirements.

3. **Execute**
   - Run child tasks (parallel or sequential per pattern).
   - Persist evidence and task status updates via revision-safe writes.
   - Normalize child outputs into `childResults[]`; raw worker output is evidence, not final state.

4. **Judge findings**
   - The orchestrator reviews each child finding.
   - Persist `accepted`, `rejected`, or `deferred` decisions with reviewed evidence references.
   - Do not let accepted/rejected/deferred judgment live only in transcript prose.

5. **Wait/Resume**
   - If awaiting human or dependent task, mark wait state.
   - Resume from persisted state; avoid transcript-only recovery.

6. **Gate + Finalize**
   - Safety/verification/final acceptance checked in ReefRelay.
   - Final send/no-send written to durable state before emitting user output.

7. **Cancel/Fail/Close**
   - Cancellation/failure reason captured with repair path.
   - Close job with final status and artifact index.

## Required metadata baseline

- `riskClass`
- `routeOutcome`
- `confidence`
- `selectedLane`
- `fallbackUsed`
- `clarificationAsked`
- `escalationTriggered`
- `gateResults` (safety/verification/finalAcceptance)
- `ownerSessionKey`
- `childTaskIds`
- `childResults`
- `findingDecisions`

## Revision safety expectations

- Treat every state change as compare-and-set style revision update.
- Never overwrite job state from stale snapshots.
- On revision conflict: reload state, reconcile, retry bounded times, then escalate.

## Anti-patterns

- Long-running orchestration tracked only in chat transcript.
- Child task results accepted without durable linkage.
- Final answer emitted before gate state is durably recorded.
- Treating TaskFlow as business-logic engine instead of runtime substrate.

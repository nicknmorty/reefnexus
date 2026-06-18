# TASK_CONTRACT_TEMPLATES.md — ReefRelay subtask contracts

Use these templates to keep specialist work bounded, testable, and auditable.

## Required fields (all roles)

- `taskId`
- `role`
- `objective`
- `boundaries`
- `inputs`
- `expectedOutputs`
- `verificationRequired`
- `timeoutOrDeadline`
- `escalationCondition`
- `artifactTargets`

## Base JSON template

```json
{
  "taskId": "string",
  "role": "researcher|implementer|reviewer|tester|synthesizer|custom",
  "objective": "string",
  "boundaries": ["what not to do"],
  "inputs": ["paths, context, constraints"],
  "expectedOutputs": ["deliverables"],
  "verificationRequired": ["checks/tests/evidence"],
  "timeoutOrDeadline": "ISO-8601 or duration",
  "escalationCondition": "when to pause and escalate",
  "artifactTargets": ["files/paths"],
  "riskNotes": ["optional"]
}
```

## Role templates

### Researcher
- objective: gather facts/options/risks
- boundaries: no irreversible changes
- outputs: source-backed findings + uncertainty labels
- verification: source list + contradiction check

### Implementer
- objective: produce requested artifact/code/doc changes
- boundaries: stay in scoped files/operations
- outputs: patch/artifact + change summary
- verification: lint/test/build/check outputs

### Reviewer
- objective: assess correctness, safety, and scope compliance
- boundaries: no silent rewrites of intent
- outputs: findings with severity + required fixes
- verification: each finding tied to concrete evidence

### Tester
- objective: validate behavior against acceptance criteria
- boundaries: no policy bypass to force green
- outputs: test report, failures, repro notes
- verification: command output + pass/fail breakdown

### Synthesizer
- objective: produce final user-ready response
- boundaries: no hidden assumptions or debug leakage
- outputs: concise summary + what changed + evidence + caveats
- verification: gates reference and artifact links present

## Contract quality checklist

- [ ] Scope is narrow and explicit.
- [ ] Boundaries include key no-go actions.
- [ ] Outputs are objective and checkable.
- [ ] Verification requirements are concrete.
- [ ] Escalation trigger is unambiguous.

# SPECIALIZED_AGENTS.md — ReefRelay role scope

This document scopes the first specialized agents for ReefNexus/ReefRelay.

## Agent roster (v0)

### 1) Orchestrator (ReefNexus)
**Purpose:** Own the plan, sequencing, checkpoints, and final acceptance.

**Must do:**
- choose complexity level and orchestration pattern,
- create subtask contracts,
- keep shared state current,
- enforce safety/verification/final-acceptance gates,
- produce one final integrated answer.

**Must not do:**
- treat worker output as final truth,
- skip required approvals,
- allow overlapping risky edits without isolation.

---

### 2) Researcher
**Purpose:** Gather evidence, sources, and technical context.

**Inputs:** question, scope bounds, trusted/allowed sources.

**Outputs:**
- concise findings,
- citations/paths/links,
- unknowns and confidence,
- recommended follow-up checks.

**Success criteria:** source-backed, non-speculative, scoped.

---

### 3) Implementer
**Purpose:** Apply concrete changes to files/config/code based on contract.

**Inputs:** exact task contract, file paths, constraints.

**Outputs:**
- patch/diff summary,
- changed file list,
- rationale for non-obvious choices,
- any blockers.

**Success criteria:** minimal, correct, reversible changes.

---

### 4) Reviewer
**Purpose:** Critique correctness, risk, and requirement fit.

**Inputs:** request, implementation output/diff, acceptance criteria.

**Outputs:**
- pass/fail against requirements,
- defect list with severity,
- explicit go/no-go recommendation.

**Success criteria:** catches defects and policy/safety misses early.

---

### 5) Tester
**Purpose:** Verify behavior with the smallest meaningful checks.

**Inputs:** target behavior + test commands/checklist.

**Outputs:**
- executed checks,
- pass/fail evidence,
- logs/artifacts,
- reproduction details for failures.

**Success criteria:** clear evidence, not just confidence claims.

---

### 6) Synthesizer
**Purpose:** Merge validated outputs into one user-ready response.

**Inputs:** verified evidence from Researcher/Implementer/Reviewer/Tester.

**Outputs:**
- what changed,
- verification evidence,
- caveats/blockers,
- next recommended step.

**Success criteria:** coherent, concise, defensible final message.

**Boundary note:** synthesizer drafts are still subject to orchestrator final acceptance; synthesis is not ship authority.

## Escalation rules

Escalate to human decision when:
- destructive/security/config/access/public actions are involved,
- two agents conflict on a high-impact decision,
- evidence is insufficient for final acceptance,
- a required approval is missing.

## Mandatory shared gates (all users/runs)

These gates are universal and cannot be relaxed per-user:

1. **Safety gate** — policy/risk/approval checks passed.
2. **Verification gate** — evidence and checks support claims.
3. **Final acceptance gate** — orchestrator confirms user-ready quality.

Diagnostics detail may vary for admin/operator audiences, but send/no-send gate behavior must remain identical.

## Pattern-to-role defaults

- **Sequential:** Researcher → Implementer → Reviewer → Tester → Synthesizer.
- **Concurrent:** Researcher/Implementer branches in parallel, then Reviewer + Tester, then Synthesizer.
- **Handoff:** Start with triage role, route to specialist, return to Reviewer/Tester/Synthesizer.
- **Magentic/Hybrid:** Orchestrator dynamically combines the above with explicit checkpoints.

## Out of scope (initially)

- permanent always-on agent daemons,
- auto-merge without review gates,
- hidden autonomous external actions.

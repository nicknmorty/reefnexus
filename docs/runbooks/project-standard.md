# Project standard runbook — idea to legitimate MVP

Status: draft reviewed by operator; validation/linkage follow-up remains before Phase 4D closeout  
Owner: operator / ReefRelay orchestrator  
Purpose: encode the operator's expected project flow so ReefRelay can run more hands-off without guessing.

## 0) Core principle

Hands-off does not mean permissionless.

ReefRelay may operate autonomously only inside this written authority. If the work leaves this authority, hits a stop boundary, or needs a product/strategy/security decision that is not already implied by the operator's request, stop and ask operator.

The orchestrator is accountable for project judgment. Subagents execute bounded lanes. Subagents do not own project direction, repo authority, final acceptance, or user-facing completion claims.

## 1) Source-of-truth hierarchy

Before acting, identify the authoritative project surface.

1. Existing project repo/folder under `~/projects/` is the canonical project authority.
2. Repo-local files such as `PROJECT_STATUS.md`, `PROJECT_PROGRESS.md`, `ROADMAP.md`, `docs/`, and runbooks are current project truth.
3. GitHub is the operator's preferred review/tracking surface once a project is repo-backed.
4. Workspace memory and high-level notes are continuity aids, not replacements for repo-local project truth.
5. Chat context is useful but not durable authority unless written into the project.

Docs run supreme: GitHub/repo documentation should stay ahead of development so operator and future agents can understand what is being done, recover from crashes, and resume cleanly after subagent failures or mistakes.

If project truth is missing, stale, or contradictory, pause long enough to reconcile it before major work.

## 2) Project locations and repo defaults

Default lifecycle locations:

- Backlog/planned: `/home/user/projects/backlog/<project>/`
- Active or paused development: `/home/user/projects/active/<project>/`
- Completed/archive: `/home/user/projects/archive/<project>/`

Lifecycle rule:

- Backlog is for ideas that have been scaffolded but are not in active development.
- As soon as actual work begins, the project moves to active.
- Once the product is released and work stops, it moves to archive.
- If work resumes later, move it back to active until that work is complete.

Repo default:

- New projects start inside `example-owner/openclaw-projects` unless operator explicitly says at creation time that the project should have its own standalone repo.
- Do not create a standalone GitHub repo just because a project has a strong name, full docs, dependencies, or a real scaffold.
- Later standalone promotion requires explicit operator approval.

Promotion discussion signals:

- independent dependencies/runtime are awkward inside `openclaw-projects`,
- multiple people may contribute directly,
- project needs its own CI/CD, releases, deployment, or issue tracker,
- operator wants to share, fork, or open-source it,
- separate repo history would add real value.

Automation may propose promotion when these signals appear. Automation may not promote or create the standalone repo without the operator's explicit approval.

## 3) Stop boundaries requiring operator

Stop and ask operator before:

- destructive or hard-to-reverse changes,
- deleting data; prefer recoverable archive/trash paths,
- security, auth, access, ownership, binding, or permission changes,
- removing or reducing operator/admin access,
- public/external publishing, messaging, announcements, releases, deploys, or repo visibility changes,
- service restarts or config changes that could interrupt orchestrator/OpenClaw unless already explicitly approved,
- paid API/resource usage beyond known safe bounds,
- choosing between materially different product directions,
- creating/promoting a standalone repo without explicit prior approval,
- changing project lifecycle state when evidence is unclear,
- declaring MVP/release complete when verification is missing or final acceptance is not defensible.

If a subagent encounters one of these boundaries, it must return `blocked_requires_orchestrator` with the reason and evidence. It must not improvise around the boundary.

## 4) Idea intake: from rough thought to project brief

When operator provides a rough idea, first produce a lightweight project brief before scaffolding or coding.

Required brief fields:

- Working name and alternate names, if relevant.
- Problem/opportunity in one paragraph.
- Target user/operator.
- Desired outcome.
- MVP definition: smallest useful version operator could actually try/review.
- Non-goals/deferred ideas.
- Constraints: time, platform, privacy, safety, cost, integrations.
- Risks and unknowns.
- Initial lifecycle state: backlog or active.
- Recommended repo home: default shared repo vs proposed standalone with rationale.
- Stop boundaries specific to this project.

Automation should challenge overbroad ideas gently:

- simplify to the smallest useful MVP,
- separate core MVP from later polish,
- identify hidden dependencies,
- ask only for decisions that genuinely block safe progress.

If the idea is too vague to define MVP, ask operator for the one missing decision that blocks progress.

## 5) Project creation checklist

When authorized to create a project scaffold:

1. Choose lifecycle folder using current intent:
   - backlog if exploratory/planned,
   - active if operator wants development now.
2. Use a stable lowercase slug for the folder.
3. Confirm repo placement:
   - default: inside `openclaw-projects`,
   - standalone only if explicitly requested/approved.
4. Create required files:
   - `README.md`,
   - `PROJECT_STATUS.md`,
   - `ROADMAP.md`,
   - `docs/SCOPE.md`,
   - `docs/DECISIONS.md` once durable decisions start accumulating,
   - `docs/runbooks/README.md`, because every project has documentation and any repeated task should have a runbook,
   - `.gitignore`,
   - project-type files only when justified (`package.json`, app scaffold, tests, etc.).
5. Record initial MVP and non-goals.
6. Record stop boundaries and open questions.
7. Commit and push meaningful project truth to the repo-backed surface.
8. Report the created surface: path, repo/branch, key files, next decision.

Do not skip the status/roadmap files. Future agents must be able to resume without chat archaeology.

## 6) Standard scaffold content

### README.md

Must explain:

- what the project is,
- who it is for,
- current status,
- how to run/test/use it when applicable,
- where deeper docs live.

### PROJECT_STATUS.md

Must include:

- current phase/state,
- project path and repo,
- what exists,
- what is currently being worked on,
- next decisions,
- verification command/status,
- known blockers.

Update at each major phase boundary and roughly every 30-60 minutes during long autonomous runs.

### ROADMAP.md

Must include:

- phases with checkboxes,
- MVP boundary,
- explicit deferred/post-MVP items,
- next-session exit command when useful.

### docs/SCOPE.md

Must include:

- problem,
- goals,
- non-goals,
- MVP definition,
- constraints,
- user/operator assumptions.

### docs/DECISIONS.md

Create once durable decisions start accumulating. It must capture:

- date/context,
- decision,
- rationale,
- alternatives considered,
- whether operator explicitly approved it.

## 7) Development workflow

For each work session:

1. Read project truth first.
2. Check git status before editing.
3. Identify the requested phase/scope and definition of done.
4. Make a bounded plan.
5. Prefer small, reviewable increments.
6. Use subagents only for narrow, explicit lanes.
7. Keep evidence: changed files, test output, docs updated, decisions made.
8. Run meaningful verification, not just smoke tests, unless only a smoke test is possible and clearly labeled.
9. Fix failing checks and rerun before reporting success.
10. Apply final acceptance: would orchestrator defend this as accurate, useful, complete-enough, verified for the stakes, and user-ready?
11. Update docs/status/release notes as appropriate.
12. Commit and push meaningful changes. GitHub documentation should stay ahead of development; every completed phase requires commit/push, including docs/planning-only phases.
13. Final summary includes what changed, verification, commit/push status, blockers, and next step.

Do not report success before verification and final acceptance.

## 8) Subagent delegation contract

Every subagent task must include:

- objective,
- allowed files/areas,
- prohibited actions,
- mutation permission: read-only, propose-only, or edit-allowed,
- expected output schema,
- evidence requirements,
- verification requirements,
- timeout/escalation condition,
- stop boundaries.

Default subagent boundaries:

- May edit files only when explicitly edit-allowed and heavily scoped. Coding agents need to be able to code, but edits must stay inside the task contract.
- Do not push without orchestrator consent and review. This remains strict until enough trust is earned through repeated correct execution.
- Do not commit, push, publish, deploy, restart services, change config, or alter access.
- Do not decide project direction.
- Do not claim final acceptance.
- Return concise structured findings with evidence and confidence.

Recommended output shape:

```json
{
  "status": "done|blocked|failed",
  "summary": "string",
  "findings": [
    {
      "claim": "string",
      "evidence": ["path#line or command/result"],
      "confidence": "low|medium|high",
      "recommendedAction": "accept|reject|defer"
    }
  ],
  "changes": ["path"],
  "verification": ["command/result or not-run reason"],
  "blockers": [],
  "questionsForoperator": []
}
```

The orchestrator reviews subagent output as evidence, not truth. Conflicting findings must be reconciled or deferred. Weak/unsupported findings must not be accepted.

## 9) MVP definition and completion gate

A legitimate MVP is not merely files existing. It must be:

- scoped to the smallest useful version,
- runnable/usable/reviewable by operator or the intended operator,
- user-facing demo capable when the product is intended to be user-facing,
- internally testable when the product is backend/helper automation not intended for direct user-facing demo,
- documented enough for future agents to continue,
- verified with meaningful tests/checks,
- honest about non-goals and deferred work,
- committed and pushed to the expected GitHub surface,
- accepted by the orchestrator as user-ready for the stated MVP boundary.

The core question: does this product actually work, and is the path to something production-worthy clear? If that path is not clear, MVP is not established.

If an MVP is useful but incomplete, call it a prototype or partial milestone, not a legitimate MVP.

## 10) Release/phase closeout

Before calling a phase/version done:

1. Build/do the work.
2. Run thorough verification.
3. Fix what breaks and rerun.
4. Apply final acceptance.
5. Write or update release/phase documentation when the change is meaningful:
   - what shipped,
   - test results,
   - bugs found/fixed,
   - files added/modified,
   - verification steps,
   - non-goals deferred.
   Use versioned release docs for version releases. If the work does not constitute a version release, record patch notes within the next release/version documentation surface.
6. Update `PROJECT_STATUS.md` or equivalent.
7. Add daily note when the work affects broader continuity.
8. Commit and push. This applies to every completed phase, including docs/planning-only phases.
9. Final response includes evidence and commit hash.

## 11) Automation-ready decision table

| Situation | Default action | Ask operator? |
| --- | --- | --- |
| Rough idea, no MVP boundary | Draft brief and ask for missing blocker decision | Yes if MVP cannot be inferred |
| New normal project | Scaffold under approved project location/shared repo | No, if operator asked to create it |
| Standalone repo requested explicitly | Create/proceed according to request | No further ask unless risk appears |
| Standalone repo merely seems useful | Propose promotion rationale | Yes |
| Existing project phase execution | Read truth, plan, execute, verify, docs, commit/push | No unless stop boundary appears |
| Security/config/access/destructive/public action | Stop with exact requested action and risk | Yes |
| Subagent weak/unsupported output | Reject/defer and repair task contract | No unless blocked |
| Tests fail | Fix and rerun | No unless fix requires decision/risk |
| Verification unavailable | Mark blocked or partial with reason | Maybe, if operator can unblock |
| MVP complete claim | Require tests, docs/status, final acceptance, commit/push | No if all gates pass |
| Repeated project task appears | Add or update a runbook for it | No unless scope/risk is unclear |
| Durable decisions start accumulating | Create/update `docs/DECISIONS.md` | No |
| Follow-up/blocker tracking | Orchestrator chooses `PROJECT_STATUS.md` vs GitHub issues based on workflow usefulness | No unless it changes external/public/process expectations |

## 12) GitHub issue / PR policy

ReefRelay is private and not a public collaboration surface by default. Pull requests are not required for normal private ReefRelay project work unless operator or the orchestrator has established a branch/review workflow for that repo.

Default:

- commit/push directly to the approved project repo/branch after verification and final acceptance for normal single-orchestrator work,
- use pull requests when multiple coding agents/branches need an explicit review checkpoint before merge; in that situation PRs are probably the best review surface,
- use `PROJECT_STATUS.md`, roadmap docs, and release/patch notes as the primary continuity surface,
- create GitHub issues when they improve orchestration, auditing, swarm/project audits, or follow-up tracking.

The orchestrator may choose GitHub issues for large audits or many follow-ups because issues provide assignment, labels, durable discussion, and visible tracking. Do not create issues as ceremony when a concise status doc is clearer.

## 13) Final summary format

Use concise operator-facing summaries:

- Done: what changed.
- Verification: commands/checks and result.
- Docs/status: what was updated.
- Git: commit hash and push status.
- Blockers/follow-ups: only real remaining issues.

Do not include raw subagent logs unless operator asks.

## 14) Review decisions captured from operator

- Every project should have docs, and repeated tasks should have runbooks.
- Version releases should get release docs; smaller meaningful work can be captured as patch notes in the next release/version surface.
- Backlog means scaffolded idea but not active development; active begins when actual work begins; archive begins after release and work stops.
- Standalone repo policy remains governed by existing project documentation: default shared repo unless operator explicitly requests/approves standalone creation or promotion.
- PRs are not inherently needed for normal private ReefRelay work, but are probably the best review surface when multiple coding agents/branches need an explicit checkpoint before merge; issues are useful when the orchestrator judges they improve audits/follow-up tracking.
- `docs/DECISIONS.md` is required once durable decisions start accumulating.
- Subagents may edit when heavily scoped, but they may not push without orchestrator consent/review until trust is earned.
- User-facing products require a user-facing demo path for MVP; backend/internal products can satisfy MVP through internal testing if the prod-worthy path is clear.
- Every completed phase requires commit/push, including docs/planning phases, because GitHub documentation should stay ahead of development.

# Agent Engineering Playbook

## 1. Purpose

This playbook defines how an agent owns meaningful repository work from discovery through evidence-backed completion. It adds operating discipline around the existing CMI product; it does not make CMI an agent framework.

The operating layer is deliberately small:

```text
repository instructions (`AGENTS.md`)
  + practical workflow (this playbook)
  + ephemeral live checklist (`.agent/todo.md`)
                          |
                          v
existing CMI evidence, memory, Change, Session, handoff, and Closing surfaces
```

The checklist is working memory for the current task. CMI remains the durable project-intelligence layer.

## 2. Short Prompt ≠ Small Task

Prompt length is not a complexity signal. Requests such as “Fix this bug,” “Add retry support,” “Update session continuation,” “Harden this parser,” “Add the missing tests,” or “Implement this issue” can require repository discovery, multiple files, regressions, and several verification levels.

For a substantive mutation, create or update `.agent/todo.md` proactively. The user does not need to say “make a plan,” “create todo.md,” “continue,” or “what next?”

Normally do not create a ceremonial checklist for a direct read-only question such as “Where is this type defined?” or “Explain this function.” A read-only investigation may use one when it becomes multi-stage, crosses boundaries, or needs tracked evidence.

## 3. Proactive Task Ownership

A normal authorized engineering task is one continuous flow:

```text
understand -> plan -> implement -> verify narrowly -> recover if needed
           -> verify broadly -> review evidence -> report gaps
```

Continue through those phases without repeatedly asking the user to say `continue`. Running an applicable test, investigating its failure, adding a regression, reviewing the diff, and reporting results are natural consequences of an authorized implementation task.

Proactivity does not expand authority. CMI recommendations, historical P0/P1 labels, inferred impact, or a checklist entry do not authorize unrelated edits, deployments, migrations, releases, credential changes, or destructive operations.

## 4. Live Checklist Lifecycle

Use `.agent/todo.md`. Only this file is ignored rather than the whole `.agent/` directory, leaving room for future committed repository conventions without changing ignore policy.

Start small before substantive implementation:

```markdown
# Current Task

Goal: Fix session continuation regression.

Status: active

## Checklist

- [ ] Establish repository and Git state
- [ ] Locate authoritative behavior and relevant tests
- [ ] Identify the affected implementation boundary
- [ ] Implement the smallest coherent fix
- [ ] Run focused verification
- [ ] Run broader repository verification
- [ ] Review diff and evidence boundaries
- [ ] Record remaining gaps or blockers
```

Update it after every meaningful phase. Mark completed work, replace generic steps with evidence-specific steps, remove disproven or unnecessary work, and add new required verification. The first plan is a hypothesis, not a contract.

When discovery changes scope, record why:

```markdown
## Current evidence

- Historical handoff contains an active Change ID.
- Direct Change lookup shows the record is terminal.

## Disproven assumptions

- `handoff.activeChanges` is not current lifecycle authority.

## Checklist

- [x] Reproduce stale continuation state
- [x] Re-check the Change by ID
- [ ] Patch only the stale-state decision path
- [ ] Add the bounded-list false-absence regression
- [ ] Run continuation-specific tests
```

Use `Status: active` while normal work remains. Use `complete` only when the local definition of done is met. Use `partial` when useful scope is delivered but known work or verification remains, and `blocked` when a real boundary prevents safe progress. Do not hide unfinished items to make the checklist look clean.

The file is ephemeral:

- do not commit it;
- do not treat it as architecture or release history;
- do not use it as durable session handoff authority;
- do not automatically promote its hypotheses or mistakes into CMI memory.

## 5. Constraint-First Discovery

Before substantive edits, establish:

1. The user goal and explicit non-goals.
2. Repository instructions, current Git state, branch, base revision, and existing user changes.
3. The source of truth for the behavior or contract.
4. The relevant implementation layer and its callers/consumers.
5. Existing focused tests and repository verification commands.
6. Relevant documentation and existing CMI evidence when useful.
7. The likely affected scope and evidence gaps.

Use CMI surfaces selectively. An ambient brief, context, impact result, Change history, Session handoff, or Finding can improve discovery, but no task must invoke every surface. Refresh stale graph evidence only when the task actually depends on graph or impact information.

For continuation, reconcile the historical handoff with current Git/repository state and retrieve each relevant Change by ID. A bounded active list is orientation; absence from it is not lifecycle proof.

## 6. Planning and Scope Control

Turn discovery into the smallest coherent plan that covers implementation and proof. A good checklist names the behavior boundary and decisive tests, not every possible future action.

Revise the plan when evidence changes. Do not silently drift, preserve stale checklist items, or grow the task around incidental cleanup. Surface important adjacent risk or P0/P1 evidence, but keep it separate unless it is necessary to complete the requested behavior.

Before adding a new product surface, ask whether an existing layer already owns the concern. Generic coding discipline belongs here and in `AGENTS.md`, not in a ninth portable Skill, CLI command, MCP tool, schema, durable state type, loader, installer, or runtime discovery mechanism.

## 7. Implementation Discipline

Implement the smallest change that fully addresses the established boundary. Preserve existing repository instructions, public contracts, evidence semantics, and user changes. Prefer focused edits over broad refactors.

For implementation, fix, or refactor work that intentionally uses durable CMI tracking:

- use a CMI Session for durable work-session history;
- use a Change record for BEFORE/DURING/AFTER change evidence;
- observe actual paths and verification evidence;
- keep a partial or review-pending Change active when the Session closes;
- terminalize the Change only when the requested Change scope is actually complete.

CMI write permission does not authorize source edits or commands by itself. Likewise, an item in `.agent/todo.md` does not create new authority.

## 8. Failure Recovery

After a meaningful test, build, or behavioral failure, update `.agent/todo.md` before the next patch. Record:

- the exact command or behavior observed;
- the decisive error, state, or evidence address;
- the assumption the failure disproved;
- the smallest next investigation or correction;
- the narrow verification that will decide whether the correction worked.

Then follow:

```text
failure -> inspect exact evidence -> identify false assumption
        -> update checklist -> smallest correction
        -> narrow decisive check -> broader regression
```

Do not use blind patch/rerun loops. Use context, graph, or impact tooling when the failure is cross-boundary or the ownership is unclear; do not invoke heavyweight analysis for a clear typo or syntax error.

## 9. Verification Ladder

Verification levels are independent evidence:

| Level | Question | Typical evidence |
| --- | --- | --- |
| Focused | Did the changed behavior work? | Relevant unit/integration test, reproduction, focused docs/activation check |
| Repository | Did supported local gates remain healthy? | `git diff --check`, `npm run verify`, `npm run benchmark:smoke`, `npm run package:smoke` |
| CI | Did the remote CI system pass this revision? | Observed GitHub checks for the pushed commit/PR |
| External/live | Was behavior verified in the real external environment? | Observed deployment, runtime, integration, or field check |
| Release | Is the exact revision ready under release policy? | Independently assessed release gates and required approvals |

Run the narrowest decisive check first, then broader repository gates proportional to risk. If a check fails, record and investigate it. If an environment blocker prevents execution, report the command, exit/result, and exact blocker.

Never turn “one focused test passed” into “all tests pass.” `npm run verify` does not prove CI, external behavior, or release readiness.

## 10. Completion Evidence

Source edits leave the task active. Before completion, assess implementation, focused verification, repository verification, the final diff, and remaining gaps. Report each level separately:

```text
Implementation: complete | partial | blocked
Focused verification: verified | failed | not-run
Repository verification: verified | failed | not-run
CI: verified | failed | not-observed
External/live verification: verified | failed | not-required | not-observed
Release readiness: ready | not-ready | not-assessed
Unproven claims:
  - ...
```

Use `Status: complete` only when the implementation scope reaches its local definition of done. A local commit or successful local gate is not proof that a push, Draft PR, CI run, external integration, or release succeeded.

### CMI Provenance Mark

After the completion report and any evidence-backed `### CMI Intelligence` section, substantial CMI-assisted work ends with the compact mark defined in [CMI Provenance Mark](PROVENANCE_MARK.md). The evidence-backed form requires an actually finalized durable Session. Use only Session and optional Change IDs observed from CMI; never fabricate them. If the operating contract applied but durable evidence was not recorded or the lifecycle was unavailable, use the document's explicit degraded form instead.

When PR creation or update is already authorized, the agent may put the same truthful mark inside the document's single replaceable `cmi-provenance` block. The mark does not authorize creating a PR, changing source files, or altering Git commit metadata merely for branding.

## 11. CMI Session / Change / Handoff Boundaries

Keep each state owner distinct:

| Surface | Role | Authority limit |
| --- | --- | --- |
| `.agent/todo.md` | Temporary task checklist | Ephemeral; never canonical or committed |
| CMI Session | Durable work-session history | Session closure does not complete a Change |
| CMI Change | Durable change evidence | Partial/paused work stays active |
| CMI handoff | Durable continuation snapshot | Historical; reconcile with current state |
| CMI Finding | Durable unresolved issue evidence | Severity is not current business priority |
| CMI memory | Reviewed durable project knowledge | Hypothesis or observation is not automatically truth |

If a work session ends before the task is complete, keep temporary tactical steps in the live checklist and preserve meaningful durable continuation evidence through the intentionally used CMI Session/handoff surfaces. Do not create `HANDOFF.md`, `AGENT_MEMORY.md`, `SESSION_STATE.md`, or another competing canonical store.

## 12. Evidence Provenance

Preserve the distinction among observed evidence, inference, historical correlation, reported verification, and reviewed durable knowledge.

- An observed path is not proof of complete runtime impact.
- A historical co-change pattern is not causality.
- A CMI recommendation is not authorization.
- A handoff recommendation is a historical snapshot, not automatically current priority.
- A reported verification is not independently observed command evidence.
- A debugging hypothesis is not reviewed durable memory.
- A reviewed rule being relevant requires inspection; it does not prove violation.

Record only evidence actually observed. Keep unproven claims explicit.

## 13. When to Stop and Ask

Continue automatically through normal in-scope engineering phases. Stop for user direction when:

- materially different product or architecture choices remain;
- the task requires new authority, credentials, or access;
- a destructive or external side effect is outside the granted scope;
- evidence is missing, unsafe, or contradictory enough that proceeding would be irresponsible;
- completing the work requires material scope expansion;
- unrelated user changes overlap in a way that cannot be safely preserved.

A routine test failure, a newly discovered necessary regression, or a normal diff review is not by itself a reason to stop.

## 14. Anti-Patterns

Do not:

- wait for `continue` after every normal phase;
- assume a short prompt is trivial;
- edit before locating the source of truth;
- create a checklist once and never update it;
- preserve stale plan items after evidence changes;
- blindly patch and rerun after failures;
- expand into unrelated cleanup or recommendation-driven scope creep;
- claim all tests pass when only one test ran;
- claim CI passed without observing CI;
- fabricate external verification or release readiness;
- automatically remember every discovered fact or hypothesis;
- treat CMI recommendations as authorization;
- duplicate durable handoff or memory files;
- add a new Skill merely to encode generic coding habits.

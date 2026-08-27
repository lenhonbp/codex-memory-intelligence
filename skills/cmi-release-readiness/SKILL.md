---
name: cmi-release-readiness
description: Prepare an evidence-bounded release-readiness assessment for an exact revision by checking scope, acceptance criteria, behavior, findings, packaging, repository gates, CI/live evidence, rollback and approval boundaries. Thin adapter over existing CMI Change, Session, findings, provenance and trust surfaces; it never publishes, deploys, pushes, approves, certifies, auto-remembers or treats local evidence as CI/live/release proof.
---

# Skill: cmi-release-readiness

## 1. Purpose

Use this Skill to prepare—not authorize—a release-readiness assessment for an exact revision, package or build. The Skill composes existing CMI evidence, findings, Change, Session, handoff and trust surfaces with repository release checks. It does not implement release logic in CMI Core and does not execute an external release action.

This is a portable open-format `SKILL.md`. CMI has no native Skill loader, registry or automatic discovery. Package distribution does not activate this Skill or install it into Codex, Manus, Grok or another runtime.

## 2. Appropriate trigger

Use when a user asks to assess release readiness, prepare a release checklist, verify a candidate revision/package, review a release handoff, or separate implementation verification from approval and publish.

## 3. Non-triggers

Do not use for a simple local test or ordinary code review with no release decision. Do not use it to publish, deploy, push, create a GitHub Release, change credentials or approve a release. Do not call a package/tag success an authorization signal.

## 4. Required inputs

Collect as much as is available without inventing facts:

- exact revision, tag, package or build identifier;
- goal, non-goals and acceptance criteria;
- relevant CMI Session/Change/findings/handoff IDs, if real and observed;
- focused and repository verification commands and results;
- CI result for the exact revision, if observed;
- external/live/browser/mobile evidence, if applicable;
- package/build contents, version and install/smoke evidence;
- unresolved risks, rollback/migration notes, owner and approval authority.

If a required input is unavailable, record the gap as `not-observed` or `not-assessed`; do not fill it with inference.

## 5. Release workflow

### Prepare

Reconcile the current repository and exact revision. Establish scope, acceptance criteria, open findings, active Changes, package/build contents and intended release surface. Check `git status`, diff/stat, tracked files, generated artifacts and version/tag target where applicable.

### Verify

Run the narrowest relevant focused check first, then repository gates proportional to risk. Replay the original behavior/journey when the product is interactive. Keep the following levels separate:

| Level | Question | Permitted status |
|---|---|---|
| Focused | Does the changed behavior/contract work? | `verified`, `failed`, `not-run` |
| Repository | Do supported local gates pass? | `verified`, `failed`, `not-run` |
| CI | Did remote CI pass for the exact revision? | `verified`, `failed`, `not-observed` |
| External/live | Was the actual target environment observed? | `verified`, `failed`, `not-required`, `not-observed` |
| Release readiness | Does the revision meet policy and approval requirements? | `ready`, `not-ready`, `not-assessed` |

A local pass does not establish CI, live or release readiness. A desktop pass does not establish browser/mobile pass. A screenshot does not establish complete animation, accessibility or user acceptance.

### Assess

Produce a matrix covering scope, behavior, UX/UI or game context, performance, packaging, security/trust, CI/live and handoff. Classify missing evidence, unresolved findings and approval gaps. Severity and historical recommendations inform assessment but do not automatically become current priority.

### Handoff

Report the candidate revision, accomplished checks, decisions, each verification level, unresolved risks, blockers, owner/authority and next actions. If the candidate is partial or blocked, say so. If approval is absent, leave approval and external release actions unexecuted.

## 6. Existing CMI surfaces

| Need | Existing CMI surface | Usage boundary |
|---|---|---|
| Change evidence | Change Intelligence `BEFORE → DURING → AFTER` | Reconcile actual lifecycle; partial/review-pending Change remains active. |
| Session/handoff | Session Intelligence and handoff | Use actual IDs; Session close does not complete Change. |
| Findings | Findings and evidence anchors | Surface open findings; do not auto-resolve or re-rank them. |
| Provenance/trust | Provenance Mark and Operational Trust | Use as evidence/guardrails, not certification or authentication claims. |
| Repository/package | Agent runtime and project commands | Run only authorized commands; record actual output and revision. |

This Skill never reimplements CMI memory, graph, evidence lifecycle, Session/Change behavior or trust checks. It does not create a competing `RELEASE_STATE.md`, memory store or release authority.

## 7. Authorization boundary

Separate four gates:

```text
prepare → verify → approve → publish/deploy
```

This Skill covers prepare and evidence collection. Approval must come from the authorized user/owner or existing project process. Publish, deploy, push, submit and external release actions require separate authorization and are never implied by a tag, package, local test, CI result or this Skill's recommendation.

## 8. Failure behavior

If the exact revision cannot be identified, report `not-assessed`. If a check fails, record the exact output, disproved assumption, smallest correction and next decisive check; do not hide failure by changing the threshold or removing the test. If CI/live/device evidence is unavailable, report `not-observed`. If an unresolved blocker remains, report `partial` or `blocked` with owner and next action.

Every retry must change evidence, hypothesis or correction. Do not blind-rerun. Do not mark a release ready only because local gates pass.

## 9. Forbidden behavior

Do not:

- publish, deploy, push, submit or create a release;
- approve or certify the candidate on behalf of the user;
- infer CI/live/release readiness from local/static evidence;
- call content hashes signatures without signing/key evidence;
- fabricate revision, tag, CI run, live result, approval or CMI ID;
- auto-remember findings, recommendations, failure hypotheses or release conclusions;
- terminalize a partial Change because release preparation or Session work ended;
- create a native Skill loader or duplicate CMI lifecycle/state.

## 10. Completion contract

Use this format:

```text
Implementation: complete | partial | blocked
Focused verification: verified | failed | not-run
Repository verification: verified | failed | not-run
CI: verified | failed | not-observed
External/live verification: verified | failed | not-required | not-observed
Release readiness: ready | not-ready | not-assessed
Approval: observed | not-observed | not-required
External action: not-run unless separately authorized
```

The final handoff must list evidence addresses, open findings, gaps and next actions. This Skill prepares a review; it does not create authorization.

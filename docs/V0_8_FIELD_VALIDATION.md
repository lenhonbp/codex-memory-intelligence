# v0.8 Initial Field Validation

Date: 2026-08-07

This document records an initial, read-only field smoke for the unreleased v0.8 Session Continuation and bounded planning-intelligence candidate. It is evidence for release-candidate readiness, not a substitute for longitudinal validation.

## Scope

The candidate was exercised against three materially different repository classes:

1. a large private JavaScript application/game repository with a substantial documentation tree and existing project-planning material;
2. a small private application used as a negative control with no conventional planning document in the bounded discovery locations;
3. the CMI repository itself as a Node.js CLI/tooling self-host case.

Private repository names, source contents, and business-specific planning text are intentionally omitted from the retained corpus. Validation ran in ephemeral GitHub Actions workspaces. CMI-generated `.codex-memory/` state was not committed back to target repositories.

## Method

Each field run used the same continuation flow:

1. scan the target repository;
2. inspect project/graph health;
3. start a work session with a repository-review goal;
4. close the session without intentionally changing product files;
5. record project cleanliness, open findings, recommendations, `nextAction`, planning signals, and guardrails.

The private target repositories cloned the current v0.8 candidate into runner-temporary storage. The self-host case executed the candidate directly from the CMI checkout.

## Evidence observed

### Large application — positive planning case

Before planning discovery was field-hardened, the repository was healthy/current/clean and produced no false findings, but it fell back to the generic user-prioritized-goal action even though real planning material existed. That was treated as a product-usefulness gap rather than an integrity failure.

After the bounded discovery fix:

- project health: healthy;
- graph: current;
- project worktree after the read-only session: clean;
- session scope: zero product paths;
- open findings: zero;
- continuation recommendations: three P3 planning review candidates;
- highest-priority continuation: source-linked to a nested current-priorities planning document;
- planning evidence confidence: low for ordinary numbered/list items;
- guardrails included `do-not-treat-planning-as-command` and `no-auto-command-or-truth`.

The field gap led to generic hardening rather than repository-specific logic: bounded discovery now covers conventional planning filenames in the repository root, `docs/`, and one conventional context-pack level; unchecked tasks and explicit TODO/NEXT markers remain stronger evidence than ordinary current/next/priority list items.

### Small application — negative control

The negative-control repository remained:

- project health: healthy;
- graph: current;
- project worktree: clean;
- session scope: zero product paths;
- open findings: zero;
- planning signals: zero;
- recommendations: zero;
- continuation result: the generic user-prioritized-goal fallback.

This is desirable. CMI did not manufacture a next task from README prose or unrelated source files merely to avoid a generic fallback.

### CMI self-host — tooling case

The self-host run remained healthy/current/clean with zero open findings. The real unchecked v0.8 field-validation tasks in CMI's ROADMAP became source-linked P3 review candidates, and the highest-priority candidate pointed to the first still-open field-validation item. Planning guardrails remained present.

## Field-driven changes

The initial field smoke directly produced these generic improvements:

- bounded dynamic discovery of conventional roadmap/TODO/backlog/plan/priority filenames;
- bounded discovery in root, `docs/`, and `docs/context-pack/` only — no unbounded recursive document crawl;
- support for unchecked Markdown tasks;
- support for explicit `TODO:`, `NEXT:`, `ACTION:`, and `FOLLOW-UP:` markers;
- low-confidence support for numbered/bulleted items only under current/next/priority-like planning context;
- explicit exclusion of checked tasks;
- stronger ranking for explicit unchecked tasks/markers over weak list evidence;
- evidence-specific recommendation wording so ordinary planning lists are not mislabeled as unchecked tasks;
- planning guardrails generalized from checkbox-only wording to planning evidence generally.

## What this validates

This initial field smoke supports the following bounded claims:

- Session Continuation can run read-only on unrelated real repositories without making product scope appear dirty from its own storage.
- Healthy repositories can close with zero false findings.
- A repository with bounded, recognizable planning evidence can receive a concrete source-linked P3 review candidate rather than an unconditional generic fallback.
- A repository without such evidence can legitimately retain the generic fallback instead of receiving an invented task.
- Planning evidence remains subordinate to stronger P0/P1/P2 findings and remains advisory rather than execution authority.

## What remains unproven

The following roadmap questions intentionally remain open:

- usefulness over many long-lived sessions and many unrelated repositories;
- empirical calibration of behavioral-confidence and recommendation-priority thresholds;
- whether historical verification recommendations improve agent verification choices over repeated work;
- measured reduction in user follow-up questions;
- regression/failure associations over enough real completed changes;
- retention/export/import requirements for large durable histories;
- broad incremental-correctness stress across real rebases, clock skew, rename-heavy histories, and very large monorepos.

No threshold is recalibrated from these three field smokes, and no planning item is promoted into durable project truth or business priority.

## Release-candidate assessment

The initial field smoke found one actionable usefulness gap, produced a generic bounded fix, preserved the negative-control behavior, and retained the evidence/authority guardrails. Subject to the normal full CI and CodeQL gates on the final PR head, this scope is suitable to be treated as a v0.8 release candidate while the longitudinal/empirical roadmap work remains explicitly open.

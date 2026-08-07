# v0.8 Field Validation and Release Audit

Date: 2026-08-07

This document records bounded real-repository field validation plus the final installed-package experiential audit used to prepare CMI v0.8.0. It is release evidence, not a substitute for longitudinal validation.

## Initial real-repository field validation

The candidate was exercised read-only against three materially different repository classes:

1. a large private JavaScript application/game repository with a substantial documentation tree and existing project-planning material;
2. a small private application used as a negative control with no conventional planning document in the bounded discovery locations;
3. the CMI repository itself as a Node.js CLI/tooling self-host case.

Private repository names, source contents, and business-specific planning text are intentionally omitted from the retained corpus. Validation ran in ephemeral GitHub Actions workspaces. CMI-generated `.codex-memory/` state was not committed back to target repositories.

Each field run used the same continuation flow: scan the target repository, inspect project/graph health, start a repository-review work session, close it without intentionally changing product files, then record project cleanliness, open findings, recommendations, `nextAction`, planning signals, and guardrails.

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

The field gap led to generic hardening rather than repository-specific logic: bounded discovery covers conventional planning filenames in the repository root, `docs/`, and one conventional context-pack level; unchecked tasks and explicit TODO/NEXT markers remain stronger evidence than ordinary current/next/priority list items.

### Small application — negative control

The negative-control repository remained healthy/current/clean with zero product scope, zero open findings, zero planning signals, and zero recommendations. It correctly retained the generic user-prioritized-goal fallback instead of inventing a task from unrelated README/source text.

### CMI self-host — tooling case

The self-host run remained healthy/current/clean with zero open findings. Real unchecked v0.8 field-validation tasks in CMI's ROADMAP became source-linked P3 review candidates, and planning guardrails remained present.

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

## Installed-package experiential pre-release audit

After implementation, CMI was audited as a user-installed package through the public `cmi` and `cmi-mcp` binaries rather than only through internal imports or unit tests.

Coverage included package installation, CLI discovery, scan/status/doctor/graph/workspaces, JavaScript/TypeScript/Python/Go/Rust indexing, Git and non-Git behavior, boundaries/ignore semantics, source-linked memory, stale policies, lifecycle/supersession, incremental reuse, workspace isolation, impact/pre-change/memory-gap surfaces, Change Intelligence BEFORE → DURING → AFTER, completed-record immutability, Session/Finding/Handoff flows, blocker/P0 behavior, planning/P3 behavior, dirty-start attribution, multi-session ambiguity, corrupt records, symlink/secret/path safety, MCP protocol fallback, read/write boundaries, resources/prompts, and bulk-refresh opt-in.

The audit found three release-blocking integration defects in the earlier candidate and they were fixed before release preparation:

1. top-level `cmi --help` omitted Session/Finding groups;
2. `change`, `session`, and `finding` group help did not exit cleanly;
3. `cmi mcp-config` pointed at legacy `mcp.js` rather than the session-aware `mcp-entry.js`.

Permanent regression coverage was added for these defects.

## Final v0.8.0 release-preparation evidence

Final release-preparation commit: `76f54a30387bba0819c97a7d4c672528a5d2d136`.

The exact commit was packed as `codex-memory-intelligence-0.8.0.tgz` and installed into independent audit fixtures.

- primary installed-package experiential suite: **23/23 PASS**, **89 command executions**;
- extended experiential suite: **9/9 PASS**, **36 command executions**;
- combined experiential result: **32/32 PASS**, **125 command executions**, zero failures;
- `npm run verify`: **82/82 PASS**;
- Ubuntu Node 22/24: PASS;
- macOS Node 22/24: PASS;
- Windows Node 22/24: PASS;
- package smoke: PASS across the CI matrix;
- benchmark + release metadata: PASS for `v0.8.0`;
- CodeQL analyze: PASS;
- package contents audit: PASS.

Observed incremental behavior remained aligned with the design: a full synthetic scan parsed all 120 sources; the unchanged scan reused all 120; a one-file change reparsed one source and reused the remaining 119.

A first post-bump experiential rerun produced one audit-harness false negative because the validation script still hard-coded `0.7.0`; the installed package correctly returned `0.8.0`, and all other primary checks passed. The harness was made candidate-version-aware and the exact same `76f54a3...` package then passed both experiential suites completely. No product change was made to resolve that harness-only failure.

## What this validates

This evidence supports these bounded claims:

- CMI's public CLI and MCP surfaces operate coherently as a packed/installable v0.8.0 package across the exercised workflows;
- Session Continuation can run read-only on unrelated real repositories without making product scope appear dirty from its own storage;
- healthy repositories can close with zero false findings;
- bounded recognizable planning evidence can yield source-linked P3 review candidates without overriding stronger P0/P1/P2 evidence;
- repositories without planning evidence can retain a generic fallback rather than receive invented tasks;
- the release metadata, packed artifact surface, cross-platform tests, and security scan are internally consistent at the release-preparation head.

## What remains unproven

The following roadmap questions intentionally remain open:

- usefulness over many long-lived sessions and many unrelated repositories;
- empirical calibration of behavioral-confidence and recommendation-priority thresholds;
- whether historical verification recommendations improve agent verification choices over repeated work;
- measured reduction in user follow-up questions;
- regression/failure associations over enough real completed changes;
- retention/export/import requirements for large durable histories;
- broad incremental-correctness stress across real rebases, clock skew, rename-heavy histories, and very large monorepos.

No threshold is recalibrated from this small field-smoke set, and no planning item is promoted into durable project truth or business priority.

## Release-preparation assessment

The v0.8.0 source metadata and release notes are prepared and all current release-preparation gates are green. This materially increases release confidence but does not mathematically guarantee the absence of every possible defect.

No npm publish, semantic tag, GitHub Release, or merge is established by this document. Those remain explicit release actions after the reviewed release candidate is accepted.

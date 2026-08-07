# Changelog

All notable changes are documented here.

## [Unreleased]

No unreleased changes yet.

## [0.8.1] - 2026-08-08

### Fixed

- Graph truncation now degrades project health instead of reporting a false healthy state.
- Impact and pre-change intelligence fail closed on stale graph fingerprints instead of returning obsolete dependency evidence.
- `.codex-memory` storage rejects symlinked roots and unsafe nested durable directories; Markdown/JSON memory reads use bounded no-follow file-handle validation, and durable appends verify file identity after opening.
- Memory, change, and session writer locks use owner-tagged leases with heartbeat and owner-checked release; handles close before cleanup so an old writer cannot delete a replacement lock and Windows cleanup remains safe.
- Secret guards share broader best-effort credential patterns while remaining explicitly non-DLP.
- `refresh-memory` now refreshes source fingerprints without asserting semantic review metadata; an explicit `memory-state <id> active --reason ...` review records `reviewedAt`, `reviewedBy`, and `reviewReason`.


## [0.8.0] - 2026-08-07

### Added

- Stale-aware durable-memory retrieval with explicit evidence status and `demote`, `include`, and `exclude` policies.
- Source-fingerprint checks that omit stale/missing graph nodes from current graph retrieval and surface graph drift through context health, `status`, and `doctor`.
- Reviewed durable-memory lifecycle states: `active`, `deprecated`, `rejected`, and `superseded`, with reviewer/reason audit metadata and active-replacement validation for supersession.
- `cmi memory-state` and the write-enabled MCP `set_project_memory_state` tool for explicit lifecycle review.
- Explicit historical retrieval of inactive knowledge through CLI/MCP `includeInactive`, while inactive knowledge remains excluded from normal task context.
- Shared local durable-memory write locking across remember, refresh, and lifecycle mutations.
- Versioned durable-memory metadata for new/refreshed entries (`schemaVersion: 1`, active lifecycle state).
- Runtime structural validation, per-record write locking, revision metadata, and stale-lock reclamation for durable change records.
- Verification provenance classes (`reported`, `observed-command`) with bounded command metadata supported consistently by runtime, JSON Schema, and MCP input Schema.
- Sample-sensitive historical co-change support/confidence, explicit `historical-correlation` evidence type, verification pass/evidence rates, and expected-vs-actual path precision/recall/F1 calibration.
- Durable Session Continuation Intelligence for coding, debugging, audit, review, research, verification, and no-code investigation sessions.
- `cmi session start`, `observe`, `status`, `close`, `show`, `list`, and `handoff` workflows with explicit outcome, unresolved findings, recommended next actions, and one highest-priority next action.
- Persistent `.codex-memory/findings.json` project findings with `open`, `resolved`, `accepted`, `dismissed`, and `superseded` lifecycle states so unresolved issues survive AI-session boundaries.
- Deterministic P0–P3 recommendation ordering for blockers, failed/incomplete verification, project-health gaps, active change records, prediction gaps, unexpected impact, open questions, and worktree/session-attribution gaps.
- Bounded session handoffs containing objective, branch/HEAD/worktree state, observed scope, accomplishments, decisions, questions, completed/active changes, open findings, next actions, and review-only knowledge candidates.
- Versioned `schemas/session-record.schema.json` storage contract for durable session/outcome intelligence.
- Session-aware MCP tools for status/report/list/handoff/findings plus write-enabled start/observe/finalize/finding-review workflows while retaining the existing MCP surface.
- MCP resources `cmi://project/session/latest`, `cmi://project/session-handoff/latest`, and `cmi://project/findings`.
- MCP prompts `close_project_session` and `continue_from_session_handoff`, plus initialize instructions telling compliant agents to surface P0/P1 findings and the highest-priority next action before ending substantial work.
- Regression coverage for stale retrieval policy semantics, stale graph health, memory lifecycle, ambiguous ID prefixes, concurrent memory mutation serialization, verification provenance, record validation, calibrated behavioral confidence, Git renames, detached HEAD baselines, no-code sessions, persistent blockers, finding auto-resolution, CLI close-session reporting, and MCP session continuation behavior.

### Changed

- Default memory search/context now preserves stale evidence as clearly labeled, heavily down-ranked evidence instead of silently treating it as current; `exclude` is the opt-in strict-current mode.
- Inactive durable memory remains human-reviewable history but no longer drives normal ranked retrieval or makes project memory unhealthy.
- Reviewed memory mutations require a unique ID/prefix; ambiguous prefixes fail closed.
- Bulk refresh skips intentionally inactive knowledge, and refreshing a single inactive entry requires explicit reactivation first.
- Co-change confidence no longer maps directly from occurrence count; tiny samples cannot receive high confidence merely because support is 100%.
- Change-history calibration now reports path precision, recall, F1, sample count, and sample-sensitive confidence while retaining compatibility aliases for v0.7 metrics.
- Git worktree parsing now uses NUL-delimited porcelain output so rename/copy destination paths and original paths remain distinct instead of becoming `old -> new` pseudo-paths.
- The installed `cmi` entrypoint now adds Session/Finding Intelligence commands while delegating all existing commands to the original CLI implementation.
- The installed `cmi-mcp` entrypoint now exposes a unified existing + session-continuation MCP surface and preserves the existing server as the protocol core.
- MCP documentation/prompts distinguish lifecycle state, stale-evidence policy, historical correlation, supplied command-result provenance, persistent findings, and next-action advice from independently verified truth.
- Session close is designed to surface problems and evidence-based follow-up immediately instead of requiring the user to ask what should happen next.

### Fixed

- Top-level CLI help now exposes the Session and Finding command groups, and `change`, `session`, and `finding` group help exits cleanly.
- `cmi mcp-config` now points to the session-aware `mcp-entry.js`, keeping generated configuration aligned with the installed `cmi-mcp` surface.

### Evidence limits

- Session recommendations do not execute project commands and do not prove business priority.
- Persistent findings can only cover conditions CMI can observe or that a human/agent explicitly records.
- Historical verification suggestions remain correlation, not causal proof that a command is required.
- MCP instructions encourage close-session finalization but cannot force arbitrary clients that ignore MCP guidance to invoke it before disconnecting.
- Session and change learning candidates remain review-only and are never promoted to durable project truth automatically.

## [0.7.0] - 2026-08-07

### Added

- Evidence-driven Change Intelligence Loop with durable BEFORE → DURING → AFTER records under `.codex-memory/changes/`.
- `cmi change start`, `observe`, `complete`, `show`, `list`, and `history` CLI workflows.
- Versioned JSON Schema for change-record storage.
- Prediction-versus-observation comparison with changed-path coverage, predicted-scope touched, and explicit prediction gaps.
- Bounded historical file/boundary co-change evidence and verification patterns derived from completed local change records.
- Review-only learning candidates for prediction gaps, failed verification claims, and unexpected impact.
- MCP read tools for change history and records, plus write-enabled lifecycle tools behind the existing explicit write opt-in.
- `cmi://project/change-history` MCP resource and `run_change_intelligence_loop` prompt.
- Git and non-Git tests covering change attribution, completion evidence, historical correlation, secret rejection, record immutability, bounded record size, and symlink-safe history reads.

### Changed

- `prepare_project_change` now instructs agents to consult relevant completed project-change history before implementation.
- MCP `--write` documentation now covers durable change-record writes as well as durable memory writes.
- CMI-internal `.codex-memory/` paths are excluded from observed product-change scope so change records cannot observe themselves.
- Change-record Git baselines preserve the number of omitted CMI-internal changes while calculating project attribution from non-CMI paths only.
- Historical co-change is explicitly labeled correlation rather than causality, and verification results are explicitly treated as evidence claims rather than commands executed by CMI.
- Change-record reads are bounded to 1 MB per record and use fixed file handles with symlink/race protections before parsing durable history.

## [0.6.0] - 2026-08-07

### Added

- Bounded local Git baseline reporting without absolute-path disclosure.
- Deterministic advisory project-boundary maps derived from workspaces, paths, and import edges.
- Review-only task-specific memory-gap proposals with confidence and evidence.
- Structured pre-change briefs combining baseline, ranked context, impact, boundaries, risks, verification, assumptions, and provenance.
- CLI commands: `baseline`, `boundaries`, `memory-gaps`, and `prepare`.
- MCP tools and resources for repository baseline, boundary maps, memory-gap proposals, and pre-change briefs.
- Versioned JSON Schema for pre-change brief output.
- Cross-platform tests for Git-root and nested-project baseline paths, including non-Git projects.

### Changed

- The `prepare_project_change` MCP prompt now directs agents to use the structured pre-change brief and treat all inferred knowledge as advisory.
- Architecture and security documentation now distinguish observed project evidence from inferred advisory output.
- Git project paths are derived using Git-native relative prefixes for consistent behavior across macOS, Windows, and Linux.
- Only reviewed memory entries with CMI metadata count as durable task-relevant memory; template text and agent guidance are not mistaken for reviewed project facts.

## [0.5.0] - 2026-08-06

### Added

- Incremental graph scanning with parser-versioned node reuse and changed-file invalidation.
- `.cmiignore` parsing with globs, directory rules, negation, configuration patterns, and explanation output.
- npm/pnpm, Cargo, and Go workspace detection.
- Workspace IDs on graph nodes, cross-workspace metrics, affected-workspace impact output, and workspace-scoped retrieval.
- TypeScript path-alias, Python package, Go module, and Rust module-resolution fixtures.
- BM25-inspired local ranking with symbol, title, workspace, decision, risk, and dependent-file boosts.
- MCP resources, prompts, workspace/ignore tools, context-pack tool, stable protocol negotiation, and fallback behavior.
- Reproducible synthetic benchmark and CI benchmark smoke job.
- Project-index and project-graph JSON Schemas.
- Semantic release metadata validation for a future npm Trusted Publishing workflow.

### Changed

- Project index schema is now version 5; project graph schema is version 3; configuration schema is version 4.
- The current stable MCP protocol target is `2025-11-25`, with compatibility back to `2024-11-05`.
- File fingerprints now include size, modification time, and change time for safer incremental invalidation.
- Hidden paths are excluded by default, except root `.github/` and `.cmiignore`.

## [0.4.0] - 2026-08-06

- Added cross-platform CI, CodeQL, symlink-safe paths, package installation smoke tests, conservative MCP mutation defaults, diagnostics, governance, and release documentation.

## [0.3.0] - 2026-08-05

- Added dependency graphing, impact analysis, source-linked memory, stale-memory detection, and expanded MCP tools.

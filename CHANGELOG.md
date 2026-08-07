# Changelog

All notable changes are documented here.

## [Unreleased]

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
- Regression coverage for stale retrieval policy semantics, stale graph health, memory lifecycle, ambiguous ID prefixes, concurrent memory mutation serialization, verification provenance, record validation, and calibrated behavioral confidence.

### Changed

- Default memory search/context now preserves stale evidence as clearly labeled, heavily down-ranked evidence instead of silently treating it as current; `exclude` is the opt-in strict-current mode.
- Inactive durable memory remains human-reviewable history but no longer drives normal ranked retrieval or makes project memory unhealthy.
- Reviewed memory mutations require a unique ID/prefix; ambiguous prefixes fail closed.
- Bulk refresh skips intentionally inactive knowledge, and refreshing a single inactive entry requires explicit reactivation first.
- Co-change confidence no longer maps directly from occurrence count; tiny samples cannot receive high confidence merely because support is 100%.
- Change-history calibration now reports path precision, recall, F1, sample count, and sample-sensitive confidence while retaining compatibility aliases for v0.7 metrics.
- MCP documentation and prompts now distinguish lifecycle state, stale-evidence policy, historical correlation, and supplied command-result provenance from independently verified truth.

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

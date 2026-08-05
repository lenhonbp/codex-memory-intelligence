# Changelog

All notable changes are documented here.

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

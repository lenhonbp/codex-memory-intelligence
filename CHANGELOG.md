# Changelog

All notable changes are documented here.

## [0.4.0] - 2026-08-06

### Added

- Cross-platform CI for Ubuntu, macOS, and Windows on Node.js 22 and 24.
- CodeQL security scanning.
- Symlink-safe source tracking and graph scanning.
- `cmi doctor`, `cmi --version`, package installation smoke tests, and JSON Schemas.
- MCP lifecycle validation, parse errors, tool annotations, and read-only defaults.
- Governance, support, maintainer, roadmap, release, and conduct documentation.

### Changed

- Node.js 22 is now the minimum supported runtime.
- MCP memory writes require explicit opt-in; bulk refresh requires an additional opt-in.
- Generated graph, index, and snapshot files are ignored by default inside `.codex-memory/`.

## [0.3.0] - 2026-08-05

- Added dependency graphing, impact analysis, source-linked memory, stale-memory detection, and expanded MCP tools.

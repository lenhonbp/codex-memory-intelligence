# Codex Memory + Project Intelligence

[![CI](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/ci.yml/badge.svg)](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/ci.yml)
[![CodeQL](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/codeql.yml/badge.svg)](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-green.svg)](package.json)

A local-first memory, dependency-intelligence, and impact-analysis layer for Codex and other AI coding agents.

CMI helps an agent answer three questions before changing a project:

1. **What has the team already learned or decided?**
2. **Which files and symbols are connected to this change?**
3. **Is the stored knowledge still current?**

Everything stays in a human-reviewable `.codex-memory/` directory. There is no cloud service, API key, database, or telemetry.

> Codex Memory Intelligence is an independent open-source project and is not affiliated with or endorsed by OpenAI.

## Current status

v0.4 is a hardened public beta. Static parsing remains best effort rather than compiler-grade analysis. See [Roadmap](ROADMAP.md) and [Architecture](docs/ARCHITECTURE.md).

## Install

The npm package should be used after the first public release is published:

```bash
npm install -g codex-memory-intelligence
```

From source:

```bash
git clone https://github.com/lenhonbp/codex-memory-intelligence.git
cd codex-memory-intelligence
npm link
```

Requires Node.js 22 or newer.

## Quick start

```bash
cmi doctor
cmi init
cmi scan
cmi remember fact "Production runs on Cloudflare Pages"
cmi remember decision "Schema changes must use D1 migrations" --source wrangler.toml
cmi search "production database migration"
cmi impact migrate
cmi stale
cmi snapshot before-refactor
cmi status
```

## Commands

```text
cmi init [path]
cmi scan [path] [--json]
cmi graph [path] [--json]
cmi search <query> [--limit N] [--json]
cmi context <query> [--limit N]
cmi impact <file-or-symbol> [--depth N] [--json]
cmi remember <fact|decision|mistake> <text> [--source path ...]
cmi stale [path] [--fail-on stale|review|any] [--json]
cmi refresh-memory <id|all> [--reviewed-by name] [--reason text]
cmi snapshot [label]
cmi status [path] [--json]
cmi doctor [path] [--json]
cmi mcp-config [--write] [--bulk-refresh]
cmi --version
```

## MCP integration

Generate the safe default configuration, with durable memory mutations disabled:

```bash
cmi mcp-config
```

Enable durable memory creation and refresh explicitly:

```bash
cmi mcp-config --write
```

Bulk memory refresh is more sensitive and requires a second opt-in:

```bash
cmi mcp-config --write --bulk-refresh
```

The server provides search, scan, status, graph, impact, and stale-memory tools. Scanning may refresh generated cache files. When durable memory mutations are enabled, the server additionally exposes memory creation and reviewed-memory refresh tools. The transport is JSON-RPC over stdio, one JSON object per line.

## Security model

- Project scanning skips symbolic links.
- Source-linked memory accepts regular files only and verifies their real path remains inside the project.
- MCP durable memory creation and refresh tools are disabled by default; scans may update generated cache files.
- Obvious credentials and private keys are rejected, but CMI is not a complete secret scanner.
- Repository content and memory text remain untrusted input for connected agents.

Review `.codex-memory/` before publishing it. Generated `project-index.json`, `project-graph.json`, and `snapshots/` are ignored by default; durable Markdown knowledge and configuration remain reviewable and commit-friendly.

## Parser scope

CMI uses bounded dependency-free static parsing for common JavaScript/TypeScript, Python, Go, Rust, and related files. Aliases, generated code, runtime imports, macros, reflection, and dependency injection may not resolve completely. Unresolved local imports are reported separately from external dependencies.

## Development

```bash
npm run verify
npm run package:smoke
```

CI runs on Ubuntu, macOS, and Windows with Node.js 22 and 24. CodeQL scans JavaScript and GitHub Actions workflows.

Community documents: [Contributing](CONTRIBUTING.md), [Code of Conduct](CODE_OF_CONDUCT.md), [Governance](GOVERNANCE.md), [Support](SUPPORT.md), [Security](SECURITY.md), [Maintainers](MAINTAINERS.md), and [Releasing](docs/RELEASING.md).

## License

MIT

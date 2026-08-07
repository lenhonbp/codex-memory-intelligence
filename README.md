# Codex Memory + Project Intelligence

[![CI](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/ci.yml/badge.svg)](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/ci.yml)
[![CodeQL](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/codeql.yml/badge.svg)](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/codeql.yml)
[![npm version](https://img.shields.io/npm/v/codex-memory-intelligence.svg)](https://www.npmjs.com/package/codex-memory-intelligence)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-green.svg)](package.json)

A local-first memory, dependency-intelligence, impact-analysis, and pre-change advisory layer for Codex and other AI coding agents.

CMI helps an agent answer six questions before changing a project:

1. **What has the team already learned or decided?**
2. **Which files, symbols, workspaces, and inferred boundaries are connected to this change?**
3. **What is the current Git baseline?**
4. **What could be affected, and how complete is that inference?**
5. **Which reviewed project knowledge is missing?**
6. **Which verification work should happen before the change is considered complete?**

Everything stays in a human-reviewable `.codex-memory/` directory. There is no cloud service, API key, database, or telemetry.

> Codex Memory Intelligence is an independent open-source project and is not affiliated with or endorsed by OpenAI.

## Current status

v0.5 is a real-world public beta, published on npm as `codex-memory-intelligence`. It adds incremental scanning, `.cmiignore`, monorepo awareness, workspace-scoped retrieval, broader parser resolution, MCP resources/prompts, reproducible benchmarks, and release-metadata validation.

Static parsing and inferred architecture remain best effort rather than compiler-grade analysis. Every inferred boundary, risk, and memory-gap proposal is labeled as advisory and includes confidence or provenance. See [Architecture](docs/ARCHITECTURE.md), [Benchmarks](docs/BENCHMARKS.md), and [Roadmap](ROADMAP.md).

## Install

Install the public npm package globally:

```bash
npm install -g codex-memory-intelligence
cmi --version
```

Or install it in one project and run it through `npx`:

```bash
npm install --save-dev codex-memory-intelligence
npx cmi --version
```

Requires Node.js 22 or newer.

## Quick start

```bash
cmi doctor
cmi init
cmi scan
cmi remember fact "Production runs on Cloudflare Pages"
cmi remember decision "Schema changes must use versioned migrations" --source package.json
cmi context "change the account migration"
cmi prepare "change the account migration"
cmi impact migrate
cmi stale
cmi snapshot before-refactor
cmi status
```

A second unchanged `cmi scan` reuses previously parsed source nodes. Use `cmi scan --full` after parser/configuration experiments or when you deliberately want a complete rebuild.

## Pre-change intelligence

CMI can assemble a bounded, evidence-labeled brief before an agent edits code:

```bash
cmi baseline
cmi boundaries
cmi memory-gaps "add retry-safe payment processing"
cmi prepare "add retry-safe payment processing"
```

The brief combines:

- bounded Git branch, commit, worktree, upstream, and ahead/behind context;
- ranked durable memory and relevant graph files;
- deterministic boundary inference from workspaces, directory structure, and import edges;
- exact impact analysis when a file or symbol matches, with clearly labeled context-seed fallback otherwise;
- review-only proposals for missing facts, decisions, and lessons;
- risk and verification suggestions derived from observable task and path evidence.

CMI does not claim that inferred boundaries are declared architecture. It does not write suggested memory automatically. Durable memory still requires an explicit write-enabled process and review.

## Monorepos and workspaces

CMI detects npm/pnpm workspaces, Cargo workspace members, and Go workspaces/modules.

```bash
cmi workspaces
cmi context "authentication flow" --workspace packages/web
cmi prepare "change authentication flow" --workspace packages/web
cmi search "shared API" --workspace @company/core
```

Graph nodes carry workspace IDs, impact analysis reports affected workspaces, and cross-workspace edges are counted separately.

## Ignore semantics

Create a root `.cmiignore` file using gitignore-style patterns:

```gitignore
# Generated code
generated/
*.snapshot.json

# Re-include one file
!important.snapshot.json
```

Explain any decision:

```bash
cmi explain-ignore generated --directory
cmi explain-ignore important.snapshot.json --json
```

Built-in dependency/generated paths and symbolic links cannot be re-included. Hidden paths such as `.env` are excluded by default, while root `.github/` and `.cmiignore` remain visible for repository intelligence. See [Ignore semantics](docs/IGNORE.md).

## Commands

```text
cmi init [path]
cmi scan [path] [--full] [--json]
cmi graph [path] [--json]
cmi workspaces [path] [--json]
cmi baseline [path] [--json]
cmi boundaries [path] [--json]
cmi explain-ignore <path> [--directory] [--json]
cmi search <query> [--limit N] [--workspace name-or-path] [--json]
cmi context <query> [--limit N] [--workspace name-or-path] [--json]
cmi prepare <change-goal> [--limit N] [--depth N] [--workspace name-or-path] [--json]
cmi memory-gaps <query> [--limit N] [--workspace name-or-path] [--json]
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

Generate the safe default configuration, with durable-memory mutations disabled:

```bash
cmi mcp-config
```

Enable durable-memory creation and reviewed refresh explicitly:

```bash
cmi mcp-config --write
```

Bulk refresh requires a second opt-in:

```bash
cmi mcp-config --write --bulk-refresh
```

The server exposes tools, resources, and prompt templates. Read tools include repository baseline, inferred boundary maps, memory-gap proposals, and a structured pre-change brief. It supports stable MCP protocol versions from `2024-11-05` through `2025-11-25`, negotiates the client version when supported, and uses newline-delimited JSON-RPC over stdio. Scanning may refresh generated cache files; durable Markdown memory remains protected by explicit write opt-in.

See [MCP integration](docs/MCP.md).

## Security model

- Project scanning never follows symbolic links.
- Source-linked memory accepts regular files only and verifies real paths remain inside the project.
- Built-in dependency and generated paths cannot be negated through `.cmiignore`.
- Hidden paths are excluded by default except root `.github/` and `.cmiignore`.
- Git baseline collection uses fixed bounded commands and does not expose absolute repository paths.
- Boundary, risk, and memory-gap outputs are explicitly advisory rather than durable truth.
- MCP durable-memory tools are disabled by default.
- Bulk memory refresh requires a separate opt-in.
- Obvious credentials and private keys are rejected, but CMI is not a complete secret scanner.
- Repository content and memory text remain untrusted input for connected agents.

Review `.codex-memory/` before publishing it. Generated `project-index.json`, `project-graph.json`, and `snapshots/` are ignored by default; durable Markdown knowledge and configuration remain reviewable and commit-friendly.

## Parser scope

CMI uses bounded, dependency-free static parsing for common JavaScript/TypeScript, Python, Go, Rust, and related files. v0.5 adds TypeScript `paths` aliases, Python absolute-package heuristics, Go module imports, and Rust `mod`/`crate::`/`self::`/`super::` resolution.

Aliases inherited through complex `extends` chains, generated code, runtime imports, macros, reflection, build-system rewrites, and dependency injection may not resolve completely. Go package imports are represented by a deterministic source-file node rather than a compiler package graph.

## Development

```bash
npm run verify
npm run benchmark:smoke
npm run package:smoke
```

CI runs on Ubuntu, macOS, and Windows with Node.js 22 and 24. A separate benchmark smoke job checks incremental reuse and release metadata. CodeQL scans JavaScript and GitHub Actions workflows.

Community documents: [Contributing](CONTRIBUTING.md), [Code of Conduct](CODE_OF_CONDUCT.md), [Governance](GOVERNANCE.md), [Support](SUPPORT.md), [Security](SECURITY.md), [Maintainers](MAINTAINERS.md), and [Releasing](docs/RELEASING.md).

## License

MIT

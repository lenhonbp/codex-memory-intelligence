# Codex Memory + Project Intelligence

[![CI](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/ci.yml/badge.svg)](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/ci.yml)
[![CodeQL](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/codeql.yml/badge.svg)](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/codeql.yml)
[![npm version](https://img.shields.io/npm/v/codex-memory-intelligence.svg)](https://www.npmjs.com/package/codex-memory-intelligence)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-green.svg)](package.json)

A local-first project memory, dependency intelligence, impact analysis, and evidence-driven change intelligence layer for Codex and other AI coding agents.

CMI helps an agent answer these questions before and after changing a project:

1. **What has the team already learned or decided?**
2. **Which files, symbols, workspaces, and inferred boundaries are connected to this change?**
3. **What is the current Git baseline?**
4. **What could be affected, and how complete is that inference?**
5. **Which reviewed project knowledge is missing?**
6. **Which verification work should happen before the change is considered complete?**
7. **What actually changed in similar work before, and what did earlier predictions miss?**

Everything stays in a human-reviewable `.codex-memory/` directory. There is no cloud service, API key, database, telemetry, remote model, or network enrichment requirement.

> Codex Memory Intelligence is an independent open-source project and is not affiliated with or endorsed by OpenAI.

## Current status

`v0.7.0` is the current published release line for the **Change Intelligence Loop**. It combines incremental project intelligence and evidence-labeled pre-change briefs with durable BEFORE → DURING → AFTER records that compare predicted scope with observed changed paths and derive bounded historical co-change and verification evidence. The npm badge above is the authoritative indicator of the version currently published to the registry.

The development branch for the next release is hardening trust before expanding intelligence: stale-aware retrieval, graph freshness checks, reviewed memory lifecycle, runtime-validated change records, local writer serialization, verification provenance, and sample-sensitive behavioral calibration. These changes remain **unreleased** until the package version and release artifacts are intentionally advanced.

See [Change Intelligence](docs/CHANGE_INTELLIGENCE.md), [Durable Memory Lifecycle](docs/MEMORY_LIFECYCLE.md), [Roadmap](ROADMAP.md), and [Changelog](CHANGELOG.md) for the storage contracts, evidence limits, and release status.

Static parsing and inferred architecture remain best effort rather than compiler-grade analysis. Historical co-change is correlation, not causality. CMI never treats an observed changed path as proof of complete runtime impact, and it never turns learning candidates into durable project truth automatically.

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
cmi remember fact "Production runs on the documented hosting platform"
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

CMI does not claim inferred boundaries are declared architecture. Durable memory still requires an explicit write-enabled process and review.

## Memory evidence and lifecycle

On the unreleased v0.8 development line, durable memory separates **lifecycle** from **freshness**.

Reviewed lifecycle states are `active`, `deprecated`, `rejected`, and `superseded`. Inactive knowledge remains in the human-reviewable Markdown history but is excluded from normal ranked task context. Supersession requires a distinct active replacement entry.

```bash
cmi memory-state <id> deprecated --reason "Policy was replaced" --changed-by reviewer
cmi memory-state <old-id> superseded --reason "New decision replaces it" --superseded-by <new-id>
```

Active memory can separately become stale when source/project evidence changes. Retrieval supports three explicit policies:

```bash
cmi search "retry policy" --stale-policy demote
cmi search "retry policy" --stale-policy exclude
cmi search "retry policy" --include-inactive --stale-policy include
```

`demote` is the default: stale/review evidence remains visible but is strongly down-ranked and labeled. `exclude` is strict-current mode. `include` is intended for explicit historical inspection. See [Durable Memory Lifecycle](docs/MEMORY_LIFECYCLE.md).

## Change Intelligence Loop

The v0.7 change-intelligence layer preserves evidence across real coding tasks:

```text
BEFORE  understand + predict + retrieve relevant history
DURING  observe changed paths + compare predicted scope
AFTER   record outcome + verification evidence + unexpected impact
```

Start a record before editing:

```bash
cmi change start "add retry-safe payment processing"
```

Observe meaningful progress:

```bash
cmi change observe <id>
```

After the agent or human has actually run the project's verification commands, complete the record:

```bash
cmi change complete <id> \
  --outcome succeeded \
  --verify "npm test=passed" \
  --verify "payment retry integration=passed"
```

Inspect local project history:

```bash
cmi change show <id>
cmi change list --status completed
cmi change history "payment retry"
```

Completed records can provide:

- relevant previous changes;
- file pairs that repeatedly changed together;
- inferred boundaries that repeatedly changed together;
- verification names and outcomes observed in similar work;
- expected-vs-actual changed-path calibration showing where pre-change scope predictions missed directly edited files.

These are historical signals, not causal claims. CMI does not execute tests, builds, profilers, migrations, or project code on behalf of the change-intelligence layer. It records bounded evidence supplied by Git and by the human or connected agent.

The unreleased v0.8 line distinguishes ordinary `reported` verification from supplied `observed-command` metadata. `observed-command` still means only that command-result metadata was provided through the interface; CMI does not independently execute or attest that command.

Change records live in `.codex-memory/changes/` and are intentionally reviewable and commit-friendly. CMI-internal paths are excluded from product-change scope so the records do not observe themselves.

See [Change Intelligence](docs/CHANGE_INTELLIGENCE.md) for attribution rules, non-Git behavior, limitations, and the learning policy.

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
cmi search <query> [--limit N] [--workspace name-or-path] [--stale-policy demote|include|exclude] [--include-inactive] [--json]
cmi context <query> [--limit N] [--workspace name-or-path] [--stale-policy demote|include|exclude] [--include-inactive] [--json]
cmi prepare <change-goal> [--limit N] [--depth N] [--workspace name-or-path] [--json]
cmi memory-gaps <query> [--limit N] [--workspace name-or-path] [--json]
cmi impact <file-or-symbol> [--depth N] [--json]
cmi change start <goal> [--limit N] [--depth N] [--workspace name-or-path] [--json]
cmi change observe <id> [--file path ...] [--json]
cmi change complete <id> [--outcome succeeded|failed|partial|abandoned|unknown] [--file path ...] [--verify name=status ...] [--unexpected text ...] [--note text ...] [--json]
cmi change show <id> [--json]
cmi change list [--status active|completed] [--limit N] [--json]
cmi change history [query] [--limit N] [--json]
cmi remember <fact|decision|mistake> <text> [--source path ...]
cmi memory-state <id> <active|deprecated|rejected|superseded> --reason text [--changed-by name] [--superseded-by id] [--json]
cmi stale [path] [--fail-on stale|review|any] [--json]
cmi refresh-memory <id|all> [--reviewed-by name] [--reason text]
cmi snapshot [label]
cmi status [path] [--json]
cmi doctor [path] [--json]
cmi mcp-config [--write] [--bulk-refresh]
cmi --version
```

## MCP integration

Generate the safe default configuration:

```bash
cmi mcp-config
```

The default exposes read-only durable history and advisory intelligence, including `get_change_insights`, `get_change_record`, and `list_change_records`. Scanning remains available because it only refreshes generated project intelligence caches.

Enable durable project writes explicitly when you want a connected agent to create change records or reviewed durable memory:

```bash
cmi mcp-config --write
```

The unreleased v0.8 interface adds reviewed memory lifecycle mutation and aligns MCP verification provenance with the durable runtime/schema contract. It does **not** authorize CMI to execute arbitrary project commands. Tests and other verification remain the responsibility of the agent/user environment.

Bulk memory refresh requires a second opt-in:

```bash
cmi mcp-config --write --bulk-refresh
```

The server also exposes `cmi://project/change-history` and the `run_change_intelligence_loop` prompt. See [MCP integration](docs/MCP.md).

## Security model

- Project scanning never follows symbolic links.
- Source-linked memory accepts regular files only and verifies real paths remain inside the project.
- Built-in dependency and generated paths cannot be negated through `.cmiignore`.
- Hidden paths are excluded by default except root `.github/` and `.cmiignore`.
- Git baseline collection uses fixed bounded commands and does not expose absolute repository paths.
- Stale/missing graph nodes are not returned as current graph evidence before a rescan.
- Active stale/review memory is evidence-labeled and policy-controlled; inactive lifecycle states are excluded from normal retrieval.
- Reviewed memory mutations reject ambiguous ID prefixes and preserve lifecycle audit metadata instead of silently deleting history.
- Durable memory append/refresh/lifecycle mutations share a local write lock to reduce concurrent-writer loss.
- CMI-internal paths are excluded from observed product-change scope.
- Boundary, risk, memory-gap, co-change, and learning-candidate outputs are explicitly advisory rather than durable truth.
- Historical co-change is correlation only and confidence is sample-sensitive.
- Change intelligence does not execute verification commands or store source diffs automatically.
- Change-history reads are bounded and reject symlinked record paths; supported platforms use fixed file handles and no-follow semantics where available.
- MCP durable project writes are disabled by default.
- Bulk memory refresh requires a separate opt-in.
- Obvious credentials and private keys are rejected from durable memory and user-supplied change-record text, but CMI is not a complete secret scanner.
- Repository content, durable memory, and change records remain untrusted input for connected agents.

Review `.codex-memory/` before publishing it. Generated `project-index.json`, `project-graph.json`, and `snapshots/` are ignored by default; durable Markdown knowledge, configuration, and change records remain human-reviewable.

## Parser scope

CMI uses bounded, dependency-free static parsing for common JavaScript/TypeScript, Python, Go, Rust, and related files. Current coverage includes TypeScript `paths` aliases, Python absolute-package heuristics, Go module imports, and Rust `mod`/`crate::`/`self::`/`super::` resolution.

Aliases inherited through complex `extends` chains, generated code, runtime imports, macros, reflection, build-system rewrites, and dependency injection may not resolve completely. Go package imports are represented by a deterministic source-file node rather than a compiler package graph.

## Development

```bash
npm run verify
npm run benchmark:smoke
npm run package:smoke
```

CI runs on Ubuntu, macOS, and Windows with Node.js 22 and 24. A separate benchmark smoke job checks incremental reuse and release metadata. CodeQL scans JavaScript and GitHub Actions workflows.

Community documents: [Contributing](CONTRIBUTING.md), [Code of Conduct](CODE_OF_CONDUCT.md), [Governance](GOVERNANCE.md), [Support](SUPPORT.md), [Security](SECURITY.md), [Maintainers](MAINTAINERS.md), [Architecture](docs/ARCHITECTURE.md), [Change Intelligence](docs/CHANGE_INTELLIGENCE.md), [Durable Memory Lifecycle](docs/MEMORY_LIFECYCLE.md), and [Releasing](docs/RELEASING.md).

## License

MIT

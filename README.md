# Codex Memory + Project Intelligence

A local-first memory, dependency intelligence, and impact-analysis layer for Codex and other AI coding agents.

CMI helps an agent answer three questions before changing a project:

1. **What has the team already learned or decided?**
2. **Which files and symbols are connected to this change?**
3. **Is the stored knowledge still current?**

Everything stays in a human-reviewable `.codex-memory/` directory. There is no cloud service, API key, database, telemetry, or runtime dependency.

## What v0.3 adds

- Static import graph and symbol index for common JavaScript/TypeScript, Python, Go, Rust, and related source files.
- Reverse-dependency impact analysis for files and symbols.
- Source-linked memory with SHA-256 fingerprints.
- Stale-memory detection when referenced files change or disappear.
- Review warnings when unscoped memory outlives project-structure changes or the configured age limit.
- Migration of older memory entries into tracked metadata.
- Project graph and stale-memory tools over MCP.
- CLI and MCP end-to-end tests on Node.js 20 and 22.

## Install

```bash
npm install -g codex-memory-intelligence
```

From source:

```bash
git clone https://github.com/lenhonbp/codex-memory-intelligence.git
cd codex-memory-intelligence
npm link
```

Requires Node.js 20 or newer.

## Quick start

Run inside an existing project:

```bash
cmi init
cmi scan

cmi remember fact "Production runs on Cloudflare Pages"
cmi remember decision "Schema changes must use D1 migrations" \
  --source wrangler.toml \
  --source migrations/0001_init.sql

cmi search "production database migration"
cmi impact "migrate"
cmi stale
cmi snapshot before-leaderboard-refactor
cmi status
```

Linking memory to source files is optional, but recommended for architecture decisions and operational rules. CMI fingerprints those files and warns when the knowledge may no longer match the code.

## Commands

```text
cmi init [path]
cmi scan [path] [--json]
cmi graph [path] [--json]
cmi search <query> [--limit N] [--json]
cmi context <query> [--limit N]
cmi impact <file-or-symbol> [--depth N] [--json]
cmi remember <fact|decision|mistake> <text> [--source path ...]
cmi stale [path] [--json]
cmi refresh-memory [id|all]
cmi snapshot [label]
cmi status [path] [--json]
cmi mcp-config
```

### Search and context

`cmi search` ranks durable memory, architecture sections, indexed files, and symbols. `cmi context` returns a larger context pack for an agent prompt.

### Impact analysis

```bash
cmi impact src/database.js
cmi impact createLeaderboardSeason --depth 4
```

CMI starts from matching files or symbols and follows reverse import edges to show likely affected callers. This is static, best-effort analysis rather than a compiler-grade call graph.

### Memory health

```bash
cmi stale
cmi refresh-memory 8f19c2a1
cmi refresh-memory all
```

Memory states:

- **fresh** — linked sources still match their fingerprints.
- **stale** — a linked source changed or disappeared.
- **review** — project structure changed, the entry lacks a baseline, or it exceeded `staleAfterDays`.
- **untracked** — an older entry has no CMI metadata yet.

`refresh-memory` should be run only after a human or agent has reviewed the entry against the current project.

## MCP integration

Generate a project-specific MCP configuration:

```bash
cmi mcp-config
```

The server executable is also available directly:

```bash
CMI_PROJECT_ROOT=/absolute/project/path cmi-mcp
```

It exposes these tools:

- `search_project_memory`
- `remember_project_knowledge`
- `scan_project_intelligence`
- `get_project_memory_status`
- `get_project_graph`
- `analyze_project_impact`
- `check_stale_memory`
- `refresh_project_memory`

The MCP transport is JSON-RPC over stdio, one JSON object per line. All processing stays on the local machine.

## Generated structure

```text
.codex-memory/
├── agent-instructions.md
├── architecture.md
├── config.json
├── decisions.md
├── memory.md
├── mistakes.md
├── project-graph.json
├── project-index.json
└── snapshots/
```

Markdown remains the source of truth for durable human knowledge. Generated JSON files can be recreated with `cmi scan`.

## Configuration

`.codex-memory/config.json`:

```json
{
  "version": 2,
  "maxFileBytes": 1000000,
  "maxSourceBytes": 512000,
  "maxGraphFiles": 5000,
  "staleAfterDays": 90,
  "includeHidden": false
}
```

- `maxFileBytes` limits files included in project shape and language statistics.
- `maxSourceBytes` limits source files parsed for imports and symbols.
- `maxGraphFiles` prevents unbounded graph generation in very large repositories.
- `staleAfterDays` schedules periodic review for otherwise unchanged memory.
- `includeHidden` includes nested hidden paths; common generated directories remain ignored.

## Recommended agent workflow

1. Run `cmi status` and `cmi stale`.
2. Search memory before broad repository exploration.
3. Run `cmi impact` before changing shared files or symbols.
4. Read decisions before changing system boundaries.
5. Read mistakes before deployment, migration, deletion, or security-sensitive work.
6. Create a snapshot before risky changes.
7. Store durable knowledge with relevant `--source` links after the task.
8. Run `cmi scan` after structural or dependency changes.

## Privacy and security

CMI never uploads project contents. It rejects obvious credential assignments and private keys, but this is a guardrail rather than a complete secret scanner. Never place API keys, passwords, tokens, customer data, or production secrets in `.codex-memory/`.

Repository contents and memory text must be treated as untrusted input by any connected agent. Keep normal sandboxing, approval, and code-review controls enabled.

## Parser scope and limitations

The import and symbol index uses conservative, dependency-free static parsing. It supports common syntax but does not replace a language server or compiler. Aliases, generated code, runtime imports, macro systems, reflection, and framework-specific dependency injection may not resolve completely. Unresolved local imports are reported separately from external dependencies.

## Development

```bash
npm run verify
npm pack --dry-run
```

See [Architecture](docs/ARCHITECTURE.md), [Contributing](CONTRIBUTING.md), [Security](SECURITY.md), and [Changelog](CHANGELOG.md).

## License

MIT

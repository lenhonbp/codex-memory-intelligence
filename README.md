# Codex Memory + Project Intelligence

A local-first memory, retrieval, and architecture intelligence layer for Codex and other AI coding agents.

CMI prevents agents from repeatedly rediscovering the same project conventions, architecture decisions, operational lessons, and repository structure. Knowledge stays in a small, human-reviewable `.codex-memory/` directory.

## What v0.2 adds

- Durable facts, decisions, and lessons with secret detection.
- Project intelligence for stack, languages, entry points, important configuration, repository shape, and index health.
- Fast local retrieval with `cmi search` and `cmi context`.
- A zero-dependency MCP server exposing memory and scanning tools to compatible agents.
- Git snapshots before risky work.
- No cloud service, database, API key, telemetry, or runtime dependency.

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
cmi remember decision "All schema changes use D1 migrations"
cmi remember mistake "Direct production edits caused schema drift"
cmi search "production database migration"
cmi snapshot before-leaderboard-refactor
cmi status
```

## Commands

```text
cmi init [path]
cmi scan [path] [--json]
cmi search <query> [--limit N] [--json]
cmi context <query> [--limit N]
cmi remember <fact|decision|mistake> <text>
cmi snapshot [label]
cmi status [path] [--json]
cmi mcp-config
```

`search` returns ranked memory sections. `context` returns a slightly larger context pack suitable for pasting into an agent prompt.

## MCP integration

Generate a project-specific MCP configuration:

```bash
cmi mcp-config
```

The server executable is also available as:

```bash
CMI_PROJECT_ROOT=/absolute/project/path cmi-mcp
```

It exposes four tools:

- `search_project_memory`
- `remember_project_knowledge`
- `scan_project_intelligence`
- `get_project_memory_status`

The MCP transport is stdio and all processing stays on the local machine.

## Generated structure

```text
.codex-memory/
├── agent-instructions.md
├── architecture.md
├── config.json
├── decisions.md
├── memory.md
├── mistakes.md
├── project-index.json
└── snapshots/
```

These files are intentionally Markdown and JSON so developers can review, edit, diff, and version them without proprietary tooling.

## Recommended agent workflow

1. Search project memory before broad repository exploration.
2. Read architectural decisions before changing system boundaries.
3. Read mistakes before deployment, migration, deletion, or security-sensitive work.
4. Create a snapshot before risky changes.
5. Store only durable knowledge after the task.
6. Run `cmi scan` after major structural changes.

## Privacy and security

CMI never uploads project contents. It rejects obvious credential-like memory entries, but this is a guardrail rather than a complete secret scanner. Never place API keys, passwords, private keys, tokens, customer data, or production secrets in `.codex-memory/`.

The project scanner ignores common generated directories and files larger than the configured size limit. Adjust `.codex-memory/config.json` when needed.

## Design principles

- Local-first and provider-neutral.
- Human-readable memory is the source of truth.
- Retrieval before context dumping.
- Explicit durable knowledge instead of automatic transcript storage.
- Useful without embeddings; compatible with future semantic adapters.
- Safe defaults and predictable failure modes.

## Roadmap

- Symbol and import graph indexing.
- Memory proposal workflow with human approval.
- Git-aware stale-memory detection.
- Framework adapters for Cloudflare, Next.js, Vite, and monorepos.
- Optional local embedding providers.
- Snapshot comparison and restoration guidance.
- Published npm releases and richer MCP compatibility tests.

## Development

```bash
npm run verify
```

## License

MIT

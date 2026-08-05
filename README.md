# Codex Memory + Project Intelligence

A local-first memory and architecture layer for Codex and other coding agents.

## Why

Coding agents repeatedly spend context rediscovering the same architecture, conventions, past mistakes, and decisions. CMI stores durable project knowledge in a small, reviewable `.codex-memory/` directory.

## Features

- `cmi init` creates project memory files.
- `cmi scan` detects the stack, repository shape, likely entry points, and key configuration.
- `cmi remember` records facts, decisions, and mistakes.
- `cmi snapshot` records Git state before risky work.
- `cmi status` reports current memory/index health.
- No runtime dependencies; Node.js 20+ only.

## Install

```bash
npm install -g codex-memory-intelligence
```

Or run from source:

```bash
git clone https://github.com/lenhonbp/codex-memory-intelligence.git
cd codex-memory-intelligence
npm link
```

## Quick start

Inside a project:

```bash
cmi init
cmi scan
cmi remember fact "Production deploys use Cloudflare Pages"
cmi remember decision "Use D1 migrations for schema changes"
cmi snapshot before-leaderboard-refactor
```

Then instruct Codex:

```text
Before working, read .codex-memory/agent-instructions.md and the linked memory files. Update durable project knowledge when the task finishes.
```

## Generated structure

```text
.codex-memory/
├── agent-instructions.md
├── architecture.md
├── decisions.md
├── memory.md
├── mistakes.md
├── project-index.json
└── snapshots/
```

## Roadmap

- Dependency graph and symbol indexing
- Automatic end-of-task memory proposals
- Secret-safe context packs
- MCP server for agent-native retrieval
- Cloudflare/Next.js/Vite framework adapters
- Snapshot restore and timeline UI

## Security

CMI never uploads project contents. Generated files may still contain sensitive user-entered notes, so review them before committing to a public repository.

## License

MIT

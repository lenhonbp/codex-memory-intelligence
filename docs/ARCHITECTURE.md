# Architecture

CMI is intentionally small, local-first, dependency-free at runtime, and explicit about its security boundaries.

## Data flow

```text
project files
    │
    ├── safe path resolver ──> scanner ──> project-index.json ──> architecture.md
    │
    └── safe path resolver ──> graph parser ──> project-graph.json ──> impact analysis / graph search

memory.md / decisions.md / mistakes.md
    │
    ├── ranked lexical retrieval
    ├── source fingerprints
    └── stale-memory checks

CLI and MCP expose the same core operations.
MCP disables durable memory mutations by default; scans may refresh generated caches.
```

## Modules

- `src/core.js` — initialization, configuration migration, project scanning, memory writes, snapshots, status, and diagnostics.
- `src/paths.js` — project-boundary validation, real-path checks, and symbolic-link rejection.
- `src/graph.js` — source parsing, import resolution, symbol indexing, reverse dependencies, and impact analysis.
- `src/search.js` — accent-insensitive ranked lexical retrieval across Markdown memory and graph-derived chunks.
- `src/stale.js` — metadata parsing, source fingerprints, health classification, and audited review refresh.
- `src/cli.js` — human-facing command-line interface.
- `src/mcp.js` — lifecycle-aware JSON-RPC stdio server for compatible coding agents.
- `src/version.js` — package and supported MCP protocol constants.

## Sources of truth

Durable human knowledge lives in Markdown. `project-index.json` and `project-graph.json` are generated caches and may be deleted and rebuilt with `cmi scan`. Snapshots and generated JSON are ignored by the generated `.codex-memory/.gitignore` unless a project deliberately chooses otherwise.

Memory metadata is embedded in HTML comments immediately below each timestamp heading. It records a stable ID, type, creation date, optional source paths and hashes, project-structure hash, and review audit fields. The comments remain invisible in normal Markdown rendering.

## Project-boundary model

Directory traversal skips symbolic links. A source attached to memory must be a regular file whose lexical path and resolved real path both remain inside the selected project root. This prevents a repository symlink from making CMI fingerprint an arbitrary file outside the project.

These checks reduce accidental and repository-controlled boundary escapes. They do not replace operating-system sandboxing or protect against a compromised local account.

## Staleness model

A source-linked entry is stale when a source is missing, unsafe, unreadable, or its SHA-256 hash changes. An unscoped entry moves to review when the project-structure hash changes or its review age exceeds the configured threshold. Older entries without metadata are marked untracked rather than trusted silently.

Refreshing memory records who reviewed it and why. MCP bulk refresh is disabled unless a second explicit opt-in is supplied.

## Graph model

Each indexed source file is a node containing language, size, imports, and symbols. Resolved relative imports create local directed edges. Reverse edges support impact analysis. Package imports remain external dependencies, while relative imports that cannot be resolved are counted as unresolved local imports.

Parsing is best-effort and bounded by configuration limits. The project should remain useful even when some languages or framework conventions cannot be resolved.

## MCP lifecycle and permissions

The server accepts newline-delimited JSON-RPC over stdio. Clients initialize the server, send `notifications/initialized`, and then list or call tools. Invalid JSON and requests receive JSON-RPC errors.

Search, scan, status, graph, impact, and stale checks are available by default. Scans may update generated project caches. Durable memory creation and refresh require `CMI_WRITE_ENABLED=1`. Bulk refresh additionally requires `CMI_ALLOW_BULK_REFRESH=1`.

## Compatibility and validation

- Node.js 22 and 24.
- Ubuntu, macOS, and Windows CI.
- Existing `.codex-memory/` directories are migrated in place.
- Runtime dependencies remain at zero.
- Package installation is smoke-tested from the generated npm archive.
- CodeQL scans JavaScript and workflow changes.

# Architecture

CMI is intentionally small, local-first, and dependency-free.

## Data flow

```text
project files
    │
    ├── scanner ──> project-index.json ──> architecture.md
    │
    └── graph parser ──> project-graph.json ──> impact analysis / graph search

memory.md / decisions.md / mistakes.md
    │
    ├── ranked retrieval
    ├── source fingerprints
    └── stale-memory checks

CLI and MCP expose the same core operations.
```

## Modules

- `src/core.js` — initialization, configuration migration, project scanning, memory writes, snapshots, and status.
- `src/graph.js` — source parsing, import resolution, symbol indexing, reverse dependencies, and impact analysis.
- `src/search.js` — accent-insensitive ranked retrieval across Markdown memory and graph-derived chunks.
- `src/stale.js` — metadata parsing, source fingerprints, health classification, and reviewed-baseline refresh.
- `src/cli.js` — human-facing command-line interface.
- `src/mcp.js` — JSON-RPC stdio server for compatible coding agents.

## Sources of truth

Durable human knowledge lives in Markdown. `project-index.json` and `project-graph.json` are generated caches and may be deleted and rebuilt with `cmi scan`.

Memory metadata is embedded in HTML comments immediately below each timestamp heading. It records a stable ID, type, creation date, optional source paths and hashes, project-structure hash, and most recent review date. The comments remain invisible in normal Markdown rendering.

## Staleness model

A source-linked entry is stale when a source is missing or its SHA-256 hash changes. An unscoped entry moves to review when the project-structure hash changes or its review age exceeds the configured threshold. Older entries without metadata are marked untracked rather than trusted silently.

This model is deliberately explainable. It does not claim that unchanged files guarantee a correct decision, only that known invalidation signals have not fired.

## Graph model

Each indexed source file is a node containing language, size, imports, and symbols. Resolved relative imports create local directed edges. Reverse edges support impact analysis. Package imports remain external dependencies, while relative imports that cannot be resolved are counted as unresolved local imports.

Parsing is best-effort and bounded by configuration limits. The project should remain useful even when some languages or framework conventions cannot be resolved.

## Compatibility

- Node.js 20+
- Existing `.codex-memory/` directories are migrated in place.
- Runtime dependencies remain at zero.
- MCP uses newline-delimited JSON-RPC over stdio.

# MCP integration

CMI exposes local project intelligence over MCP stdio.

## Configuration

```bash
cmi mcp-config
```

Durable memory mutation is disabled by default. Enable it explicitly:

```bash
cmi mcp-config --write
```

Bulk reviewed-memory refresh requires another opt-in:

```bash
cmi mcp-config --write --bulk-refresh
```

## Protocol compatibility

Supported stable protocol versions:

- `2024-11-05`
- `2025-03-26`
- `2025-06-18`
- `2025-11-25`

The server echoes a supported requested version and otherwise responds with `2025-11-25`. It requires `initialize`, then `notifications/initialized`, before normal operations. Ping is allowed during initialization.

The transport is newline-delimited UTF-8 JSON-RPC over stdin/stdout. Logs are written only to stderr.

## Tools

Read/default tools include:

- durable-memory and project-graph search;
- ranked context-pack construction;
- bounded Git repository baseline collection;
- advisory project-boundary inference with confidence and provenance;
- review-only project-memory gap proposals;
- structured pre-change briefs combining baseline, context, boundaries, impact, risks, and verification;
- incremental/full scanning;
- status and workspace inventory;
- ignore explanation;
- graph summary and impact analysis;
- stale-memory checks.

Write-enabled processes additionally expose durable-memory creation and reviewed-memory refresh.

### Advisory boundary

`map_project_boundaries`, `suggest_project_memory`, and `prepare_change_brief` are evidence-labeled advisory tools. They do not declare architecture and do not write inferred facts. Their output explicitly distinguishes:

- directly observed Git, memory, path, workspace, and graph evidence;
- deterministic inference;
- confidence and known completeness limits;
- review proposals that require explicit human approval before durable storage.

## Resources

- `cmi://project/memory`
- `cmi://project/decisions`
- `cmi://project/mistakes`
- `cmi://project/architecture`
- `cmi://project/workspaces`
- `cmi://project/graph-summary`
- `cmi://project/baseline`
- `cmi://project/boundaries`

The baseline resource does not expose absolute local repository paths.

## Prompts

- `prepare_project_change` guides an agent to call `prepare_change_brief`, review evidence and unknowns, propose a minimal plan, and rescan after implementation.
- `review_stale_memory` guides an explicit human-reviewed stale-memory audit.

## Mutation boundary

`scan_project_intelligence` may update generated JSON and architecture Markdown caches, so it is not annotated read-only. Durable project memory remains unavailable unless the server process starts with `CMI_WRITE_ENABLED=1`.

Memory-gap suggestions never bypass this boundary. They remain proposals even in a write-enabled process until an agent or user explicitly calls a durable-memory write tool.

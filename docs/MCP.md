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

Read/default tools include memory search, context-pack construction, incremental/full scanning, status, workspace inventory, ignore explanation, graph summary, impact analysis, and stale-memory checks.

Write-enabled processes additionally expose durable-memory creation and reviewed-memory refresh.

## Resources

- `cmi://project/memory`
- `cmi://project/decisions`
- `cmi://project/mistakes`
- `cmi://project/architecture`
- `cmi://project/workspaces`
- `cmi://project/graph-summary`

## Prompts

- `prepare_project_change` guides a pre-change memory, impact, workspace, test, migration, and deployment-risk workflow.
- `review_stale_memory` guides an explicit human-reviewed stale-memory audit.

## Mutation boundary

`scan_project_intelligence` may update generated JSON and architecture Markdown caches, so it is not annotated read-only. Durable project memory remains unavailable unless the server process starts with `CMI_WRITE_ENABLED=1`.

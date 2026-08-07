# MCP integration

CMI exposes local project intelligence over MCP stdio.

## Configuration

Safe default:

```bash
cmi mcp-config
```

This keeps durable project writes disabled. Read-only durable history, memory search, graph intelligence, advisory pre-change analysis, and change-history queries remain available.

Enable durable project writes explicitly when a connected agent should create project memory, review memory lifecycle, or create BEFORE/DURING/AFTER change records:

```bash
cmi mcp-config --write
```

Bulk reviewed-memory refresh requires another opt-in:

```bash
cmi mcp-config --write --bulk-refresh
```

`--write` does not grant CMI permission to execute arbitrary project commands. The connected agent/user remains responsible for tests, builds, migrations, profilers, deployment tools, and other verification. CMI only stores the bounded evidence submitted to its interfaces.

## Protocol compatibility

Supported stable protocol versions:

- `2024-11-05`
- `2025-03-26`
- `2025-06-18`
- `2025-11-25`

The server echoes a supported requested version and otherwise responds with `2025-11-25`. It requires `initialize`, then `notifications/initialized`, before normal operations. Ping is allowed during initialization.

The transport is newline-delimited UTF-8 JSON-RPC over stdin/stdout. Logs are written only to stderr.

## Read/default tools

Read/default tools include:

- `search_project_memory` — search active durable memory and indexed project context;
- `build_project_context` — build a ranked task context pack;
- `get_repository_baseline` — bounded Git baseline without absolute local paths;
- `map_project_boundaries` — inferred boundary map with confidence and provenance;
- `suggest_project_memory` — review-only memory-gap proposals;
- `prepare_change_brief` — structured pre-change brief;
- `get_change_insights` — relevant completed changes, co-change evidence, verification patterns, and path-overlap calibration;
- `get_change_record` — read one durable change record;
- `list_change_records` — list bounded active/completed record summaries;
- `scan_project_intelligence` — incremental/full project scan;
- `get_project_memory_status` — memory/index/graph/workspace health;
- `list_project_workspaces` — detected workspaces;
- `explain_project_ignore` — explain ignore behavior;
- `get_project_graph` — compact graph statistics;
- `analyze_project_impact` — reverse-dependency impact analysis;
- `check_stale_memory` — active-memory stale/review audit plus inactive lifecycle inventory.

`search_project_memory` and `build_project_context` accept two evidence-policy controls:

- `stalePolicy: demote | include | exclude` — `demote` is the default and keeps stale/review evidence visible but down-ranked; `include` reduces that penalty for explicit inspection; `exclude` keeps only current reviewed/observed evidence;
- `includeInactive: true` — explicit historical-inspection mode for `deprecated`, `rejected`, or `superseded` memory. Inactive memory is excluded by default.

`scan_project_intelligence` may update generated CMI caches, so it is not annotated as read-only even though it does not create reviewed durable memory or change-history evidence.

## Write-enabled tools

When the server starts with `CMI_WRITE_ENABLED=1`, it additionally exposes:

- `start_change_record` — persist the BEFORE evidence snapshot;
- `observe_change_record` — append DURING observed paths and prediction comparison;
- `complete_change_record` — persist AFTER outcome, verification evidence/provenance, unexpected impact, and review-only learning candidates;
- `remember_project_knowledge` — persist an explicit reviewed fact, decision, or mistake;
- `refresh_project_memory` — refresh one uniquely identified active memory entry after review;
- `set_project_memory_state` — explicitly activate, deprecate, reject, or supersede one uniquely identified memory entry with reviewer/reason metadata.

Memory-ID prefixes used for reviewed mutations must resolve uniquely. CMI rejects ambiguous prefixes rather than mutating multiple entries. Bulk refresh remains separately gated and skips inactive knowledge.

Supersession requires a distinct active replacement memory ID. The full replacement ID is recorded in the old entry's lifecycle metadata.

Completed change records are immutable through the public change-record API. Additional work should start another record rather than rewriting completed history.

## Verification provenance

`complete_change_record.verifications[]` distinguishes two provenance classes:

- `reported` — a human or agent reports a named status. This is the default when no stronger metadata is supplied;
- `observed-command` — the caller supplies bounded command-result metadata: `command`, integer `exitCode`, `observedAt`, and optional `outputDigest`.

`observed-command` does **not** mean CMI executed or independently attested the command. It means command-result metadata was supplied through the interface. CMI still never runs arbitrary project verification commands itself.

The MCP input schema enforces the required command metadata whenever `provenance` is `observed-command`, and the runtime validates the same durable record shape.

## Advisory and historical boundaries

`map_project_boundaries`, `suggest_project_memory`, `prepare_change_brief`, and `get_change_insights` expose evidence-labeled intelligence. They do not declare architecture or causality.

The output distinguishes:

- directly observed Git, reviewed memory, path, workspace, and graph evidence;
- deterministic inference;
- historical correlation;
- sample-sensitive confidence and support;
- known completeness limits;
- review proposals requiring explicit approval before durable project knowledge is written.

In particular:

- a co-change edge means two paths/boundaries appeared in the same stored change records, not that one causes or depends on the other;
- a changed path is direct edit evidence, not proof of complete runtime impact;
- a verification `passed` value remains stored evidence with explicit provenance, not a command independently executed by CMI;
- inactive memory is preserved as project history but is not trusted retrieval input unless explicitly requested.

## Resources

- `cmi://project/memory`
- `cmi://project/decisions`
- `cmi://project/mistakes`
- `cmi://project/architecture`
- `cmi://project/workspaces`
- `cmi://project/graph-summary`
- `cmi://project/baseline`
- `cmi://project/boundaries`
- `cmi://project/change-history`

The baseline resource does not expose absolute local repository paths. The change-history resource returns bounded summaries rather than source diffs. Raw memory resources remain reviewable Markdown and may contain inactive lifecycle history; ranked memory search excludes that inactive knowledge by default.

## Prompts

- `prepare_project_change` guides an agent to inspect relevant completed change history, then build the structured pre-change brief and treat inferred/history-derived signals as advisory.
- `run_change_intelligence_loop` guides an explicitly write-enabled agent through BEFORE → DURING → AFTER and tells it to run real project verification through its normal tools before recording results.
- `review_stale_memory` guides an explicit human-reviewed health/lifecycle audit: refresh knowledge that remains valid, or explicitly deprecate/reject/supersede knowledge that no longer should drive future work.

Prompts do not bypass tool permissions. A prompt can recommend `start_change_record`, but that tool does not exist in a read-only server process.

## Change-record trust model

Change records live under `.codex-memory/changes/`. They are local durable evidence and are intentionally reviewable/commit-friendly.

CMI excludes `.codex-memory/` paths from observed product-change scope. This prevents the act of updating a record from becoming a false application-code change.

For clean Git worktrees, new project changes can receive `strong` attribution. Pre-existing project changes produce `limited-preexisting-worktree` attribution. Non-Git projects use `explicit-files-only` attribution.

See [Change Intelligence](CHANGE_INTELLIGENCE.md) for the complete lifecycle, metrics, limitations, and learning policy.

## Durable-memory mutation boundary

Durable memory mutations share a local write lock so `remember`, reviewed refresh, and lifecycle mutation do not overwrite each other when multiple local writers operate concurrently. Writes remain local and bounded; stale locks are reclaimable after a short safety window.

New durable entries carry `schemaVersion: 1` and start with `lifecycle.state: active`. Existing metadata without a schema version remains readable for compatibility and is upgraded when explicitly refreshed or lifecycle-mutated.

Memory-gap suggestions and learning candidates never bypass the write boundary and never become durable project truth automatically.

The safe intended flow is:

```text
read evidence
→ agent/human reasoning
→ explicit durable record or reviewed memory write
→ later review/refresh/deprecate/reject/supersede when evidence changes
```

Bulk memory refresh remains separately guarded even in a write-enabled process.

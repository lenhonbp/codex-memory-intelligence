# Durable Memory Lifecycle

CMI durable memory is local, human-reviewable project knowledge stored in `.codex-memory/memory.md`, `decisions.md`, and `mistakes.md`.

The lifecycle exists to prevent old or disproven knowledge from continuing to drive agent context while preserving an auditable project history.

## Entry metadata

New durable entries carry metadata with `schemaVersion: 1` and begin in the active state:

```json
{
  "schemaVersion": 1,
  "id": "<uuid>",
  "type": "fact | decision | mistake",
  "createdAt": "<ISO timestamp>",
  "sources": [],
  "sourceHashes": {},
  "projectHash": "<hash-or-null>",
  "lifecycle": {
    "state": "active"
  }
}
```

Older tracked entries without `schemaVersion` remain readable for compatibility. An explicit refresh or lifecycle mutation upgrades their metadata to schema version 1.

## Lifecycle states

### `active`

The entry may participate in normal ranked retrieval, subject to its stale/review evidence status.

### `deprecated`

The knowledge may describe an older practice or design that is no longer recommended. It remains historical evidence but is excluded from normal task context.

### `rejected`

The knowledge was reviewed and determined not to be trustworthy or applicable. It remains visible only through explicit historical inspection.

### `superseded`

A newer active durable entry replaces this one. Supersession requires a distinct active replacement ID, and CMI records the full replacement ID.

## Lifecycle mutation

CLI:

```bash
cmi memory-state <id> deprecated \
  --reason "Retry policy was replaced" \
  --changed-by reviewer

cmi memory-state <old-id> superseded \
  --reason "The new decision replaces this one" \
  --superseded-by <new-id>
```

MCP write-enabled servers expose `set_project_memory_state` with equivalent fields.

Every lifecycle mutation requires a reason and records:

- `state`;
- `changedAt`;
- `changedBy`;
- `reason`;
- `supersededBy` when applicable.

Memory ID prefixes must resolve uniquely. Ambiguous prefixes fail closed.

## Retrieval policy

Normal `cmi search` and `cmi context` exclude inactive lifecycle states.

Historical inspection is explicit:

```bash
cmi search "retry policy" --include-inactive --stale-policy include
```

MCP search/context tools provide the equivalent `includeInactive: true` option.

Inactive knowledge is preserved in raw Markdown resources and stale/lifecycle reports, but does not make project memory unhealthy merely because it is intentionally inactive.

## Stale evidence is separate from lifecycle

Lifecycle answers **whether reviewed knowledge should still drive current work**.

Stale status answers **whether active knowledge still matches its source/project evidence**.

An active entry may therefore be:

- `reviewed-current`;
- `review`;
- `stale`;
- `untracked`/unknown for legacy or incomplete metadata.

Search/context stale policies are:

- `demote` — default; keep stale/review evidence visible but down-rank it strongly;
- `include` — keep it visible with a smaller historical-inspection penalty;
- `exclude` — use only current reviewed/observed evidence.

Lifecycle filtering happens independently: inactive knowledge stays excluded unless `includeInactive` is explicitly enabled.

## Refresh semantics

`cmi refresh-memory <id>` is for an **active entry that was actually reviewed against current evidence**.

Refreshing does not mean “make this true again.” It updates source/project fingerprints and review metadata after review.

CMI refuses to refresh one inactive entry. Reactivate it explicitly first if review determines that it should again drive current work.

Bulk refresh:

```bash
cmi refresh-memory all
```

is available in the CLI and separately gated in MCP. Bulk refresh skips intentionally inactive entries.

## Concurrent local writers

`remember`, reviewed refresh, and lifecycle mutation share one local project write lock. This prevents one writer from replacing a Markdown file using an older read while another writer is appending new durable knowledge.

The lock lives under the already ignored `.codex-memory/snapshots/` directory, is process-local metadata only, and is removed after the mutation. A lock older than the implementation's fixed short safety window can be reclaimed so a crashed writer does not permanently block the project.

This is local concurrency protection, not a distributed lock and not a cloud synchronization protocol.

## Review policy

CMI does not automatically turn stale memory into deprecated/rejected memory, does not automatically reactivate knowledge, and does not automatically choose a superseding entry.

The intended flow is:

```text
observed current project evidence
→ human or explicitly reviewed agent reasoning
→ refresh active knowledge
   OR deprecate / reject / supersede it
→ future retrieval follows the reviewed state
```

This keeps project history distinct from project truth while avoiding silent deletion.

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

The entry may participate in normal ranked retrieval, subject to its freshness and review evidence status.

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

When an active lifecycle mutation is used to attest semantic review, CMI records the complete review tuple `reviewedAt`, `reviewedBy`, and `reviewReason`. The schema and runtime validator require that tuple as one unit; a partial review tuple is invalid.

Memory ID prefixes must resolve uniquely. Ambiguous prefixes fail closed.

## Retrieval policy

Normal `cmi search` and `cmi context` exclude inactive lifecycle states.

Historical inspection is explicit:

```bash
cmi search "retry policy" --include-inactive --stale-policy include
```

MCP search/context tools provide the equivalent `includeInactive: true` option.

Inactive knowledge is preserved in raw Markdown resources and stale/lifecycle reports, but does not make project memory unhealthy merely because it is intentionally inactive.

## Freshness is not semantic review

Lifecycle answers **whether knowledge is active or intentionally inactive**.

Source/project freshness answers **whether the fingerprints CMI tracks still match current evidence**.

Semantic review answers a different question: **whether a human or explicitly identified reviewer has re-checked the meaning of that knowledge against current evidence**.

CMI keeps these states separate. An active retrieval result may therefore carry:

- `reviewed-current` — source/project freshness is current **and** a complete semantic-review tuple exists that is at least as recent as the latest source-fingerprint refresh;
- `fresh-source` — tracked source/project fingerprints are current, but current semantic review is not attested;
- `review` — project-level evidence changed or age policy requires review;
- `stale` — a linked source is missing, unreadable, unsafe, or has a different fingerprint;
- `untracked`/unknown — legacy or invalid/incomplete metadata that cannot support normal review claims;
- `blocked` — a required durable memory file itself cannot be safely read or validated.

A newly remembered source-linked fact is therefore normally `fresh-source`, not `reviewed-current`. Source freshness is useful evidence, but it must never impersonate review provenance.

Search/context stale policies are:

- `demote` — default; keep stale/review evidence visible but down-rank it strongly; `fresh-source` remains usable but receives less trust boost than `reviewed-current`;
- `include` — keep review/stale evidence visible with a smaller historical-inspection penalty;
- `exclude` — exclude stale/review/untracked evidence while still permitting current source-linked evidence. The result metadata continues to distinguish `fresh-source` from `reviewed-current`.

Lifecycle filtering happens independently: inactive knowledge stays excluded unless `includeInactive` is explicitly enabled.

## Refresh semantics

`cmi refresh-memory <id>` refreshes **source/project freshness evidence only**. It updates source/project fingerprints plus `sourceRefreshedAt`, `sourceRefreshedBy`, and `sourceRefreshReason`; it does not assert that the knowledge was semantically reviewed.

If a previous semantic review predates a later source refresh, retrieval falls back to `fresh-source`. This prevents a mechanical fingerprint refresh from inheriting an older review as if meaning had just been re-validated.

Semantic review is explicit. After a reviewer has checked the meaning of an active entry against current evidence, use:

```bash
cmi memory-state <id> active \
  --reason "Reviewed against current source behavior" \
  --changed-by reviewer
```

That records `reviewedAt`, `reviewedBy`, and `reviewReason` together.

CMI refuses to refresh one inactive entry. Reactivate it explicitly only when review determines that it should again drive current work.

Bulk refresh:

```bash
cmi refresh-memory all
```

is available in the CLI and separately gated in MCP. Bulk refresh skips intentionally inactive entries.

## Fail-closed durable memory reads

The three durable knowledge files are trust-bearing evidence, so CMI distinguishes **no entries** from **a file that exists but cannot be trusted**.

If `memory.md`, `decisions.md`, or `mistakes.md` is unsafe or unreadable — for example a symlink replacement, an oversized file, or another bounded-read/storage failure — CMI reports that file as `blocked` instead of silently treating it as empty.

Consequences:

- project evidence health becomes blocked/degraded rather than healthy-empty;
- normal durable-memory search refuses to present results as trustworthy while a required file is blocked;
- refresh preflights all durable memory files and refuses mutation while the set is blocked;
- `cmi stale --json` exposes the file-level diagnostic needed for recovery.

CMI deliberately does not auto-delete, auto-truncate, or recreate the offending file because doing so could destroy recoverable evidence.

## Concurrent local writers

`remember`, source-fingerprint refresh, and lifecycle mutation share one local project write lease. This prevents one writer from replacing a Markdown file using an older read while another writer is appending new durable knowledge.

The lease lives under the already ignored `.codex-memory/snapshots/` directory, carries an owner ID, is heartbeat-refreshed while live, and is removed only by the matching owner. Stale reclamation rechecks owner identity so an old writer cannot delete a replacement lease.

This is local concurrency protection, not a distributed lock and not a cloud synchronization protocol.

## Review policy

CMI does not automatically turn stale memory into deprecated/rejected memory, does not automatically reactivate knowledge, and does not automatically choose a superseding entry.

The intended flow is:

```text
observed current project evidence
→ refresh source fingerprints when needed
→ label source-current evidence as fresh-source
→ human or explicitly reviewed agent reasoning
→ explicitly attest active semantic review
   OR deprecate / reject / supersede it
→ future retrieval follows freshness + reviewed lifecycle evidence
```

This keeps project history, source freshness, and reviewed project truth distinct while avoiding silent deletion.

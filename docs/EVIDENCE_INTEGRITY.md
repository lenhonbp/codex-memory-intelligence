# Evidence Integrity

CMI v0.9 introduces a shared evidence-integrity layer. The goal is not to make CMI appear more certain; it is to make every current-evidence claim carry the same explicit health and attribution rules.

## Portable evidence and executable provenance

`cmi evidence freeze` exports only the intended `.codex-memory` evidence boundary into a directory bundle with a deterministic, path-independent identity. The manifest records CMI version/source information, source-content identity, observable Git repository identity and revision, evidence/cache format, sorted artifact inventory, and SHA-256 content digests. Freeze metadata such as time and diagnostic location is excluded from the identity digest.

`cmi evidence inspect` validates the manifest and every bounded artifact. `restore` and `rebind` verify source-content compatibility before any write. They distinguish `exact`, `compatible-relocated`, and `compatible-content-only` states from `mismatch`; mismatches, unsafe paths, symlinks, unsupported schemas, digest failures, blocked evidence, and destination conflicts fail closed. Rebind is an explicit user request, not a trust override, and records original identity plus verification in `.codex-memory/portable-provenance.json` without fabricating semantic review.

Portable evidence is not an authenticated backup: SHA-256 detects corruption but does not authenticate the bundle or prove source authorship. Source identity is content-based and repository/revision-aware when Git evidence is available; absolute paths are diagnostic only.

`cmi provenance --json` is the canonical executable diagnostic. It reports the actual invoked script/runtime, resolved package root/version, install/invocation kind, source checkout revision and dirty state when observable, project-local candidates, and ambiguity limitations. Unknown values remain unknown, and the collector never infers the running package from the current working directory's package metadata.

## Evidence health

`status --json` and context packs expose a versioned Evidence Health Model with:

- overall state: `healthy`, `degraded`, `blocked`, or `uninitialized`;
- storage, index, graph, and durable-memory domains;
- capability state for durable memory, graph context, impact analysis, and historical records;
- evidence-linked reasons and deterministic recovery actions.

A current but truncated graph is `degraded` and graph/impact capability is `partial`. A stale/missing graph is `blocked` for graph/impact current-evidence claims. Stale or review-required memory degrades durable-memory trust without pretending all local historical evidence is unusable.

## Git-history continuity

Change/session attribution now checks whether the recorded start HEAD is an ancestor of the current HEAD before using a start-to-current Git diff as committed-path evidence.

States are:

- `same-head` — no committed history movement;
- `descendant` — start HEAD is an ancestor, so bounded committed-path attribution is allowed;
- `rewritten` — a merge base exists but start HEAD is no longer an ancestor, as after many rebase/reset workflows;
- `unrelated` — no usable merge base;
- `unavailable` — a full Git baseline is not available.

For `rewritten`, `unrelated`, or `unavailable` continuity, CMI does not automatically turn `git diff start current` paths into session/change attribution. Explicit observed paths and worktree evidence remain available and are labeled separately.

## Durable runtime contracts

CMI keeps JSON Schemas human/tool-readable, but v0.9 also validates trust-critical durable structures at runtime:

- versioned memory metadata and lifecycle/refresh/review provenance;
- session observations and close evidence;
- findings, recommendations, guardrails, and handoffs;
- persistent findings registry.

Durable memory, session, handoff, and finding identities use canonical UUIDs in both runtime validation and their versioned JSON Schemas. Required trust fields such as finding occurrence counts are also parity-checked.

Critical schema versions and enums are checked during repository quality validation, so a runtime/schema mismatch is a CI failure rather than documentation drift.

Legacy memory metadata remains readable for compatibility. New/versioned metadata is held to the current contract. Invalid versioned metadata is treated as untracked evidence instead of reviewed-current knowledge.

## Non-goals

Evidence Integrity does not make CMI a compiler, LSP, runtime analyzer, DLP system, or causal attribution engine. Git ancestry only establishes whether a start-to-current diff is structurally safe to use as bounded path evidence; it does not prove that every changed path belongs causally to the recorded task.

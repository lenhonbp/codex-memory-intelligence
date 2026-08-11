# Evidence Integrity

CMI v0.9 introduces a shared evidence-integrity layer. The goal is not to make CMI appear more certain; it is to make every current-evidence claim carry the same explicit health and attribution rules.

## Portable evidence and executable provenance

`cmi evidence freeze` exports only the intended `.codex-memory` evidence boundary into a directory bundle with a deterministic, path-independent identity. The manifest records CMI version/source information, source-content identity, observable Git repository identity and revision, evidence/cache format, sorted artifact inventory, and SHA-256 content digests. Freeze metadata such as time and diagnostic location is excluded from the identity digest.

`cmi evidence inspect` validates the manifest and every bounded artifact. `restore` and `rebind` verify source-content compatibility before any write. They distinguish `exact`, `compatible-relocated`, `compatible-git-checkout`, and `compatible-content-only` states from `mismatch`; mismatches, unsafe paths, symlinks, unsupported schemas, digest failures, blocked evidence, policy drift, dirty-worktree evidence, and destination conflicts fail closed. Rebind is an explicit user request, not a trust override, and records original identity plus verification in `.codex-memory/portable-provenance.json` without fabricating semantic review.

Portable evidence is not an authenticated backup: SHA-256 detects corruption but does not authenticate the bundle or prove source authorship. The manifest freezes a bounded, validated scan/ignore policy and content identities for resolver/workspace inputs. Source identity is byte-exact by default; only exact Git repository/revision plus clean-worktree evidence may use the narrower UTF-8 LF checkout-compatibility identity. Absolute paths are diagnostic only.

`cmi provenance --json` is the canonical executable diagnostic. It reports the actual invoked script/runtime, resolved package root/version, install/invocation kind, source checkout revision and dirty state when observable, project-local candidates, and ambiguity limitations. Unknown values remain unknown, and the collector never infers the running package from the current working directory's package metadata.

## Diagnostic and recovery contracts

Fresh-project diagnostics are intentionally conservative. Before `cmi init`, `cmi status` reports `uninitialized`, recommends `cmi init`, and exits with a blocked status in both human and `--json` modes. After initialization, `cmi scan` is required before graph or impact claims are current. `cmi doctor` exits nonzero whenever overall evidence or a trust-critical domain is blocked; warnings do not become a healthy result merely because the command completed.

Blocked JSON output keeps the normal machine-readable error envelope (`{ "ok": false, "error": { "code", "message", "details" } }`) or the structured success payload used by commands such as `status` and `impact`. Recovery recommendations identify the next safe command where one exists. A recommendation is guidance, not proof that the command will succeed.

Portable restore/rebind mismatches include `details.recommendedAction` with `mutatesCmiState: false` and no automatic command. This deliberately requires review of the listed source, revision, policy, or worktree mismatch before retrying; the failed operation writes no CMI evidence. Human CLI output renders the same non-mutating review instruction without replacing the structured JSON details.

Successful compatibility verification after relocation is separate from generated-cache freshness. Copying source-identical files can change local filesystem fingerprints, so restored graph/index evidence may be stale even when restore or rebind correctly reports `compatible-relocated`, `compatible-git-checkout`, or `compatible-content-only`. `status --json` must expose that stale/blocked graph state and an actionable `cmi scan` recovery rather than report healthy current graph evidence. `cmi scan` rebuilds the generated graph/index for the new location; when no other problem exists, `status` and `doctor` then become healthy. The recovery scan does not re-attest or rewrite durable semantic memory, its review metadata, or change/session/finding/evaluation history.

## Evidence health

`status --json` and context packs expose a versioned Evidence Health Model with:

- overall state: `healthy`, `degraded`, `blocked`, or `uninitialized`;
- storage, index, graph, and durable-memory domains;
- capability state for durable memory, graph context, impact analysis, and historical records;
- evidence-linked reasons and deterministic recovery actions.

A current but truncated graph is `degraded` and graph/impact capability is `partial`. A stale/missing graph is `blocked` for graph/impact current-evidence claims. Stale or review-required memory degrades durable-memory trust without pretending all local historical evidence is unusable.

Session/Closing presentation may classify one narrow stale-graph case as a non-blocking refresh reminder: the session started with current graph evidence, every stale node path is inside the session's attributed mutation scope, and no structural/configuration/discovery drift is present. This does not change Evidence Health: the graph remains stale and graph/impact capability remains blocked until `cmi scan`. Pre-existing, unexplained, missing-node, source-set, resolver/workspace, scan-policy, discovery, or format drift remains material.

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

Marker-free legacy memory remains untracked and valid legacy metadata remains readable for compatibility. New/versioned metadata is held to the current contract. A present invalid or future metadata marker is blocked from retrieval and mutation instead of being treated as ordinary untracked or reviewed-current knowledge.

## Non-goals

Evidence Integrity does not make CMI a compiler, LSP, runtime analyzer, DLP system, or causal attribution engine. Git ancestry only establishes whether a start-to-current diff is structurally safe to use as bounded path evidence; it does not prove that every changed path belongs causally to the recorded task.

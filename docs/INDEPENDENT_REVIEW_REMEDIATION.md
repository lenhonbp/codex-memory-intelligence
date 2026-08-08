# Independent Review Remediation

This document tracks the remediation of the independent technical review performed against the exact public CMI v0.9.1 release (`b7297938f4c390084cf443b8f896e6679e5b0d63`).

It is intentionally narrower than a release claim. A finding is marked resolved only when the implementation contract and a regression test support that status. Empirical usefulness items remain open until real evidence exists.

## Trust-boundary findings

| Review finding | Remediation status | Implemented contract |
| --- | --- | --- |
| MCP-001 safe MCP scan mutation | RESOLVED | `scan_project_intelligence` is write-gated, absent from safe/default tool discovery, and a direct tool call is rejected before scanning/writing. |
| GRAPH-001 false `current/healthy` after source/config drift | RESOLVED for freshness contract | Graph stores a freshness descriptor covering the source set, resolver inputs, workspace inputs, scan configuration, and `.cmiignore`; health re-discovers those inputs and blocks impact when they drift or cannot be established. |
| MEM-001 refresh shown as `reviewed-current` | RESOLVED | `fresh-source` is distinct from `reviewed-current`; review requires a complete review tuple at least as recent as the latest source refresh. |
| MEM-002 unsafe/unreadable memory shown as healthy empty | RESOLVED | Required durable memory files that are unsafe, oversized, or unreadable produce blocked diagnostics; search/refresh fail closed instead of silently dropping them. |
| FIND-001 corrupt findings shown as empty | RESOLVED | Missing registry is valid empty; an existing invalid/unsafe registry raises `CMI_FINDINGS_BLOCKED`, and normal mutations cannot overwrite it. |

## Automation and contract findings

| Review finding | Remediation status | Implemented contract |
| --- | --- | --- |
| CLI-001 blocked impact exits 0 | RESOLVED | Blocked impact remains structured output but exits with code `2`, distinct from command/usage error code `1`. |
| CLI-002 unknown flags / inconsistent JSON errors | RESOLVED for current CLI surface | Unknown options fail; required option values are checked; `--json` failures emit one parseable error object on stderr. |
| SCHEMA-001 review tuple schema/runtime drift | RESOLVED | JSON Schema now requires `reviewedAt`, `reviewedBy`, and `reviewReason` together whenever any one is present. |

## Multi-language analysis

Status: **PARTIALLY RESOLVED / intentionally advisory**.

The independently reproduced regressions are covered:

- JavaScript import-like text inside comments/ordinary strings no longer creates those false import edges;
- Python `from . import util` resolves the local sibling module;
- Rust `crate::thing::value` can resolve the containing module rather than requiring the full symbol path to be a file path.

CMI still uses bounded heuristic parsing. It is not a compiler, language server, or semantic dependency proof. Future language work should be driven by reproduced false-positive/false-negative cases and regression corpora rather than broad claims of compiler-grade support.

## Graph freshness contract

A graph is `current` only when both node fingerprints and repository-discovery inputs still match the scan baseline.

The stored descriptor includes:

- complete candidate source-set count/hash before graph truncation;
- resolver-input fingerprints (`tsconfig`/`jsconfig`, `go.mod`, `Cargo.toml`);
- workspace-manifest fingerprints;
- normalized scan configuration, including ignore patterns and graph/source limits;
- `.cmiignore` fingerprint.

Health checks re-walk repository metadata using the same ignore boundary. If a legacy graph has no freshness descriptor, or the discovery state cannot be established safely, health fails closed and requires a rescan.

This improves freshness confidence. It does **not** make regex/heuristic edges semantically complete.

## Memory trust contract

CMI now separates three concepts:

1. source/project fingerprints are current;
2. semantic review is current;
3. durable storage is readable and safe.

`fresh-source` represents (1) without pretending (2). `reviewed-current` requires both. A blocked durable memory file prevents normal search from presenting a partial subset as if it were complete project memory.

No recovery path silently deletes or rewrites a blocked memory file.

## Findings trust contract

`findings.json` has a fail-closed distinction:

- absent: valid empty registry;
- present and valid: readable/mutable;
- present but malformed, oversized, symlinked, non-regular, or unsafe: blocked.

The blocked state protects potentially recoverable bytes from a normal mutation that would otherwise replace corruption with an empty registry.

## Evaluation finding

Review finding EVAL-001 is **not a normal implementation bug**. `sourceKind`, reviewer identity, and externally executed stress scenarios cannot be independently authenticated by a local library solely from caller input.

CMI therefore keeps the existing bounded validation/aggregation mechanics and documents the assurance correctly:

- provenance classes are caller-attested unless an external study process adds stronger assurance;
- controlled-stress outcome is derived from supplied counts but the scenario itself is not independently executed by CMI;
- human/agent metrics remain separate;
- self-host/synthetic evidence cannot inflate declared external-real observational coverage.

See [Empirical Validation Protocol](EMPIRICAL_VALIDATION.md) for the stronger study design needed to support product-value claims.

## Performance finding

The large-repository review result remains **PARTIAL / empirically open**.

Synthetic 6,000-file and smoke benchmarks are useful regression evidence, not a claim about arbitrary real monorepos. The remediation does not relabel those measurements as real-world scale proof.

The new graph health check performs repository metadata discovery so `current` can detect source-set/config drift. Benchmark smoke remains part of CI; real mixed-language monorepo measurements should be added as observational evidence when available.

## Regression coverage added

The remediation suite explicitly covers the independent review reproductions:

- safe MCP cannot discover or directly execute scan writes without write opt-in;
- source added after scan invalidates graph freshness;
- resolver alias target changes invalidate graph freshness;
- impact refuses stale/discovery-drifted graph evidence;
- source refresh does not create semantic-review provenance;
- oversized durable memory becomes blocked;
- symlinked durable memory becomes blocked where the platform permits symlink testing;
- corrupt findings block read/mutation and original bytes remain unchanged;
- unknown CLI flags fail;
- JSON CLI errors are machine-parseable;
- blocked impact uses a nonzero exit code;
- memory review conditional schema matches runtime;
- JS comment/string, Python relative import, and Rust crate-path regressions are locked.

## Preserved product boundaries

This remediation intentionally preserves:

- local-first operation;
- zero runtime dependencies;
- Markdown/JSON human-reviewable persistence;
- explicit provenance/evidence classes;
- no arbitrary project command execution;
- source refresh distinct from semantic review;
- historical correlation distinct from causality;
- lease-lock/atomic-write architecture;
- graph truncation/degraded signaling;
- advisory rather than autonomous behavior.

CMI is still not an autonomous coding agent, CI system, cloud project database, deployment system, business-priority authority, or automatic truth generator.

## Still open by design

The remediation does not claim to have solved empirical questions that require external evidence:

- controlled A/B comparison versus plain Codex/Git/source search;
- repeated longitudinal human review across independent real repositories;
- externally authenticated repository/reviewer provenance;
- compiler-grade semantic precision across all supported languages;
- arbitrary real-world monorepo performance/generalization;
- full OS-level adversarial race coverage on every filesystem/platform;
- universal MCP client compatibility.

These remain explicit evidence gaps, not hidden implementation claims.

## Release discipline

This work is a remediation candidate based on v0.9.1. It does not by itself change the public package version, publish npm, create a release, or justify a v1.0 claim.

A later release decision should require:

1. full cross-platform CI/package/benchmark validation on the final remediation head;
2. security/static-analysis review;
3. review of the exact branch diff;
4. explicit release/version decision;
5. continued separation between engineering correctness and empirical usefulness.

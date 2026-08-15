# Deprecation Policy

This policy defines how CMI deprecates and removes parts of its **public contract**: CLI commands and flags, MCP tools and schemas, JSON output shapes, durable storage formats, and shipped Skill adapters. It addresses the deprecation-policy gate identified by the v1 readiness audit. It does not imply that all v1 readiness gates are closed or that a v1 stability promise has been made.

The policy is deliberately conservative because CMI's durable state is written into user repositories and read by agent runtimes that cannot be upgraded atomically.

## Principles

1. **Durable data is never silently discarded or rewritten.** Versioned durable state (memory, changes, sessions, findings, evaluations, config) follows the persistence-compatibility rules in `docs/PERSISTENCE_COMPATIBILITY.md` first; this policy governs the *announcement and removal cadence*, not the data-conversion rules.
2. **Breaking changes are additive until v1.** Fields are added, not removed, and old fields keep their previous semantics for at least one supported transition period.
3. **Deprecation is announced, not discovered.** Every deprecation is documented in the CHANGELOG `### Deprecated` section, and where practical the CLI/MCP surface emits a bounded machine-readable deprecation notice instead of failing silently differently.
4. **One supported transition period is the minimum.** A deprecated surface must remain functional for at least **two supported public releases** (approximately the current release plus the next) before removal, unless a security or integrity incident requires faster action under the security policy.
5. **No removal without a migration or fail-closed path.** When a surface is removed, old inputs must either keep working through compatibility handling or fail closed with a diagnostic that names the replacement.
6. **Deprecation is not an evidence-class promotion.** Removing a feature or field never upgrades historical evidence that depended on it; retained historical evidence keeps its original labels.
7. **MCP safety gates are non-degradable.** MCP deprecation or removal must never weaken the existing read-only default, explicit write opt-in, or mutation-safety gates.
8. **Skill deprecation does not imply third-party runtime control.** Deprecating a shipped CMI Skill artifact does not imply that CMI controls a third-party agent runtime's installation, discovery, placement, activation, or automatic selection.
9. **Durable-state compatibility preserves reviewed provenance.** Compatibility forbids silent deletion, downgrade, rewrite, or reclassification of reviewed provenance or evidence state. Unsupported durable state must remain compatible where explicitly supported or fail closed with a recovery or replacement diagnostic.

## Scope and stages

| Stage | Meaning | Minimum duration |
|---|---|---|
| **Current** | Supported and documented | — |
| **Deprecated** | Still functional; CHANGELOG notice; optional bounded deprecation notices in output | Two supported public releases |
| **Removed** | No longer functional; old inputs fail closed with a diagnostic naming the replacement | — |
| **Never exposed** | Surfaces that were simulation-only or NO-GO (for example, the production Evidence Contract negotiation surface) are documented as intentionally absent and never enter the deprecated→removed pipeline | — |

The `Never exposed` category exists because CMI keeps some capabilities deliberately unexposed (the `PRODUCTION_CONTRACT_SURFACE_NO_GO` gate). Those capabilities must never be listed as deprecated, which would imply they were once part of the public contract.

## What counts as the public contract

- CLI commands, positional arguments, flags, exit codes, and documented JSON output shapes;
- MCP tools, resources, prompts, request/response schemas, and the safe/write gate semantics;
- the durable storage contract documented in `docs/PERSISTENCE_COMPATIBILITY.md`;
- the real-corpus manifest contract (`schemaVersion`, `kind`, repository fields, `repoClass` allow-list) and the evaluation-record contract;
- the eight shipped Skill adapter documents under `skills/`.

The following are explicitly **not** covered by this policy and may change without deprecation: generated caches (rebuildable), internal `.codex-memory/` file layout details not documented as contract, parser best-effort advisory quality, and temporary CLI-internal files.

## Procedure

When a maintainer decides to deprecate or remove a public surface:

1. Announce the deprecation in `CHANGELOG.md` under `### Deprecated`, naming the affected surface, the reason, the replacement, and the earliest supported release in which removal may occur.
2. Add or keep bounded deprecation notices on the affected CLI/MCP path where feasible; notices must not change the exit code or JSON shape of successful calls (a new dedicated field or stderr notice is acceptable).
3. Keep the surface functional for the transition period; add a regression test that asserts the deprecated path still behaves as documented.
4. Before removal, add fail-closed diagnostics with the replacement name; update `docs/PERSISTENCE_COMPATIBILITY.md` when durable state is affected.
5. Remove in the release following the completed transition period, documented under `CHANGELOG.md` `### Removed`.
6. Record the removal in `docs/RELEASE_STATUS.md` if it changes the supported capability list.

## Security exception

A deprecated or supported surface that is demonstrated to enable a high-severity integrity or security failure may be disabled immediately under `SECURITY.md`, with the exception rationale documented in the release record. This exception never applies to silent data loss: even under the exception, versioned durable state follows the persistence-compatibility no-silent-rewrite rule.

## Relationship to versioning

CMI remains pre-v1 (`0.x`). This policy is the declared path to v1 stability, not a stability promise: semantic versions still follow SemVer with `0.x` breaking-release flexibility, and the two-release transition period applies from the point a formal deprecation is announced, regardless of how many `0.x` releases exist at that time. Once a v1.x line exists, the two-release minimum becomes a hard v1.x-compatibility commitment.

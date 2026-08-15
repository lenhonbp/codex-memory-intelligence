# Portable Schema Compatibility

This document is the public compatibility policy for CMI Portable Evidence bundle schema versions. It records what current CMI may write, inspect, restore, and rebind, and it keeps those claims bounded by executable regression coverage.

This is a pre-v1 support statement. It does not declare CMI v1 readiness, authentication, authorship, or universal historical compatibility.

## Supported matrix

| Portable schema | Status | First public release | Current writer | Inspect | Restore | Rebind | Manifest integrity state | Origin binding |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `2` | `legacy-supported` | `v0.12.0` | No | Yes | Yes | Yes | `legacy-partial` | `legacy-unbound` |
| `3` | `current` | `v0.12.1` | Yes | Yes | Yes | Yes | `verified` | `integrity-bound` |

The same matrix is encoded in `PORTABLE_SCHEMA_COMPATIBILITY` in `src/portable-manifest-integrity.js`. `tests/portable-compatibility-policy.test.js` verifies the published entries and exercises inspect, restore, and rebind for both supported schemas.

## Schema v2

Portable Evidence v2 was the public writer in `v0.12.0`. The released v2 identity algorithm binds deterministic core evidence identity and artifact digests but does not bind every provenance field that was present in the manifest.

Current CMI therefore keeps v2 supported with a deliberately demoted trust classification:

- v2 may be inspected, restored, and explicitly rebound;
- current CMI never writes new v2 bundles;
- `project.location` and the other legacy-unbound provenance fields cannot promote a v2 restore to `exact`;
- `samePathObserved` may describe an observed textual/resolved-path match, but `samePath` remains false for trust classification;
- a v2 manifest carrying a v3-style `integrity` block is invalid rather than treated as a hybrid format;
- released relocated v2 rebind provenance remains reusable only when the released fields still match the current demoted trust state.

This preserves compatibility without silently rewriting what a v2 digest historically meant.

## Schema v3

Portable Evidence v3 became the current writer in `v0.12.1`. It retains the deterministic core `identity.digest` and adds `integrity.digest` coverage `manifest-provenance-v1` for manifest provenance metadata.

Current CMI may inspect, restore, and rebind v3 bundles. Because the v3 origin location is integrity-bound, an otherwise exact restore at the frozen resolved location may retain `exact` compatibility classification.

Neither the v2 identity digest nor the v3 manifest-integrity digest authenticates the creator or proves source authorship. Portable Evidence continues to report `authenticated: false`.

## Unsupported schemas

Any schema version outside the published matrix is unsupported. Current CMI must fail closed with `CMI_PORTABLE_SCHEMA_UNSUPPORTED` before treating the bundle as supported evidence.

Unsupported bundles are not:

- downgraded to v2 or v3;
- rewritten in place;
- best-effort parsed as a supported schema;
- used to upgrade trust or provenance state.

Recovery requires a compatible/newer CMI version or an explicit future migration mechanism that preserves source bundles and reviewed provenance.

## Lifecycle and removal policy

Schema v2 is **supported**, not deprecated, at the time of this policy.

If a future release decides to deprecate a supported portable schema, that change is part of the public contract and must follow `docs/DEPRECATION_POLICY.md`: announce the deprecation, keep the surface functional for the required supported-release transition period, provide a migration or fail-closed replacement path, and never silently discard or reinterpret durable provenance.

A future writer schema may be added without removing v2/v3 support. A future removal requires its own explicit compatibility decision and evidence.

## Release provenance and historical correction

Release source establishes the public predecessor chain:

- `v0.12.0:src/portable-evidence.js` declares `PORTABLE_SCHEMA_VERSION = 2`;
- `v0.12.1:src/portable-manifest-integrity.js` declares legacy schema `2` and current schema `3`.

The Phase-3 compatibility audit in `docs/PERSISTENCE_COMPATIBILITY.md` predates that completed public predecessor chain and recorded Portable Evidence as having no released predecessor at that audit checkpoint. That sentence remains historical audit evidence; this policy supersedes it for the current supported Portable Evidence contract.

## Evidence boundary

The compatibility matrix establishes engineering behavior for the listed schemas. It does not prove productivity improvement, application correctness in target repositories, authenticated provenance, or CMI v1 readiness.

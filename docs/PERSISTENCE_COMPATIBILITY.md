# Persistence Compatibility and Migration Evidence

Phase 3 audit date: 2026-08-09 (Asia/Ho_Chi_Minh)

This document records executable compatibility evidence for the current `0.9.2` source line. It is a bounded pre-v1 support statement, not a promise to support every historical format or a `v0.10.0` release declaration.

## Scope and supported historical floor

The release tags were inspected before fixture creation. The smallest representative floor is:

| Data class | Historical release | Historical/current format | Classification |
| --- | --- | --- | --- |
| Config | `v0.5.0` (`e2b40f5c9e84691a31e6b3cb9f175d426c3e52a0`) | config `version: 4` → `version: 4` | Read-compatible; no migration |
| Reviewed memory metadata | `v0.5.0` | legacy metadata with no `schemaVersion` → memory metadata schema `1` | Read-compatible; remains source/review-labeled; no migration |
| Agent instructions and authored Markdown | `v0.5.0` | plain Markdown → plain Markdown | Read-compatible; no schema migration |
| Project index | `v0.5.0` | index schema `5` → index schema `5` | Read-compatible; generated state can be rebuilt |
| Project graph | `v0.5.0` | graph schema/parser `3/3` → `4/4` with freshness descriptor | Generated rebuild required |
| Change records | `v0.7.0` (`4034aad923dbc6d53e74dfa9b9cb56bcb808fe09`) | change record schema `1` → `1` | Read-compatible; no migration |
| Sessions and handoffs | `v0.8.0` (`aaae517c75817871b37b9fc55cec8e7b3d1ee100`) | session/handoff schema `1` → `1` | Read-compatible; bounded legacy fallback allowance; no migration |
| Findings | `v0.9.0` (`6ae92975ff93b939f40e8397f29f2eb3d6f203d9`) | findings registry schema `1` → `1` | Read-compatible; no migration |
| Evaluations | `v0.9.1` (`b7297938f4c390084cf443b8f896e6679e5b0d63`) | evaluation record schema `1` → `1` | Read-compatible; provenance remains unreviewed/caller-attested |
| Portable provenance/evidence | No released predecessor | Current Phase 1 schema only | Current-only; future schema rejection is tested, but no historical promise is made |

The chosen tags correspond to the releases where the relevant persistence surface existed. A class absent from an earlier release is not treated as an incompatibility.

## Fixture corpus

Fixtures are under [`tests/fixtures/compatibility/`](../tests/fixtures/compatibility/). [`manifest.json`](../tests/fixtures/compatibility/manifest.json) is the machine-readable provenance record and is validated by [`tests/compatibility.test.js`](../tests/compatibility.test.js).

| Fixture family | Source | Materialization and transformation | Expected behavior |
| --- | --- | --- | --- |
| `v0.5-config-memory` | `v0.5.0` / `e2b40f5...` | Minimized released config and legacy metadata; Markdown is deterministic and secret-free | Config and memory read without rewrite; review is not promoted |
| `v0.5-generated` | `v0.5.0` / `e2b40f5...` | Minimized released index and schema-3 graph with one path-independent source node | Index is current; graph is detected as obsolete and rebuilt |
| `v0.7-change` | `v0.7.0` / `4034aad...` | Minimized released active change record with deterministic IDs and empty observations | Read-compatible, no rewrite |
| `v0.8-session` | `v0.8.0` / `aaae517...` | Minimized closed session retaining the released id-less fallback `nextAction` | Read-compatible through a bounded legacy reader path, no rewrite |
| `v0.9-findings` | `v0.9.0` / `6ae9297...` | Minimized schema-1 registry and one deterministic finding | Read-compatible, no rewrite |
| `v0.9.1-evaluation` | `v0.9.1` / `b729793...` | Minimized observational self-host evaluation with no reviewer judgment | Read-compatible, remains unreviewed |
| `future-version-durable` | Synthetic-derived | Changes only `schemaVersion` to `999` on otherwise valid minimized records | Unsupported state is rejected, invalid, or blocked without overwrite |

No private project data, absolute machine paths, credentials, or byte-for-byte historical claims are present in the corpus. Minimized fixtures retain the contract fields needed for the tested behavior; synthetic future fixtures are explicitly rejection tests, not historical evidence.

## Executable compatibility matrix

| Fixture/data class | Current read result | Mutation result | Migration | Trust result | Preservation result | Verdict/failure mode |
| --- | --- | --- | --- | --- | --- | --- |
| `v0.5.0` config | `read-compatible` | `init` leaves equivalent bytes unchanged | No | User settings remain current config, not review evidence | Original config retained | `read-compatible-no-rewrite` |
| `v0.5.0` memory metadata | `read-compatible` | Search/status inspect only | No | Legacy entry remains review/untracked-labeled; no `reviewed-current` promotion | Original Markdown retained | `read-compatible-no-rewrite` |
| `v0.5.0` agent instructions | `read-compatible` | `init` does not replace existing file | No | Plain authored guidance is not upgraded to CMI evidence | Original Markdown retained | `read-compatible-no-rewrite` |
| `v0.5.0` index | Current generated index | `scan` may regenerate cache | No | Current only because schema `5` matches | Rebuildable cache | `read-compatible; generated state` |
| `v0.5.0` graph | Detected as obsolete; not current evidence | `scan` rebuilds graph | No | Graph/impact evidence is blocked until rebuild | Durable memory unchanged; review status unchanged | `generated-rebuild-required` |
| `v0.7.0` change | `read-compatible` with zero invalid records | Listing is read-only | No | Reported verification remains reported | Record bytes unchanged | `read-compatible-no-rewrite` |
| `v0.8.0` session | `read-compatible` with zero invalid records | Listing is read-only | No | Legacy fallback remains advisory; no ID is invented | Session bytes unchanged | `read-compatible-no-rewrite` |
| `v0.9.0` findings | `read-compatible` | Listing is read-only | No | Finding state is preserved | Registry bytes unchanged | `read-compatible-no-rewrite` |
| `v0.9.1` evaluation | `read-compatible` with zero invalid records | Listing is read-only | No | Caller-attested/unreviewed provenance remains unchanged | Record bytes unchanged | `read-compatible-no-rewrite` |
| Future durable records/metadata | Validators reject or report invalid; findings reads block | No normal write path repairs them | No | Fail closed; no best-effort reinterpretation | Original bytes remain unchanged | `unsupported-version-blocked` |
| Corrupt config | Explicit `CMI_CONFIG_INVALID` | `init` stops before default/config replacement | No | No trust claim | Original bytes remain unchanged | `corrupt-blocked` |
| Future portable manifest | Existing portable validation returns `CMI_PORTABLE_SCHEMA_UNSUPPORTED` | No in-place bundle migration | No | Restore cannot treat it as supported evidence | Source bundle is not rewritten | `unsupported-version-blocked` |

The matrix is backed by the nine compatibility tests in `tests/compatibility.test.js`, plus the existing portable, storage, stale-memory, generated-cache, and runtime-contract suites.

## Migration decision and implementation

No explicit migration command was implemented. The fixtures prove that the released durable range is safely readable without a destructive conversion, and adding a generic migration surface would create more provenance and backup obligations without an observed need.

Two narrow compatibility behaviors are implemented:

1. `init` and `readConfig` now reject future or malformed config before writing defaults. Existing config bytes are preserved, and unsafe storage errors remain fail-closed.
2. The session validator accepts the exact old closed-session fallback where `nextAction.id` is absent only when `nextActions` is empty. It does not generate an ID, change the record, or upgrade its trust classification.

Generated state follows `detect → explain → rebuild`: old graph schema/parser versions are classified as obsolete, future graph versions as unsupported, and neither is reported as current. `scan` rebuilds the graph and index from current source while leaving durable Markdown and provenance untouched.

There is no migration CLI or MCP mutation surface. Read-only MCP behavior therefore remains unchanged, and no write gate is weakened.

## Future versions, corruption, and security

Unsupported versions are not downgraded, replaced with defaults, silently deleted, or best-effort parsed as current state. Corrupt JSON and invalid durable records are rejected or counted as invalid according to the existing domain contract. Tests also retain coverage for traversal, symlink escape, oversized durable files, unsafe storage, destination conflicts, and portable bundle corruption.

The compatibility corpus itself is path-independent and secret-free. It does not exercise a migration backup path because no migration exists; backup-conflict and partial-migration tests are therefore not applicable. Existing atomic storage primitives remain the only durable write path.

Limitations are deliberate: compatibility is proven for the listed representative release transitions, not all historical commits; generated architecture Markdown is rebuildable output rather than a durable schema migration; portable evidence has no released predecessor; and future formats require a compatible CMI version or explicit operator recovery.

## Manual acceptance record

- Historical durable project: a disposable `v0.5.0` project was inspected with current status/search/init; the config, legacy memory, and authored instructions were not rewritten, while the graph was explicitly marked obsolete.
- Generated old state: the same disposable project was scanned; graph health became current and durable memory plus review labeling remained unchanged.
- Unsupported path: future config and future generated/durable fixtures were read through current validators; unsupported state was blocked or marked invalid and original bytes remained unchanged.
- Corruption: truncated config returned `CMI_CONFIG_INVALID`; `init` did not replace the original bytes.
- Portable evidence: current supported behavior and future manifest rejection remain covered by the Phase 1 portable-provenance tests; no internal Phase 1 schema is promoted to a public historical guarantee.

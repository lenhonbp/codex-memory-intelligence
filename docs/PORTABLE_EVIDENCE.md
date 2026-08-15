# Portable Evidence integrity and provenance

Portable Evidence separates deterministic evidence identity from manifest provenance integrity. These are integrity mechanisms, not authentication or signatures.

## Current writer: Portable Evidence v3

New bundles use portable schema version 3.

`identity.digest` remains the deterministic core evidence identity. Its material is intentionally bounded to the portable format, CMI version/source revision, project source identity and identity policy, repository/revision/worktree evidence, and the durable artifact inventory/digest. It does not include creation time or location, so freezing the same evidence state can retain the same core identity.

`integrity.digest` is a separate v3 SHA-256 digest with coverage `manifest-provenance-v1`. It binds all manifest sections that can be surfaced as provenance or used by compatibility classification:

- `schemaVersion`, `kind`, and `format`
- complete `cmi` provenance, including invocation kind and package root when observed
- complete `project` metadata, including frozen project location
- complete `evidence` metadata, including health snapshot
- `creation`
- `provenance`

Changing any of those fields without recomputing the v3 integrity digest fails closed as `CMI_PORTABLE_MANIFEST_CORRUPT` before artifact contents are accepted.

The v3 origin location is therefore integrity-bound. An otherwise exact restore can be classified `exact` only when that bound frozen location matches the resolved destination project root.

## Published schema compatibility policy

The supported bundle-version contract is published in [Portable Schema Compatibility](PORTABLE_SCHEMA_COMPATIBILITY.md) and encoded in `PORTABLE_SCHEMA_COMPATIBILITY` in `src/portable-manifest-integrity.js` so documentation and executable behavior can be regression-checked together.

The current matrix is deliberately small:

- schema v2: public since `v0.12.0`, legacy-supported for inspect/restore/rebind, no longer written;
- schema v3: public since `v0.12.1`, current writer and supported for inspect/restore/rebind;
- any other schema: unsupported and fail-closed with `CMI_PORTABLE_SCHEMA_UNSUPPORTED`.

This is a supported pre-v1 compatibility statement, not a promise that every future CMI release will support every historical portable format forever. Removal or deprecation of a supported public schema must follow the public deprecation policy rather than silently narrowing compatibility.

## Retained Portable Evidence v2 compatibility

Schema v2 was the public writer in `v0.12.0` and remains readable and restorable under its released identity algorithm. CMI does not silently expand the old v2 identity material, because doing so would reinterpret already-produced v2 digests without a schema change.

The following v2 manifest fields were outside the released core identity material and are reported as legacy-unbound:

- `cmi.invocationKind`
- `cmi.packageRoot`
- `project.location`
- `evidence.health`
- `creation`
- `provenance`

A v2 bundle can still prove its released core identity and artifact digests. However, unbound `project.location` cannot promote compatibility to `exact`. CMI may report that the legacy location text happens to equal the current path (`samePathObserved`), but `samePath` remains false for trust classification and `originBinding` is `legacy-unbound`.

A v2 manifest carrying a v3-style `integrity` block is rejected rather than interpreted as a hybrid format.

## Restore and rebind provenance

For v3 restores/rebinds, durable `portable-provenance.json` records the portable schema version and v3 manifest integrity digest in addition to the deterministic manifest identity. Existing rebind provenance must still match the complete generated durable shape before reuse.

For retained v2 bundles, v3-only original-manifest fields such as `portableSchemaVersion` and `manifestIntegrity` are not synthesized. Current verification output can expose the explicit `samePathObserved` and `originBinding` diagnostics, while a released relocated v2 `portable-provenance.json` that predates those two fields remains reusable only when its older fields still exactly match the current demoted trust state. A legacy provenance record that depended on unbound location to claim `exact` does not match and is rejected.

## Trust boundary

Neither `identity.digest` nor `integrity.digest` authenticates who created a bundle, proves source authorship, or provides a cryptographic signature. They detect changes relative to the manifest/artifact bytes presented to CMI. Portable Evidence continues to report `authenticated: false`.

Portable schema versioning is independent from the CMI package/runtime version and from the Evidence Contract version. This v3 format change does not add runtime Evidence Contract negotiation, automatic execution, release publishing, or deployment behavior.

# CMI v0.12.1 Public Release

Status: **PUBLIC** — published 2026-08-13.

Release target: `6d1336aee4475fb899992899d01cb8c6f11d201d`

GitHub Release: `v0.12.1`

npm: `codex-memory-intelligence@0.12.1`

Publish workflow: run `#13` / Actions run `31669333818` — success.

Post-merge main CI: run `#1018` / Actions run `31669319368` — success.

Post-merge main CodeQL: run `#326` / Actions run `31669319376` — success.

GitHub Release id: `369679638`.

The temporary `release/v0.12.1` branch was removed automatically by the successful publish workflow.

## Purpose

v0.12.1 is a maintenance-hardening release for CLI/MCP request boundaries and Portable Evidence trust integrity after v0.12.0.

It packages the post-v0.12.0 hardening already merged through PRs #89–#92, plus executable Evidence Contract simulation gates from PRs #83–#87 and the explicit production-surface NO-GO decision from PR #88.

## Included hardening

- CLI malformed-input handling rejects unknown short options, duplicate single-value flags, and extra positional arguments on fixed-arity commands.
- MCP known-tool requests are validated against the supported JSON-Schema subset before business logic or durable writes; malformed arguments fail with JSON-RPC `-32602`.
- Portable Evidence restore/rebind rejects cross-platform artifact-name collisions and unsafe path segments independently of the host operating system.
- Restore/rebind provenance reuse now validates the complete generated durable shape, and compatibility is rechecked immediately before staged install commit to close the relevant read/write TOCTOU window.
- New Portable Evidence writers emit manifest schema v3 with a separate `integrity.digest` using `manifest-provenance-v1` coverage for manifest provenance metadata.
- Released v2 core identity semantics remain unchanged; unbound v2 origin location cannot promote compatibility to `exact`.

## Evidence Contract boundary

The Evidence Contract compatibility/versioning work remains simulation-only. Runtime support remains v1 only.

`PRODUCTION_CONTRACT_SURFACE_NO_GO` remains the active decision while there is no named production consumer requiring discovery/negotiation. v0.12.1 therefore does not expose a production discovery endpoint, negotiation parameter, handshake token, CLI flag, MCP method, or automatic downgrade/upgrade path.

## Portable Evidence compatibility

Released schema v2 bundles remain inspectable/restorable under the released v2 core identity algorithm. New writers emit schema v3 with the additional manifest-provenance integrity layer.

The deterministic core `identity.digest` is not silently redefined for old v2 bundles. v3 adds separate provenance coverage rather than reinterpreting historical identity material.

Neither digest is authentication, a signature, backup authenticity, or proof of authorship; `authenticated` remains false.

## Publication evidence

The guarded publish workflow successfully:

1. verified the temporary release branch pointed exactly at current `main`;
2. verified package/source/changelog version identity for `0.12.1`;
3. ran repository verification;
4. ran benchmark smoke;
5. tested the packed installation;
6. created tag `v0.12.1` at the exact release target;
7. published `codex-memory-intelligence@0.12.1` through npm Trusted Publishing;
8. verified npm registry visibility;
9. created GitHub Release `v0.12.1`;
10. removed the temporary release branch.

The release subject also passed post-merge `main` CI and CodeQL on the same release-target commit.

## Claim boundary

This release establishes the bounded maintenance and release-pipeline evidence above. It does not establish productivity improvement, time savings, universal-agent effectiveness, production Evidence Contract negotiation support, authentication of Portable Evidence, or v1 readiness.

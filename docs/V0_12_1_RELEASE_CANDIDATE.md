# CMI v0.12.1 Release Candidate

Status: **PREPARED — NOT PUBLISHED**.

Prepared: 2026-08-13.

Base: `main@1fc60abd443426d777d566325267ebc1e3717d5e`.

Current supported public release remains `v0.12.0` / `codex-memory-intelligence@0.12.0` until a separately authorized publish workflow succeeds.

## Purpose

v0.12.1 packages the maintenance and trust-boundary hardening merged after v0.12.0. It does not open a new feature program.

The release candidate includes:

- CLI malformed-input hardening from PR #89;
- strict MCP tool-argument validation from PR #90;
- Portable Evidence restore/rebind trust and TOCTOU hardening from PR #91;
- Portable Evidence manifest-provenance integrity coverage and schema v3 writer behavior from PR #92;
- the Evidence Contract compatibility/versioning simulation gates from PRs #83–#87;
- the explicit production Evidence Contract surface NO-GO decision from PR #88.

## Portable Evidence compatibility

New writers emit Portable Evidence manifest schema v3. The deterministic core `identity.digest` remains the bounded core evidence identity; v3 adds a separate `integrity.digest` with `manifest-provenance-v1` coverage for manifest provenance metadata.

Released v2 bundles remain readable/restorable under the released v2 core identity algorithm. Unbound v2 origin location may be reported diagnostically but cannot promote compatibility to `exact`. The bounded released relocated-v2 rebind-provenance compatibility path remains supported where all released trust-state fields match.

Neither digest is authentication, a signature, backup authenticity, nor proof of authorship.

## Evidence Contract boundary

Evidence Contract v2 remains simulation-only. The repository now carries executable simulation gates for upgrade compatibility, unsupported-version refusal, capability advertisement, and discovery-to-negotiation TOCTOU behavior, but no production discovery/negotiation surface is added.

`PRODUCTION_CONTRACT_SURFACE_NO_GO` remains the current decision while only Evidence Contract v1 is runtime-supported and no named production consumer requires negotiation.

## Release gate

This candidate is not authorization to publish.

Before publication:

1. merge the release-preparation PR to `main` only after hosted CI and CodeQL pass on its final head;
2. confirm `package.json`, `src/version.js`, and `CHANGELOG.md` all resolve to `0.12.1`;
3. verify `npm run release:check -- v0.12.1`, repository verification, benchmark smoke, and package smoke through the guarded publish workflow;
4. only after explicit maintainer authorization, create `release/v0.12.1` from the exact current `main` head so the publish workflow can tag, publish through npm Trusted Publishing, create the GitHub Release, and remove the temporary release branch;
5. after successful publication, update `docs/RELEASE_STATUS.md` and `docs/RELEASE_POLICY.md` from v0.12.0 to the verified v0.12.1 release evidence.

## Claim boundary

This maintenance release does not establish productivity improvement, time savings, universal-agent effectiveness, production Evidence Contract negotiation support, authentication of Portable Evidence, or v1 readiness.

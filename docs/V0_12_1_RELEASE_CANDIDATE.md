# CMI v0.12.1 Release Candidate

Status: **HISTORICAL RELEASE-CANDIDATE RECORD — PUBLICATION COMPLETED**.

Prepared: 2026-08-13.

Preparation base: `main@1fc60abd443426d777d566325267ebc1e3717d5e`.

The candidate was subsequently merged and published successfully as `v0.12.1` from release target `6d1336aee4475fb899992899d01cb8c6f11d201d`.

Canonical final publication record: [CMI v0.12.1 Public Release](V0_12_1_RELEASE.md).

## Purpose

v0.12.1 packages the maintenance and trust-boundary hardening merged after v0.12.0. It does not open a new feature program.

The release candidate included:

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

Evidence Contract v2 remains simulation-only. The repository carries executable simulation gates for upgrade compatibility, unsupported-version refusal, capability advertisement, and discovery-to-negotiation TOCTOU behavior, but no production discovery/negotiation surface is added.

`PRODUCTION_CONTRACT_SURFACE_NO_GO` remains the current decision while only Evidence Contract v1 is runtime-supported and no named production consumer requires negotiation.

## Completed release gate

The candidate gate was completed successfully:

1. release-preparation PR #93 passed hosted CI and CodeQL and was squash-merged to `main`;
2. `package.json`, `src/version.js`, and `CHANGELOG.md` were aligned to `0.12.1`;
3. the guarded publish workflow passed release metadata, repository verification, benchmark smoke, and package smoke;
4. `release/v0.12.1` was created from exact current `main`, then the workflow created tag `v0.12.1`, published through npm Trusted Publishing, verified registry visibility, created the GitHub Release, and removed the temporary release branch;
5. post-publication status/policy documentation was advanced to v0.12.1.

See [CMI v0.12.1 Public Release](V0_12_1_RELEASE.md) for the exact workflow/run/release identifiers.

## Claim boundary

This maintenance release does not establish productivity improvement, time savings, universal-agent effectiveness, production Evidence Contract negotiation support, authentication of Portable Evidence, or v1 readiness.

# CMI v0.13.0 Release Candidate

Status: **HISTORICAL RELEASE-CANDIDATE RECORD — PUBLICATION COMPLETED**.

Prepared: 2026-08-13.

Preparation base: `main@ab960640716fda084104cd0549382732170e4dcc`.

Release target: `3cc7cfd29a1dc49f16c67f84af1c59ea29d42a91`.

Canonical publication record: [CMI v0.13.0 Public Release](V0_13_0_RELEASE.md).

## Purpose

v0.13.0 was prepared as the feature release after v0.12.1 for Operational Trust, real-repository/product-evidence validation, empirical-study provenance hardening, CLI large-output reliability, and the lightweight Product Value Regression operating model.

The candidate included:

- PR #95 — Product Evidence & Real-World Validation;
- PR #96 — Operational Trust and the additive read-only `cmi-trust` binary;
- PR #97 — failure-preserving real-corpus execution, exact-revision transport fallback, artifact-before-fail CI, and the CLI large-stdout flush fix;
- PR #99 — lightweight Product Value Regression guidance;
- PR #100 — v0.13.0 release metadata and public-documentation preparation.

## Completed release gate

All authorized publication gates completed successfully:

1. release-preparation PR #100 passed hosted CI, CodeQL, Operational Trust and merged to `main`;
2. release target was fixed at `3cc7cfd29a1dc49f16c67f84af1c59ea29d42a91`;
3. `release/v0.13.0` was created from that exact current-main commit;
4. publish workflow run `#14` / Actions run `31724126683` passed release target guard, `release:check`, repository verification, benchmark smoke, and packed-install smoke;
5. tag `v0.13.0` was created at the release target;
6. `codex-memory-intelligence@0.13.0` was published through npm Trusted Publishing and registry visibility was verified;
7. GitHub Release `v0.13.0` was created as release id `370079664`;
8. the temporary `release/v0.13.0` branch was removed automatically;
9. the release-target commit also passed post-merge main CI `#1113` / `31724107267`, CodeQL `#352` / `31724107260`, and Operational Trust `#10` / `31724107195`.

## Compatibility

- Node.js support remains `>=22`.
- Existing `cmi` and `cmi-mcp` entrypoints remain unchanged; `cmi-trust` is additive.
- Evidence Contract v2 remains simulation-only and is not exposed as a production negotiation/discovery surface.

## Claim boundary

Publication completion does not strengthen the empirical claims beyond the recorded evidence. v0.13.0 does not establish proven productivity, causal time savings, universal-agent compatibility, production Evidence Contract negotiation, DLP-grade sharing safety, or v1 readiness.

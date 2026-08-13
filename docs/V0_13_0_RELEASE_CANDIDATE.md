# CMI v0.13.0 Release Candidate

Status: **AUTHORIZED RELEASE CANDIDATE — PUBLICATION PENDING**.

Prepared: 2026-08-13.

Preparation base: `main@ab960640716fda084104cd0549382732170e4dcc`.

## Purpose

v0.13.0 is the next feature release after v0.12.1. It packages the post-v0.12.1 operational-trust and evidence-validation work already merged to `main`, plus the lightweight product-value regression operating model.

The candidate includes:

- PR #95 — Product Evidence & Real-World Validation, including stricter paired-study eligibility and pinned real-repository corpus infrastructure;
- PR #96 — Operational Trust gates and the additive read-only `cmi-trust` binary;
- PR #97 — failure-preserving real-corpus execution, exact-revision transport fallback, artifact-before-fail CI, and the CLI large-stdout flush fix;
- PR #99 — lightweight Product Value Regression guidance derived from the first controlled plain-vs-CMI pilot.

## Release gate

Publication is authorized only after:

1. release metadata is aligned across `package.json`, `src/version.js`, `CHANGELOG.md`, README, and security documentation;
2. the release-preparation PR passes required hosted CI and CodeQL and is merged to `main`;
3. `release/v0.13.0` is created from the exact current `main` commit;
4. the guarded publish workflow passes `release:check`, full repository verification, benchmark smoke, and package smoke;
5. the workflow creates tag `v0.13.0`, publishes `codex-memory-intelligence@0.13.0` through npm Trusted Publishing, verifies registry visibility, creates the GitHub Release, and removes the temporary release branch;
6. post-publication documentation records the exact release/workflow identifiers and advances the supported-release policy.

## Compatibility

- Node.js support remains `>=22`.
- Existing `cmi` and `cmi-mcp` entrypoints remain unchanged; `cmi-trust` is additive.
- Evidence Contract v2 remains simulation-only and is not exposed as a production negotiation/discovery surface.
- Existing durable and Portable Evidence compatibility boundaries remain unchanged from v0.12.1 unless separately documented.

## Claim boundary

This release adds validation and operational-trust capability, but it does not establish proven productivity, time savings, causal effectiveness, universal-agent compatibility, production Evidence Contract negotiation, DLP-grade sharing safety, or v1 readiness.

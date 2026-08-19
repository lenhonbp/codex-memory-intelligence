# CMI v0.14.0 Release Candidate

Status: **RELEASE CANDIDATE — PUBLICATION PENDING**.

Prepared: 2026-08-19.

Preparation base: `main@0d214fb08bae0850865c32af5e95639ff5221ffa`.

## Purpose

v0.14.0 is the next pre-v1 feature release after v0.13.0. It packages the merged proactive consumer workflow, portable activation and provenance work, published Portable Evidence compatibility policy, bounded managed-integration ownership, expanded engineering-validation corpus, and cross-platform/security hardening.

The candidate includes:

- PR #102 — expanded pinned real-repository corpus and public deprecation policy;
- PR #103 — published Portable Evidence schema compatibility policy and executable v2/v3 compatibility coverage;
- PR #104 — proactive repository-local agent workflow guidance;
- PR #105 — CMI Provenance Mark v1;
- PR #106 — portable consumer workflow and exact-local-runtime activation;
- PR #107 — bounded ownership of activation-managed consumer integration blocks;
- PR #108 — Windows MCP cleanup hardening and CodeQL file-system-race remediation.

## Release gate

Publication remains separately authorized only after:

1. release metadata is aligned across `package.json`, `src/version.js`, `CHANGELOG.md`, README, and security documentation;
2. the release-preparation PR passes the required hosted CI matrix and CodeQL on its exact head and is merged to `main`;
3. the guarded publish workflow passes `release:check -- v0.14.0`, full repository verification, benchmark smoke, and packed-install smoke;
4. an explicitly authorized release action creates tag `v0.14.0`, publishes `codex-memory-intelligence@0.14.0`, verifies registry visibility, creates the GitHub Release, and records post-publication release identifiers.

This candidate preparation does not tag, publish npm, create a GitHub Release, or declare v1 readiness.

## Compatibility and integration boundaries

- Node.js support remains `>=22`.
- Existing `cmi`, `cmi-mcp`, and `cmi-trust` entrypoints remain supported.
- Consumer activation uses an exact local CMI package runtime when valid local package evidence exists; activation-managed blocks remain bounded and are not globally immutable.
- Evidence Contract v2 remains simulation-only and is not exposed as a production negotiation/discovery surface.
- Portable Evidence schema v2 remains supported for inspect/restore/rebind, schema v3 remains the current writer, and unsupported schemas fail closed.

## Claim boundary

This release supports proactive repository-local workflow guidance, portable consumer activation behavior, bounded managed integration ownership, durable-session-backed Provenance Mark behavior, and the documented security/cross-platform hardening. It does not establish v1 readiness, demonstrated productivity improvement, universal agent effectiveness, authorship/authentication/signing from the Provenance Mark, Portable Evidence authenticity, application correctness in real-corpus repositories, production Evidence Contract v2 support, or complete security certification.

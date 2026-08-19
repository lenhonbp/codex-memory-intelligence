# CMI v0.14.0 Release Candidate

Status: **HISTORICAL CANDIDATE — PUBLICATION COMPLETE**.

Prepared: 2026-08-19.

Preparation base: `main@0d214fb08bae0850865c32af5e95639ff5221ffa`.

Final release target: `96f3e0f903fa4c9c3d967383ec695c63243b588b`.

Canonical public-release record: [CMI v0.14.0 Public Release](V0_14_0_RELEASE.md).

## Purpose

This file preserves the pre-publication release-candidate checkpoint for v0.14.0. Its original role was to gate publication after v0.13.0; publication has now completed, so current release state is recorded in `V0_14_0_RELEASE.md` and `RELEASE_STATUS.md`.

The candidate packaged the merged proactive consumer workflow, portable activation and provenance work, published Portable Evidence compatibility policy, bounded managed-integration ownership, expanded engineering-validation corpus, and cross-platform/security hardening.

The candidate included:

- PR #102 — expanded pinned real-repository corpus and public deprecation policy;
- PR #103 — published Portable Evidence schema compatibility policy and executable v2/v3 compatibility coverage;
- PR #104 — proactive repository-local agent workflow guidance;
- PR #105 — CMI Provenance Mark v1;
- PR #106 — portable consumer workflow and exact-local-runtime activation;
- PR #107 — bounded ownership of activation-managed consumer integration blocks;
- PR #108 — Windows MCP cleanup hardening and CodeQL file-system-race remediation;
- PR #109 — v0.14.0 release metadata and candidate preparation.

## Historical release gate

Publication was authorized only after:

1. release metadata was aligned across `package.json`, `src/version.js`, `CHANGELOG.md`, README, and security documentation;
2. the release-preparation PR passed hosted CI, CodeQL, and Operational Trust on its reviewed head and was merged to `main`;
3. the guarded publication path required `release/v0.14.0` to point exactly at current `main` and re-ran release metadata, repository, benchmark, and packed-install checks before publication;
4. the publication flow created `v0.14.0`, published `codex-memory-intelligence@0.14.0`, verified registry visibility, created the GitHub Release, and removed the temporary release branch.

This historical candidate record does not replace the final publication record and must not be read as evidence of v1 readiness.

## Compatibility and integration boundaries

- Node.js support remains `>=22`.
- Existing `cmi`, `cmi-mcp`, and `cmi-trust` entrypoints remain supported.
- Consumer activation uses an exact local CMI package runtime when valid local package evidence exists; activation-managed blocks remain bounded and are not globally immutable.
- Evidence Contract v2 remains simulation-only and is not exposed as a production negotiation/discovery surface.
- Portable Evidence schema v2 remains supported for inspect/restore/rebind, schema v3 remains the current writer, and unsupported schemas fail closed.

## Claim boundary

v0.14.0 supports proactive repository-local workflow guidance, portable consumer activation behavior, bounded managed integration ownership, durable-session-backed Provenance Mark behavior, and the documented security/cross-platform hardening. It does not establish v1 readiness, demonstrated productivity improvement, universal agent effectiveness, authorship/authentication/signing from the Provenance Mark, Portable Evidence authenticity, application correctness in real-corpus repositories, production Evidence Contract v2 support, or complete security certification.

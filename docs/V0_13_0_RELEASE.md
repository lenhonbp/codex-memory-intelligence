# CMI v0.13.0 Public Release

Status: **PUBLIC** — published 2026-08-13.

Release target: `3cc7cfd29a1dc49f16c67f84af1c59ea29d42a91`

GitHub Release: `v0.13.0`

npm: `codex-memory-intelligence@0.13.0`

Publish workflow: run `#14` / Actions run `31724126683` — success.

Post-merge main CI: run `#1113` / Actions run `31724107267` — success.

Post-merge main CodeQL: run `#352` / Actions run `31724107260` — success.

Post-merge Operational Trust: run `#10` / Actions run `31724107195` — success.

GitHub Release id: `370079664`.

The temporary `release/v0.13.0` branch was removed automatically by the successful publish workflow.

## Purpose

v0.13.0 is a feature release for operational sharing trust and stronger real-repository/product-evidence validation after v0.12.1.

It packages the post-v0.12.1 work merged through PRs #95, #96, #97 and #99, plus the release-preparation metadata from PR #100.

## Added capability

- **Operational Trust** ships as the additive read-only `cmi-trust` binary.
- `cmi-trust doctor` checks generated/transient `.codex-memory` Git-sharing policy plus bounded credential-like-content signals before sharing project state.
- `cmi-trust export` performs bounded fail-closed checks on one stable UTF-8 regular file before export/sharing.
- Real-repository validation now uses pinned repository revisions, failure-preserving artifacts, exact-revision transport fallback, and a dedicated CI workflow.
- The empirical-study harness records reviewer kind, reviewer assurance/blinding, externally observed timing where available, and keeps `productValueEligible` gated on blinded externally-verified human review.
- Routine feature work now has a lightweight Product Value Regression workflow separate from claim-grade empirical studies.

## Reliability and evidence hardening

- CLI large-output completion now flushes bounded successful stdout before exit so external consumers do not receive silently truncated output.
- Real-corpus orchestration preserves failed/partial results rather than dropping failed repositories from the aggregate.
- Product evidence explicitly separates engineering correctness, protocol eligibility, product-value-review eligibility, observed paired effects, and limitations.

## Publication evidence

The guarded publish workflow successfully:

1. verified `release/v0.13.0` pointed exactly at current `main`;
2. verified package/source/changelog identity for `0.13.0`;
3. ran full repository verification;
4. ran benchmark smoke;
5. tested the packed installation;
6. created tag `v0.13.0` at the exact release target;
7. published `codex-memory-intelligence@0.13.0` through npm Trusted Publishing;
8. verified npm registry visibility;
9. prepared release notes from the v0.13.0 changelog section;
10. created GitHub Release `v0.13.0`;
11. removed the temporary release branch.

The exact release-target commit also passed post-merge `main` CI, CodeQL, and Operational Trust workflows.

## Compatibility

- Node.js support remains `>=22`.
- Existing `cmi` and `cmi-mcp` entrypoints remain supported; `cmi-trust` is additive.
- Evidence Contract v2 remains simulation-only; no production discovery/negotiation surface is exposed.
- Existing durable-memory, session/change, and Portable Evidence compatibility boundaries remain as documented unless explicitly changed by this release.

## Product-value evidence boundary

The first controlled plain-vs-CMI pilot remains descriptive-only. Across the three agent-reviewed pairs, CMI did not establish answer-quality superiority. A favorable wall-clock observation appeared in the continuation/handoff pair, but it is not a causal productivity result.

No pilot pair is `productValueEligible` without blinded externally-verified human review. Agent-blinded review remains QA evidence only.

## Operational Trust boundary

`cmi-trust` is a conservative pre-share gate. It is not DLP, malware scanning, authentication, a signature system, or proof that a file/project is safe for public disclosure.

## Claim boundary

This release establishes the bounded capability, engineering validation, and publication evidence above. It does not establish proven productivity, causal time savings, universal-agent effectiveness, production Evidence Contract negotiation, DLP-grade sharing safety, or v1 readiness.

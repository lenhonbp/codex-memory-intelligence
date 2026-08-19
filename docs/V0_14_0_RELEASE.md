# CMI v0.14.0 Public Release

Status: **PUBLIC** — published 2026-08-19.

Release target: `96f3e0f903fa4c9c3d967383ec695c63243b588b`

GitHub Release: `v0.14.0`

npm: `codex-memory-intelligence@0.14.0`

The temporary `release/v0.14.0` branch was removed after the guarded publication workflow completed.

> Evidence note: this post-release sync records only publication identifiers directly observed through the connected repository surfaces. It does not invent an Actions run id or GitHub Release numeric id when those identifiers are not exposed by the current connector session.

## Purpose

v0.14.0 is the next pre-v1 feature release after v0.13.0. It packages the post-v0.13.0 portability, proactive workflow, provenance, managed-integration ownership, real-corpus, compatibility, and cross-platform/security hardening work merged through PRs #102–#109.

## Added capability

- Expanded the pinned real-repository engineering corpus from 3 to 7 repositories across JavaScript/TypeScript, Python, Go, Rust, and PHP source trees.
- Published the deprecation policy for CLI, MCP, durable-state, and shipped Skill contracts.
- Published Portable Evidence schema compatibility policy for released v2 and current v3 bundles, with unsupported future schemas failing closed.
- Added a proactive repository-local agent workflow contract covering constraint-first discovery, an ephemeral `.agent/todo.md` checklist, autonomous authorized execution, failure recovery, proportional verification, and evidence-separated reporting.
- Added CMI Provenance Mark v1. Evidence-backed form requires actual durable Session evidence; degraded form is used when durable evidence is not recorded.

## Consumer portability and ownership

- Consumer activation carries the proactive agent workflow into activated repositories.
- Activation binds MCP integration to an exact local CMI package entrypoint when valid local package evidence exists; malformed or unsafe local candidates fail closed rather than silently claiming exact-local execution.
- The managed `.agent/todo.md` ignore rule is kept effective and terminal so the ephemeral checklist does not become durable project history accidentally.
- CMI-managed blocks in `AGENTS.md`, `.codex/config.toml`, and `.gitignore` now have explicit bounded ownership. Unrelated consumer tasks must preserve those sections; the files themselves are not globally immutable.

## Reliability and security hardening

- The MCP fail-closed portability test now waits for the child process to close before fixture cleanup and uses bounded Windows-only retries for legitimate transient filesystem-lock codes.
- Package-bin validation opens each target once, checks file type through the same descriptor, and reads the shebang through that descriptor, removing the reported check-then-use file-system race without suppressing the finding.
- Post-remediation main CI passed on Ubuntu, macOS, and Windows for Node 22 and 24, and the formerly open high-severity CodeQL `js/file-system-race` alert was fixed on the default branch before this release was prepared.

## Publication boundary

The guarded release flow requires the temporary release branch to point exactly at current `main`, then verifies release metadata, the repository, benchmark smoke, and packed installation before creating the tag, publishing npm, verifying registry visibility, creating the GitHub Release, and removing the temporary branch.

The public `v0.14.0` tag carries package version `0.14.0`, and the repository now points new installations at `v0.14.0` / `codex-memory-intelligence@0.14.0`.

## Compatibility

- Node.js support remains `>=22`.
- Existing `cmi`, `cmi-mcp`, and `cmi-trust` entrypoints remain supported.
- Portable Evidence schema v2 remains supported for inspect/restore/rebind; schema v3 remains the current writer.
- Evidence Contract v2 remains simulation-only and is not exposed as a production negotiation/discovery surface.
- All eight planned Agent Skill artifacts remain shipped as open-format package content; npm installation does not by itself activate or install them into an agent runtime.

## Evidence and claim boundary

- Real-corpus validation is engineering portability evidence on pinned source trees. It is not proof of target-application correctness, language-complete parsing, or universal agent compatibility.
- Product-value evidence remains insufficient for a causal productivity or answer-quality superiority claim; `productValueEligible` controlled pairs remain absent under the current strict evidence contract.
- The Provenance Mark records CMI workflow participation/evidence provenance. It is not source authorship, authentication, signing, certification, approval, or verification by CMI.
- Portable Evidence digests establish integrity checking, not creator authentication, source authorship, or backup authenticity.
- CodeQL is supporting security evidence, not complete security certification.
- v0.14.0 does **not** establish v1 readiness. The published v1 roadmap criteria remain separate and unresolved where still unchecked.

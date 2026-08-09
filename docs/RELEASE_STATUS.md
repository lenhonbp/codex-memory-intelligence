# Current Release Status

Updated: 2026-08-09 (Asia/Ho_Chi_Minh)

## Current public release

- Release: `v0.10.0`
- npm package: `codex-memory-intelligence@0.10.0`
- npm dist-tag used by the authorized workflow: `latest`
- Release commit/tag target: `7218634b5ee54165dcedefe57fea5f6cb2a080fd`
- GitHub Release: [CMI v0.10.0](https://github.com/lenhonbp/codex-memory-intelligence/releases/tag/v0.10.0)
- Publish workflow: run `#8` / Actions run `31316259226` — completed successfully
- Post-merge CI on the release commit: CI `#612` — success
- Post-merge CodeQL on the release commit: CodeQL `#182` — success
- Independent packed-package black-box acceptance: Issue #36 — `BLACK_BOX_ACCEPTED`

The authorized release workflow verified release metadata, the full repository test suite, benchmark smoke, packed installation, npm publication, npm registry visibility, GitHub Release creation, and temporary release-branch cleanup. npm publication used Trusted Publishing and emitted a signed provenance statement.

## Release scope

`v0.10.0` adds the reviewed post-`v0.9.2` work for:

- bounded portable project evidence (`freeze`, `inspect`, `restore`, `rebind`) with integrity and compatibility checks;
- executable provenance and install-ambiguity diagnostics;
- actionable evidence-health and recovery behavior;
- audited historical persistence compatibility and future/corrupt-format fail-closed protection;
- symlink-safe scanner/`explain-ignore` parity;
- expanded regression, package-install, MCP authorization, cross-platform, and black-box validation coverage;
- maintainer/evaluator empirical-study ledger and harness support with claims explicitly bounded to descriptive evidence.

## Evidence limits

This release does **not** claim compiler-grade static analysis, authenticated portable backups, source-authorship proof, productivity improvement, time savings, general product-value proof, or v1.0 readiness. Static impact/boundary output remains advisory and heuristic where documented. Empirical and evaluation records retain their recorded provenance and limitations.

## Historical wording note

The `v0.10.0` tagged source snapshot was prepared and independently accepted before the publication trigger. As a result, some text inside the immutable tagged README/changelog and the automatically generated release notes still uses pre-publication wording such as “release candidate” or “publication remains separately authorized.” That wording describes the release-preparation state captured by the tag; it does not describe the current public state. This document is the repository-level current-status record after successful publication.

## Next release work

Future work belongs under `[Unreleased]` and a new reviewed change/release cycle. A future v1.0 decision remains separate and requires its own evidence and authorization.

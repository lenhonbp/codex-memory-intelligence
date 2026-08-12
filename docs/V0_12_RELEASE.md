# CMI v0.12.0 Release Candidate

Status: release candidate prepared 2026-08-12. Publication is separately gated by the repository's reviewed release workflow.

## Purpose

v0.12.0 packages the first Evidence-Anchored Rule Intelligence capability introduced on `main` by PR #68.

CMI can now attach actionable source provenance to findings and reviewed-rule checks using project-relative file/line ranges plus symbol, feature, and commit context where available. Closing Intelligence can expose those anchors together with an explicit verification state.

## Verification semantics

The evidence lifecycle is deliberately conservative:

- `suspected` — a reviewed rule or heuristic is relevant, but no direct source/runtime observation establishes the condition;
- `observed` — source or other direct evidence establishes the cited condition, but product/design/policy violation may still require contextual verification;
- `established` — verification appropriate to the rule establishes the violation or condition;
- `resolved` — the durable finding lifecycle records that the established/suspected issue is no longer open.

A source match never becomes product truth merely because a file/line was found.

## Evidence anchors

Portable evidence can include:

- `source:path/to/file.ts:120-145`
- `symbol:CombatDiagnostics`
- `feature:player-surface`
- `commit:<sha>`

Line ranges are useful but not stable identity by themselves, so symbol/feature/commit context should accompany them when available.

## Scope boundary

This release does not add a universal autonomous rule scanner. It does not hard-code Project 001 or UI-specific rules. Agents still need to inspect relevant source and provide verification appropriate to the rule. Static analysis remains heuristic/advisory rather than compiler-grade.

No productivity, time-savings, universal-agent, or v1-readiness claim is made by this release.

## Release gate

Before publication, the exact release-prep commit must pass the repository's hosted CI/CodeQL and release validation. Publication must then use the guarded `release/v0.12.0` workflow path so tag creation, npm Trusted Publishing, registry verification, GitHub Release creation, and temporary release-branch cleanup remain automated and auditable.

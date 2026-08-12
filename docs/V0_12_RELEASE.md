# CMI v0.12.0 Public Release

Status: **PUBLIC** — published 2026-08-12.

Release target: `623d6599aa4d175c4b054b6216c18bf3adc5a3aa`

GitHub Release: `v0.12.0`

npm: `codex-memory-intelligence@0.12.0`

Publish workflow: run `#12` / Actions run `31557297420` — success.

Post-merge main CI: run `#827` / Actions run `31557178081` — success.

Post-merge main CodeQL: run `#263` / Actions run `31557178087` — success.

GitHub Release id: `368961661`.

The temporary `release/v0.12.0` branch was removed automatically by the successful publish workflow.

## Purpose

v0.12.0 packages the first Evidence-Anchored Rule Intelligence capability introduced by PR #68.

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

## Publication evidence

The guarded release workflow successfully:

1. verified the release branch pointed exactly at current `main`;
2. verified package/source/changelog version identity;
3. ran repository verification;
4. ran benchmark smoke;
5. tested the packed installation;
6. created tag `v0.12.0` at the exact release target;
7. published `codex-memory-intelligence@0.12.0` through npm Trusted Publishing;
8. verified npm registry visibility;
9. created the GitHub Release;
10. removed the temporary release branch.

Publication evidence proves the release pipeline completed for this exact subject. It does not expand the product/effectiveness claims beyond the bounded evidence documented above.

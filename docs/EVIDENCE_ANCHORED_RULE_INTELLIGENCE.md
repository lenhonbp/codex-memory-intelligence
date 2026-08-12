# Evidence-Anchored Rule Intelligence

CMI should be able to explain not only **what** it is warning about, but also **why**, **where the evidence lives**, and **how certain the conclusion is**.

This capability extends existing evidence-driven findings and reviewed-consistency behavior without turning static matches into product truth.

## Core principle

A relevant reviewed rule is not automatically a violation.

CMI keeps these concepts separate:

1. **suspected** — a reviewed rule appears relevant or a heuristic/source signal suggests a possible problem;
2. **observed** — source/runtime evidence directly shows the condition being inspected, but policy/business correctness may still require verification;
3. **established** — verification appropriate to the rule confirms the violation, for example a failing test, browser/runtime observation, or explicit human review;
4. **resolved** — the durable finding lifecycle records that the established or suspected issue is no longer active.

The first three values are verification states. `resolved` remains the durable finding lifecycle state so existing finding-state compatibility is preserved.

## Evidence anchors

When evidence can be localized, prefer a stable anchor with multiple coordinates:

- Git commit SHA;
- project-relative file path;
- smallest useful line range;
- symbol/component/function;
- feature or capability name.

Example:

```text
commit: abe36131277afb13ccdb117efafc0bfb513dabcc
source: src/app/CombatHud.tsx:142-167
symbol: CombatDiagnostics
feature: player-surface
```

CMI can render this as:

```text
Source: src/app/CombatHud.tsx:142-167 · symbol CombatDiagnostics · feature player-surface · commit abe3613
```

Line numbers are useful but not treated as permanent identity. Symbol, feature, and commit context make the anchor more resilient when later edits move the code.

## Portable evidence syntax

Existing string evidence remains supported. Agents and integrations may add these bounded forms:

```text
source:path/to/file.ts:10-24
symbol:ComponentOrFunction
feature:feature-name
commit:<git-sha>
verification:<verification-name>
```

`src/evidence-anchors.js` normalizes and extracts these into structured anchors for Closing Intelligence.

## Ambient behavior

For mutation, review, and investigation requests, Ambient Intelligence now asks the coding agent to:

- inspect affected source when reviewed project knowledge appears relevant;
- record project-relative file/line evidence when available;
- add symbol/feature/commit context when known;
- keep a source match at `suspected` or `observed` unless verification establishes the violation.

This is intentionally advisory. CMI does not authorize edits or claim correctness from a static source match.

## Closing behavior

Closing Intelligence now carries:

- `evidenceAnchors`;
- `verificationState`;
- existing `evidenceType` and `confidence`;
- `violationEstablished`, which is true only when the verification state is established.

When anchors exist, the human-readable closing view prints up to three concise source citations.

Reviewed consistency reminders remain non-blocking by default and start as `suspected`.

## Example: player/debug UI separation

A reviewed project rule could say:

```text
Player-facing surfaces must not expose internal state identifiers or developer diagnostics by default.
```

If a task touches the combat HUD, CMI may surface the reviewed rule as relevant and request targeted source verification.

If source inspection finds:

```text
src/app/CombatHud.tsx:142-167
symbol: CombatDiagnostics
feature: player-surface
```

that is source evidence and can justify `observed` status.

Only after browser/runtime/test evidence proves that the diagnostics are visible to players should the rule violation become `established`.

## What this does not do

This capability does not:

- hard-code UI rules for a particular project;
- treat regex matches as P1/P0 defects;
- automatically promote unreviewed knowledge to durable truth;
- replace runtime/browser/product verification;
- make stale graph evidence trustworthy;
- turn every source citation into a blocker.

## Compatibility

The findings registry remains schema version 1. `verificationState` and `evidenceAnchors` are optional additive fields, and item-level additional properties remain allowed for compatibility with existing durable records.

# Evidence Contract Versioning

CMI exposes evidence-bearing read models through Session, Handoff, Closing Intelligence, CLI human output, MCP structured content, and MCP resources. These surfaces must tell one consistent evidence story even as the CMI runtime evolves.

The current compatibility reference is **Evidence Contract v1** (`tests/fixtures/evidence-contract/v1.json`). The evidence contract version is intentionally independent from the CMI package/runtime version. A CMI release does not automatically imply an evidence-contract bump.

## What v1 protects

For Findings, v1 protects durable identity and evidence provenance: Finding ID/key/state/category/severity/title/detail, confidence, evidence type, evidence list, related files, and session relevance.

For recommendations, v1 protects recommendation identity, priority, action/reason, evidence type, evidence, confidence, and linked Finding IDs.

For Closing Intelligence alerts, v1 protects the Finding relationship, alert classification, severity/title/detail, evidence type/confidence, raw evidence, evidence anchors, verification state, linked Finding/Change IDs, related files, occurrences, Finding state, scope relation, recommended action, and `violationEstablished`.

Human evidence-address rendering keeps the labels `Record:`, `Files:`, `Source:`, `Evidence:`, and `Action:` stable when the underlying evidence exists. The renderer must not invent Change IDs, files, or source anchors when the underlying Finding does not contain them.

## Compatibility rules

Changes that are purely additive may remain on v1 when existing consumers can safely ignore the new data and all v1 semantics remain unchanged.

A new evidence-contract version is required when a change removes or renames a protected field, changes its type, changes the meaning of evidence/provenance/verification state, weakens the distinction between relevance and established truth, or changes a stable human evidence label in a way that breaks v1 consumers.

A future contract bump must retain regression coverage for the prior version. Do not delete the v1 fixture merely because the runtime has advanced.

## Legacy durable records

Historical durable records that predate this contract reference remain governed by their existing compatibility exceptions. They must remain readable where the released compatibility policy says they are readable, and they must not be rewritten merely to add contract metadata.

The v0.8 released id-less fallback recommendation remains an explicit narrow compatibility exception; current recommendations still require IDs.

## Truth boundary

Evidence addresses explain where a signal came from. They do not turn source relevance, file overlap, historical correlation, or a static match into an established violation.

The `suspected → observed → established` verification distinction remains part of the evidence semantics. `violationEstablished` must only be true when the verification semantics support establishment.

Recommendations remain advisory. Contract compatibility must never be used as a reason to auto-execute project commands or auto-promote a candidate into durable truth.

## Regression gate

`tests/evidence-contract-versioning.test.js` validates the versioned v1 contract and legacy compatibility rules. `tests/cross-surface-evidence-consistency.test.js` supplies the six-archetype cross-surface corpus:

- `prediction-gap`
- `verification-failed`
- `graph-drift`
- `uncaptured-session-change`
- `active-change`
- `session-blocker`

Together, these tests are the compatibility gate. A future runtime change that silently removes or changes protected evidence semantics should fail CI before release.

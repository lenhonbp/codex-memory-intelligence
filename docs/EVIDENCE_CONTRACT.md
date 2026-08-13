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

## Dual-version upgrade simulation

`tests/fixtures/evidence-contract/v2-simulation.json` is an explicitly **test-only** upgrade fixture. It does not declare Evidence Contract v2 released, supported, negotiated, or available from the runtime.

The simulation proves two different compatibility situations without changing production behavior:

- **Additive dual-read:** a synthetic v2-only field can be required by a simulated v2 consumer while a v1 consumer continues to project only the protected v1 fields and replays the existing v1 golden corpus unchanged.
- **Intentional breaking upgrade:** a synthetic change to protected evidence meaning must fail when replayed as v1. It may exist only inside the explicit simulated next-version expectation, and the upgrade plan must still retain both `v1.json` and `golden-exchange-v1.json` regression coverage.

The synthetic `v2CompatibilityProbe` field and the simulated replacement verification value have no product semantics. They exist only to test versioning mechanics. A future real Evidence Contract v2 must define its own reviewed semantics instead of copying these probes.

The gate also fails closed when an upgrade simulation tries to advertise a breaking change as contract version 1, makes prior-version replay optional, or replaces the retained v1 fixture/corpus references with v2-only artifacts.

## Contract negotiation refusal simulation

`tests/fixtures/evidence-contract/negotiation-simulation.json` is also **test-only**. It does not add a runtime handshake, CLI flag, MCP negotiation parameter, schema field, or automatic downgrade behavior.

The simulation models the refusal policy that must hold before any real negotiation surface is introduced:

- contract selection is exact-version only;
- the current simulated runtime advertises only released Evidence Contract v1;
- the existence of `v2-simulation.json` does not make v2 runtime-supported;
- a positive but unsupported version returns an explicit unsupported-version refusal naming both the requested and supported versions;
- malformed/non-positive/non-integer version values use a distinct invalid-version refusal;
- unsupported requests do not silently downgrade, silently upgrade, normalize semantics across versions, or fall back to the current contract;
- when a future simulation adds another supported version, each version must map to its own explicit contract artifact and retained v1 replay remains available;
- a supported version may not masquerade by pointing at another version's contract artifact.

The refusal codes and message shape in this fixture are simulation contracts only. They are not a claim that production CMI currently exposes an evidence-contract negotiation API. A future production negotiation surface must be reviewed separately and must preserve these fail-closed properties if it adopts equivalent semantics.

## Legacy durable records

Historical durable records that predate this contract reference remain governed by their existing compatibility exceptions. They must remain readable where the released compatibility policy says they are readable, and they must not be rewritten merely to add contract metadata.

The v0.8 released id-less fallback recommendation remains an explicit narrow compatibility exception; current recommendations still require IDs.

## Truth boundary

Evidence addresses explain where a signal came from. They do not turn source relevance, file overlap, historical correlation, or a static match into an established violation.

The `suspected → observed → established` verification distinction remains part of the evidence semantics. `violationEstablished` must only be true when the verification semantics support establishment.

Recommendations remain advisory. Contract compatibility must never be used as a reason to auto-execute project commands or auto-promote a candidate into durable truth.

## Golden exchange corpus

`tests/fixtures/evidence-contract/golden-exchange-v1.json` is the v1 consumer compatibility fixture. It is intentionally narrower than a full Session snapshot: the corpus records the protected exchange that a real consumer receives from CLI human output, MCP tool text/structured content, and the MCP Handoff resource.

The producer scenarios are deterministic, but Session/Change/Finding identities are generated at runtime. The golden gate may replace only those generated IDs that actually exist in an archetype with named tokens and normalize CRLF to LF. It must not normalize away evidence provenance, confidence, verification state, scope relation, file addresses, action text, or `violationEstablished`.

Timestamps, temporary fixture paths, and other non-contract runtime metadata are excluded from the golden projection instead of being rewritten into fake stable values. This keeps the fixture strict about evidence semantics without making unrelated runtime metadata part of Evidence Contract v1.

Golden corpus version 2 freezes three high-signal archetypes:

- `prediction-gap` — observed expected-vs-actual scope drift with concrete file/source addresses and `violationEstablished: false`.
- `verification-failed` — failed verification evidence that must remain `established` and therefore preserves `violationEstablished: true`.
- `graph-drift` — stale graph/source evidence with a concrete source address that remains `observed`, not an established product/design violation.

Each archetype is replayed through:

- CLI `session handoff`
- CLI `session show`
- CLI `session closing`
- MCP `get_session_handoff`
- MCP `get_work_session_report`
- MCP `get_closing_intelligence`
- MCP resource `cmi://project/session-handoff/latest`

The expansion is intentionally bounded instead of cloning every semantic test into a golden snapshot. The six-archetype cross-surface corpus remains responsible for broad semantic consistency; the golden corpus adds exact consumer-shape compatibility where verification truth and evidence freshness are especially costly to weaken silently.

A consumer-visible change that cannot replay the existing v1 golden exchanges is a compatibility change. If the change is intentionally breaking, introduce a new evidence-contract/corpus version and retain prior replay coverage for existing consumers.

## Regression gate

`tests/evidence-contract-versioning.test.js` validates the versioned v1 contract and legacy compatibility rules. `tests/cross-surface-evidence-consistency.test.js` supplies the six-archetype cross-surface corpus:

- `prediction-gap`
- `verification-failed`
- `graph-drift`
- `uncaptured-session-change`
- `active-change`
- `session-blocker`

`tests/golden-exchange-corpus.test.js` adds real-consumer replay against the checked-in v1 golden exchange fixture. The test obtains its read data from the public CLI/MCP/resource surfaces, projects only fields protected by `v1.json`, and compares them against the consumer-owned golden artifacts for the three bounded archetypes.

`tests/golden-exchange-negative-compatibility.test.js` is the consumer-break simulation gate. It mutates protected golden exchange values only in test memory and requires each simulated break to be rejected at a concrete contract path, including verification state, `violationEstablished`, Change/Finding linkage, confidence, scope relation, evidence/file addresses, action text, and stable human evidence labels. A separate additive-field control must remain compatible so the negative gate does not accidentally turn the v1 `additive-only` policy into whole-object exactness.

`tests/evidence-contract-upgrade-simulation.test.js` is the dual-version upgrade gate. It requires the v1 contract and golden corpus to remain the released compatibility reference, proves that a synthetic v2 additive superset remains consumable through the retained v1 projection, requires the simulated v2 projection to enforce its own added field, rejects a protected semantic break under v1, and refuses any upgrade plan that drops prior-version regression coverage. The associated `v2-simulation.json` fixture is deliberately non-runtime and must stay labeled simulation-only.

`tests/evidence-contract-negotiation-simulation.test.js` is the unsupported-version refusal gate. It validates the simulation-only negotiation policy, accepts only exact supported versions, distinguishes invalid from unsupported requests, rejects silent downgrade/upgrade/fallback/normalization policy changes, proves that the test-only v2 fixture remains unsupported by the current runtime simulation, and exercises a future exact v1+v2 mapping while still refusing v3. It also rejects cross-version artifact masquerading.

Together, these tests are the compatibility gate. A future runtime change that silently removes or changes protected evidence semantics should fail CI before release.

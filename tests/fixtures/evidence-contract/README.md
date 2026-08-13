# Evidence Contract Fixtures

`v1.json` defines the protected Evidence Contract v1 fields and semantic invariants.

`golden-exchange-v1.json` is the consumer-owned replay fixture for the current v1 exchange. Its producer scenario is deterministic, but generated Session, Change, and Finding identities are replaced with named tokens before comparison. CRLF may be normalized to LF. Evidence provenance, verification state, file addresses, actions, scope relation, and violation-establishment semantics are not normalized.

The golden fixture is intentionally a projection of public consumer data rather than a full durable Session snapshot. Runtime-only timestamps and temporary paths stay outside the fixture instead of being rewritten into artificial stable values.

# Evidence Contract Fixtures

`v1.json` defines the protected Evidence Contract v1 fields and semantic invariants.

`golden-exchange-v1.json` is the consumer-owned replay fixture for the current v1 exchange. Corpus version 2 covers three high-signal archetypes: `prediction-gap`, `verification-failed`, and `graph-drift`. Their producer scenarios are deterministic, but generated Session, Change (when present), and Finding identities are replaced with named tokens before comparison. CRLF may be normalized to LF. Evidence provenance, verification state, file addresses, actions, scope relation, and violation-establishment semantics are not normalized.

The golden fixture is intentionally a projection of public consumer data rather than a full durable Session snapshot. Runtime-only timestamps and temporary paths stay outside the fixture instead of being rewritten into artificial stable values.

The expansion is deliberately bounded. The six-archetype cross-surface regression corpus remains the broader semantic consistency gate; the golden corpus freezes exact real-consumer exchange shapes only for the archetypes with the highest immediate compatibility risk.

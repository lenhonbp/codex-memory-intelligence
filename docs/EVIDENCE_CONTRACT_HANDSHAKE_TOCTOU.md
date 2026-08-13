# Evidence Contract Discovery-to-Negotiation Handshake / TOCTOU Simulation

This gate is **simulation-only**. It does not add a production discovery endpoint, negotiation parameter, handshake token, CLI flag, MCP method, schema field, or runtime contract-version API.

Its purpose is to prove the consistency rules that must hold if CMI ever introduces a real Evidence Contract handshake.

## Simulated lifecycle

The simulated consumer lifecycle is intentionally explicit:

1. `discover`
2. `choose-exact-version`
3. `negotiate`
4. `consume-replay`

Discovery is derived from the existing capability-advertisement simulation, which in turn remains subordinate to `negotiation-simulation.json` as the single source of truth.

At discovery time the harness binds two deterministic fingerprints:

- the capability snapshot fingerprint;
- the negotiation-authority fingerprint.

These fingerprints are test-harness bindings only. They are not production protocol fields.

## TOCTOU policy

The harness must revalidate both bindings before negotiation and again before consume/replay.

A change in any protected authority or discovery input between those steps must fail closed before a contract artifact is consumed. Protected inputs include current version, supported-version set, selection policy, unsupported-version policy, artifact mappings, and capability visibility/consistency metadata.

The gate therefore rejects:

- a capability snapshot becoming stale after discovery;
- negotiation authority changing after discovery;
- either capability or authority changing after negotiation but before consume/replay;
- a consumer choosing a version that discovery did not advertise;
- silent downgrade or silent upgrade;
- changing the selected version inside a negotiation receipt;
- substituting a different contract fixture;
- substituting or removing the selected golden fixture;
- carrying an old v1 discovery binding across a later v1+v2 authority transition.

A state transition may be valid in itself and still be stale relative to an earlier discovery binding. In that case the consumer must rediscover and negotiate from the new snapshot instead of reusing the old binding.

## Fresh future-version simulation

The test may construct a fresh synthetic authority that supports `[1, 2]` and a matching fresh capability advertisement. A new discovery against those matching snapshots may select simulated v2 exactly.

This does **not** mean Evidence Contract v2 is released or runtime-supported today. `v2-simulation.json` remains a test-only compatibility probe. The future `[1, 2]` lifecycle exists only to demonstrate that a version transition requires fresh discovery and exact mapping rather than an implicit upgrade from an old v1 binding.

## Consumer replay boundary

For current v1, the successful path resolves exactly:

- `v1.json`
- `golden-exchange-v1.json`

and verifies that the consumed artifact versions match the negotiated version.

The handshake gate does not replace the real-consumer golden replay tests. Those tests remain responsible for the actual CLI/MCP/resource exchange shape; this gate protects the temporal binding between discovery, selection, negotiation, and consumption.

## Failure semantics

Simulation refusal codes are intentionally test-only:

- `CMI_EVIDENCE_CONTRACT_HANDSHAKE_STALE`
- `CMI_EVIDENCE_CONTRACT_HANDSHAKE_SELECTION_MISMATCH`
- `CMI_EVIDENCE_CONTRACT_HANDSHAKE_ARTIFACT_MISMATCH`

They are not claims about a production API. A real runtime handshake would require separate design review before adopting any external error shape.

## Regression gate

`tests/evidence-contract-handshake-toctou-simulation.test.js` validates the policy against:

- the current v1 happy path;
- unsupported selection without fallback;
- authority change between discovery and negotiation;
- capability artifact substitution between discovery and negotiation;
- authority/capability changes between negotiation and consume/replay;
- tampered selected version and artifacts in the negotiation receipt;
- a future lockstep v1+v2 state that requires fresh discovery before exact v2 selection.

The fixture `tests/fixtures/evidence-contract/handshake-toctou-simulation.json` must remain marked `simulationOnly: true` with all runtime implementation flags false.

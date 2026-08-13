# Evidence Contract Capability Discovery Simulation

This document defines the test-only **Contract Capability Advertisement / Version Discovery Simulation Gate**.

It does not introduce a production CLI flag, MCP method, schema field, runtime handshake, or Evidence Contract negotiation surface. The current runtime remains governed by the released Evidence Contract v1 compatibility reference.

## Authority boundary

`tests/fixtures/evidence-contract/negotiation-simulation.json` remains the authority for the simulated runtime's current contract version, exact supported-version set, selection policy, and contract-artifact mapping.

`tests/fixtures/evidence-contract/capability-advertisement-simulation.json` is only a derived capability snapshot. It must not become a second source of truth.

The snapshot is valid only when all of these match the negotiation authority exactly:

- current contract version;
- ordered supported-version set;
- exact-version selection policy;
- contract artifact for every supported version;
- golden artifact where one exists;
- runtime negotiation implementation status.

## Visibility boundary

The current simulation advertises only Evidence Contract v1. The presence of `v2-simulation.json` does not make v2 discoverable or runtime-supported.

Known-but-unsupported simulations and runtime-unsupported contract artifacts must not be exposed as supported capabilities. An unsupported contract artifact must not appear in the advertised artifact map merely because its fixture exists in the repository.

## Refusal parity

Unsupported-version refusal must report the same supported-version set that capability discovery returned. Discovery and negotiation are not allowed to tell consumers different stories about what the runtime supports.

The gate therefore checks v2, v3, and a distant future version against the current v1-only simulation and requires the refusal set to equal the discovered set exactly.

## Stale metadata

Capability metadata is fail-closed. A snapshot is stale or invalid when its current version, supported set, selection policy, artifact map, source authority, visibility policy, or runtime implementation status disagrees with the negotiation authority.

The simulation uses `CMI_EVIDENCE_CONTRACT_CAPABILITY_STALE` only as a test-harness refusal code. It is not a claim that production CMI currently exposes such an error code.

A stale snapshot must not return a partial capability list, guessed fallback, nearest version, or normalized artifact mapping.

## Future dual-version simulation

A future test simulation may advertise v1 and v2 only after the negotiation authority changes in lockstep to support both versions and maps each version to its own artifact.

In that future simulation:

- v1 remains discoverable and replayable;
- v2 becomes discoverable only through its exact mapping;
- v3 remains unsupported and refusal reports `[1, 2]`;
- the old v1-only capability snapshot becomes stale and must fail closed.

This proves upgrade mechanics only. It does not declare Evidence Contract v2 released or runtime-supported today.

## Regression gate

`tests/evidence-contract-capability-advertisement-simulation.test.js` validates the checked-in capability snapshot against `negotiation-simulation.json` and proves:

- current discovery advertises only released/runtime-supported v1;
- the v2 simulation is not leaked into discovery;
- unsupported refusal and discovery return the same supported-version set;
- stale current-version and supported-set metadata fail closed;
- wrong or extra artifact mappings fail at their concrete capability address;
- source-authority, visibility, and stale-handling policy cannot be weakened;
- future v1+v2 advertisement is accepted only when negotiation changes in lockstep;
- duplicate and invalid advertised versions are rejected before discovery succeeds.

This gate remains simulation-only until a separate production change establishes a real consumer need for runtime capability discovery.

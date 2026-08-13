# Evidence Contract Production Surface Go/No-Go

Status: **NO-GO at baseline `406d9edbaed8b7a08f5a7fb96cc4488ad1882087`**

Decision token:

```text
PRODUCTION_CONTRACT_SURFACE_NO_GO
```

This decision covers only whether CMI should add a production Evidence Contract capability-discovery, exact-version negotiation, handshake-binding, or consumer contract-selection surface now. It does not change Evidence Contract v1, the retained golden corpus, durable schemas, or existing CLI/MCP behavior.

## Decision

Do **not** add a production contract discovery/negotiation surface yet.

The simulation chain is mature enough to serve as an executable specification, but the current repository and public interface evidence does not establish a production consumer need that justifies the additional runtime compatibility surface.

## Evidence addresses

The decision is grounded in concrete repository surfaces:

- `package.json` — the package exposes the `cmi` and `cmi-mcp` executables. There is no separate production contract discovery/negotiation executable.
- `src/cli-entry.js` — current session/finding/evaluation CLI adapters have no Evidence Contract version discovery or exact-version selection flag.
- `src/mcp-entry.js` — current MCP read/write tool inventory has no Evidence Contract capability-discovery, negotiation, or handshake method.
- `README.md` — the documented public integration model is CLI, MCP, durable evidence, and Skills; no contract negotiation workflow is documented.
- `tests/fixtures/evidence-contract/negotiation-simulation.json` — negotiation is explicitly `simulationOnly` and `runtimeNegotiationImplemented: false`.
- `tests/fixtures/evidence-contract/capability-advertisement-simulation.json` — capability advertisement is explicitly simulation-only and not runtime implemented.
- `tests/fixtures/evidence-contract/handshake-toctou-simulation.json` — handshake/TOCTOU binding is explicitly simulation-only and all runtime implementation flags are false.

Maintainer recon at decision time also found no GitHub issue matching the bounded query `Evidence Contract negotiation discovery`. That is supporting external observation only; it is intentionally **not** treated as a permanent invariant because real demand can appear later.

## Why NO-GO

Current runtime compatibility has one supported Evidence Contract version: **v1**. A second-version simulation exists, but it is deliberately not runtime support.

There is also no named production consumer currently recorded as requiring exact Evidence Contract negotiation. Without both a real consumer and a real interoperability problem, adding discovery + negotiation + handshake state would increase public API, maintenance, compatibility, and failure-mode complexity without demonstrated product benefit.

The existing simulation suite already protects the important semantics:

- retained v1 compatibility;
- additive upgrade behavior;
- negative compatibility mutations;
- unsupported-version refusal;
- capability advertisement consistency;
- exact-version negotiation;
- TOCTOU revalidation and artifact continuity.

Keeping these as specification tests preserves future design work without prematurely converting them into runtime surface area.

## GO criteria

A future GO decision must not be based only on the existence of the simulation fixtures. At minimum it must establish all of the following:

1. **Named production consumer** — an actual integration/consumer needs version discovery or exact negotiation.
2. **Operational interoperability need** — the consumer has a concrete problem that fixed-v1 consumption cannot safely solve.
3. **Minimal read-only surface design** — the smallest viable surface is specified before implementation; no automatic downgrade or hidden normalization.
4. **Retained v1 compatibility** — existing v1 consumer/golden regression coverage remains mandatory.
5. **Fail-closed unsupported-version behavior** — unsupported versions are explicit errors, not fallback behavior.
6. **No silent downgrade** — a consumer asking for one contract cannot receive another contract implicitly.

A GO decision should state the concrete consumer, the failure/use case, the minimum surface, and why existing fixed-v1 behavior is insufficient.

## Re-evaluation triggers

Re-run this gate when any of these occur:

- a named production consumer requests or requires Evidence Contract discovery/negotiation;
- CMI adds a second Evidence Contract version to production support;
- a real interoperability failure is observed that a fixed-v1 consumer cannot resolve safely;
- an external integration must discover supported contract versions before consuming evidence.

These are review triggers, not automatic authorization to implement a production API.

## NO-GO requirements

While this verdict remains current:

- do not add production Evidence Contract negotiation only because simulation coverage exists;
- do not advertise the v2 simulation as runtime support;
- retain the v1 contract fixture and real-consumer golden corpus;
- retain the negotiation/capability/handshake simulations as executable specification;
- re-evaluate the decision when concrete trigger evidence appears.

## Scope boundary

This gate is intentionally decision/test/documentation-only. It does not add:

- a CLI version flag;
- an MCP capability-discovery method;
- an MCP/CLI negotiation method;
- a runtime handshake token;
- durable contract-selection metadata;
- automatic downgrade/upgrade behavior;
- runtime v2 support.

The purpose of this gate is to prevent architecture work from becoming production complexity before a consumer need exists.

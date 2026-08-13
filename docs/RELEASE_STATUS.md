# Current Release Status

Updated: 2026-08-13

## v0.12.1 PUBLIC RELEASE

`v0.12.1` is the current supported public CMI release. It is a maintenance-hardening release for CLI/MCP request boundaries and Portable Evidence trust integrity after `v0.12.0`.

### Public release summary

| Field | Value |
|---|---|
| Public release | `v0.12.1` |
| npm package | `codex-memory-intelligence@0.12.1` |
| npm dist-tag | `latest` |
| Release commit/tag target | `6d1336aee4475fb899992899d01cb8c6f11d201d` |
| Publish workflow | run `#13` / Actions run `31669333818` — success |
| Post-merge main CI | run `#1018` / Actions run `31669319368` — success |
| Post-merge CodeQL | run `#326` / Actions run `31669319376` — success |
| Temporary `release/v0.12.1` branch | removed by successful publish workflow |
| GitHub Release | [CMI v0.12.1](https://github.com/lenhonbp/codex-memory-intelligence/releases/tag/v0.12.1) |
| GitHub Release id | `369679638` |
| Public-source license | PolyForm Perimeter License 1.0.1 |

The authorized publish workflow verified exact release-target identity, package/source/changelog metadata, repository verification, benchmark smoke, packed installation, npm Trusted Publishing, registry visibility, GitHub Release creation, and temporary release-branch cleanup.

### v0.12.1 maintenance scope

- CLI malformed-input handling rejects unknown short options, duplicate single-value flags, and extra positional arguments on fixed-arity commands.
- MCP known-tool requests are validated against the supported JSON-Schema subset before business logic or durable writes; malformed arguments fail with JSON-RPC `-32602`.
- Portable Evidence restore/rebind rejects cross-platform artifact-name collisions and unsafe path segments independently of the host operating system.
- Restore/rebind provenance reuse validates the complete generated durable shape, and compatibility is rechecked immediately before staged install commit to close the relevant TOCTOU window.
- New Portable Evidence writers emit manifest schema v3 with a separate `integrity.digest` using `manifest-provenance-v1` coverage for manifest provenance metadata.
- Released Portable Evidence v2 identity semantics remain unchanged; unbound v2 origin location cannot promote compatibility to `exact`.
- Evidence Contract versioning/discovery/handshake work remains simulation-only; runtime support remains v1 and `PRODUCTION_CONTRACT_SURFACE_NO_GO` remains active.

### Evidence limits

- Portable Evidence digests provide integrity checking, not authentication, signatures, backup authenticity, or source-authorship proof; `authenticated` remains false.
- Evidence Contract v2 is not advertised as runtime support and v0.12.1 adds no production discovery/negotiation surface.
- Publication and test evidence do not establish productivity improvement, time savings, universal-agent effectiveness, or v1 readiness.

Canonical release detail: [CMI v0.12.1 Public Release](V0_12_1_RELEASE.md).

## v0.12.0 HISTORICAL RELEASE

`v0.12.0` is retained as the historical Evidence-Anchored Rule Intelligence feature release. It remains available for provenance and reproducibility but is no longer the supported security line.

That release introduced structured evidence anchors, `suspected` → `observed` → `established` verification semantics, and bounded source/symbol/feature/commit provenance while preserving the evidence-vs-inference trust boundary.

For installation and source downloads, new users should use the latest supported release:

https://github.com/lenhonbp/codex-memory-intelligence/releases/latest

See [Release & Version Policy](RELEASE_POLICY.md), [Security](../SECURITY.md), and [Changelog](../CHANGELOG.md) for current support and version history.

## Product capability status

The current CMI product line includes:

- local-first project memory and generated project intelligence;
- dependency/impact/boundary advisory intelligence;
- Change Intelligence BEFORE → DURING → AFTER records;
- Session Continuation Intelligence and persistent findings;
- preservation of intentionally incomplete active Changes across session closure;
- Codex/generic activation integration;
- Ambient Agent Intelligence;
- Closing Intelligence;
- Evidence-Anchored Rule Intelligence;
- all eight planned Agent Skill open-format adapters;
- npm shipment of those Skill artifacts under `skills/`;
- MCP integration with durable project writes disabled by default;
- Portable Evidence v3 writers with separate manifest-provenance integrity coverage while retaining released v2 compatibility;
- no npm auto-activation, automatic runtime Skill installation, CMI-native Skill loader, or production Evidence Contract negotiation surface.

## Field evidence boundary

v0.12.1 adds maintenance hardening and executable regression/release evidence. It does **not** replace historical agent field protocols or convert them into broader product-value claims.

The final agent-neutral Grok F0–F7 field protocol remains the historical `v0.11.0` subject:

| Scenario | Result | Summary |
|---|---|---|
| F0 | **PASS** | Exact public subject, real Grok project-rule/MCP/Skill surfaces, activation idempotence, limitations documented. |
| F1 | **PASS** | Natural read-only task produced durable CLEAN state, clean Git scope, and no Change record. |
| F2 | **PASS** | Intentionally unfinished Change remained active across sessions and surfaced as REMINDER, not BLOCKER. |
| F3 | **PASS** | Natural continuation resumed and completed the unfinished Change; later Closing no longer reported it unfinished. |
| F4 | **PASS** | Missing required evidence remained a real blocker; no value or verification result was invented. |
| F5 | **PASS** | Reviewed consistency rule remained evidence-bounded; `violationEstablished=false` without observed violation evidence. |
| F6 | **PASS** | More than three eligible signals were bounded to three alerts without burying material P0/P1 evidence. |
| F7 | **PASS** | Fresh run with only `Làm tiếp` used durable handoff/current evidence and did not promote unreviewed inference. |

Canonical historical field result:

```text
FINAL_GROK_FIELD_ACCEPTANCE = PASS
CMI_GROK_FIELD_VALIDATED = YES
CMI_PRODUCT_DEFECTS_FROM_GROK_ACCEPTANCE = 0
```

Repository evidence: [Grok v0.11.0 Final Field Acceptance](field-evidence/GROK_V0.11.0_ACCEPTANCE.md).

The final Codex S0–S7 matrix on the historical pre-release subject was not executed because the available runtime was capacity-blocked before S0. That remains an external runtime limitation, not a CMI PASS or FAIL.

## Governance / current state

| Item | State |
|---|---|
| Current supported public release | **v0.12.1** |
| Evidence-Anchored Rule Intelligence | **PUBLIC** |
| Portable Evidence v3 writer integrity hardening | **PUBLIC** |
| Production Evidence Contract discovery/negotiation | **NO-GO / NOT EXPOSED** |
| v0.12.1 publish pipeline | **PASS** |
| Final Grok F0–F7 on public `v0.11.0` subject | **PASS** |
| CMI Grok field validated | **YES** |
| Historical final Codex S0–S7 | **NOT EXECUTED — runtime blocked before S0** |

## Maintenance mode

v0.12.1 packages post-v0.12.0 trust-boundary and compatibility hardening without reopening the completed feature program. With publication complete, CMI remains in maintenance mode unless another genuine release, security, compatibility, field-defect, or separately authorized product need is established.

```text
CMI_FEATURE_DEVELOPMENT = COMPLETE
CMI_PUBLIC_RELEASE = v0.12.1
CMI_SUPPORTED_RELEASE = v0.12.1
CMI_MODE = MAINTENANCE
PLANNED_SKILLS = 8/8
OPEN_PLANNED_PRODUCT_FEATURES = 0
ACTIVE_EMPIRICAL_ROADMAP = 0
PRODUCTION_CONTRACT_SURFACE = NO_GO
FINAL_GROK_FIELD_ACCEPTANCE = PASS_ON_V0.11.0_SUBJECT
CMI_GROK_FIELD_VALIDATED = YES
CODEX_S0_S7 = NOT_EXECUTED_RUNTIME_BLOCKED
NEXT_CMI_MISSION = NONE
```

## Historical release policy

Historical tags and releases are retained for provenance, reproducibility, exact licensing history, and regression evidence. They are not recommended for new installations and are not represented as containing all current fixes or security hardening.

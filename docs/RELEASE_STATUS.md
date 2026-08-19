# Current Release Status

Updated: 2026-08-19

## v0.14.0 PUBLIC RELEASE

`v0.14.0` is the current supported public CMI release. It is a pre-v1 feature release for proactive repository-local agent workflow, portable consumer activation, bounded managed-integration ownership, Provenance Mark v1, Portable Evidence compatibility, and cross-platform/security hardening after `v0.13.0`.

### Public release summary

| Field | Value |
|---|---|
| Public release | `v0.14.0` |
| npm package | `codex-memory-intelligence@0.14.0` |
| npm dist-tag | `latest` |
| Release commit/tag target | `96f3e0f903fa4c9c3d967383ec695c63243b588b` |
| Temporary `release/v0.14.0` branch | removed after successful guarded publication |
| GitHub Release | [CMI v0.14.0](https://github.com/lenhonbp/codex-memory-intelligence/releases/tag/v0.14.0) |
| Public-source license | PolyForm Perimeter License 1.0.1 |

The guarded publication path requires exact release-target identity, release metadata consistency, full repository verification, benchmark smoke, packed installation, npm publication and registry visibility, GitHub Release creation, and temporary release-branch cleanup.

Canonical release detail: [CMI v0.14.0 Public Release](V0_14_0_RELEASE.md).

The historical preparation checkpoint remains at [CMI v0.14.0 Release Candidate](V0_14_0_RELEASE_CANDIDATE.md).

> Evidence note: this post-release sync records only publication identifiers directly observed through the connected repository surfaces. It intentionally does not invent an Actions run id or GitHub Release numeric id when those identifiers are not exposed by the current connector session.

## v0.14.0 scope

- Proactive repository-local agent workflow guidance is carried into activated consumer repositories, including constraint-first discovery, an ephemeral `.agent/todo.md` checklist, bounded failure recovery, proportional verification, and evidence-separated reporting.
- CMI Provenance Mark v1 distinguishes actual durable-session-backed workflow evidence from degraded operating-contract-only reporting and explicitly disclaims authorship, authentication, signing, approval, certification, and CMI verification.
- Consumer activation can bind MCP integration to an exact local CMI package entrypoint when valid local package evidence exists; malformed or unsafe local candidates fail closed.
- CMI-managed blocks in `AGENTS.md`, `.codex/config.toml`, and `.gitignore` have bounded ownership so unrelated consumer tasks preserve them without making the surrounding files globally immutable.
- Portable Evidence v2/v3 compatibility is published as an explicit bounded policy; current writers remain on v3 and unsupported future schemas fail closed.
- The pinned real-repository engineering corpus covers seven repositories across JavaScript/TypeScript, Python, Go, Rust, and PHP source trees.
- Windows MCP cleanup and package-bin validation were hardened from observed CI/CodeQL findings before release preparation.

## Evidence and trust limits

- Real-corpus validation is engineering portability evidence on pinned source trees, not proof of target-repository application correctness, language-complete parsing, or universal agent compatibility.
- Existing product-value studies remain descriptive; they do not establish answer-quality superiority, productivity improvement, or causal time savings.
- No pair becomes `productValueEligible` without the required blinded externally-verified human review under the current evaluation contract.
- The Provenance Mark records workflow participation/evidence provenance only; it is not authorship, authentication, signing, approval, certification, or verification by CMI.
- Portable Evidence digests provide integrity checks, not creator authentication, source authorship, or backup authenticity.
- `cmi-trust` remains a conservative pre-share guard, not DLP, malware scanning, authentication, signature verification, or proof that content is safe to disclose.
- Evidence Contract v2 remains simulation-only; production discovery/negotiation remains **NO-GO / NOT EXPOSED**.
- CodeQL is supporting security evidence, not complete security certification.
- Publication and test evidence do not establish v1 readiness.

## Historical release line

`v0.13.0` is now historical. It remains available for provenance, reproducibility, and exact licensing history but is no longer the supported security line.

Canonical historical detail: [CMI v0.13.0 Public Release](V0_13_0_RELEASE.md).

For installation and source downloads, new users should use the latest supported release:

https://github.com/lenhonbp/codex-memory-intelligence/releases/latest

See [Release & Version Policy](RELEASE_POLICY.md), [Security](../SECURITY.md), and [Changelog](../CHANGELOG.md) for current support and version history.

## Product capability status

The current CMI product line includes:

- local-first reviewed durable project memory with lifecycle/freshness provenance;
- dependency, impact, boundary, and pre-change advisory intelligence;
- Change Intelligence BEFORE → DURING → AFTER records;
- Session Continuation Intelligence, durable handoff state, and persistent findings;
- Codex/generic activation integration with proactive repository-local workflow guidance;
- Ambient and Closing Intelligence;
- Evidence-Anchored Rule Intelligence;
- all eight planned Agent Skill open-format adapters shipped in the npm package;
- MCP integration with durable project writes disabled by default;
- exact-local consumer runtime binding when valid local package evidence exists;
- bounded activation-managed ownership in AGENTS/config/ignore integration sections;
- CMI Provenance Mark v1 with durable-evidence-backed and degraded forms;
- Portable Evidence v3 writer integrity coverage with released v2 compatibility boundaries;
- Operational Trust through additive `cmi-trust` pre-share checks;
- maintainer/evaluator-side real-corpus and paired-study evidence tooling;
- no npm auto-activation, automatic runtime Skill installation, CMI-native Skill loader, or production Evidence Contract negotiation surface.

## Field evidence boundary

Historical agent field acceptance remains separately documented rather than being promoted by the v0.14.0 engineering/release evidence.

The final Grok F0–F7 field protocol remains the historical `v0.11.0` subject and is recorded in [Grok v0.11.0 Final Field Acceptance](field-evidence/GROK_V0.11.0_ACCEPTANCE.md).

The historical Codex S0–S7 matrix was not executed because the available runtime was capacity-blocked before S0. That remains an external runtime limitation, not a CMI PASS or FAIL.

The August 2026 product-value pilot remains descriptive evidence only. Its neutral/unfavorable answer-quality outcomes and favorable continuation timing observation do not establish a causal productivity effect.

The v0.14.0 consumer portability pilot establishes that the proactive workflow can operate in an activated external repository with durable Session/Change evidence, while also preserving the finding that activation-managed sections need explicit ownership boundaries. It is portability/workflow evidence, not a productivity benchmark.

## Governance / current state

| Item | State |
|---|---|
| Current supported public release | **v0.14.0** |
| Operational Trust / `cmi-trust` | **PUBLIC** |
| Proactive consumer workflow | **PUBLIC / ACTIVATION CONTRACT** |
| Provenance Mark v1 | **PUBLIC / WORKFLOW EVIDENCE PROVENANCE** |
| Exact-local consumer runtime binding | **PUBLIC / FAIL-CLOSED WHEN LOCAL CANDIDATE IS UNSAFE** |
| Real-repository engineering validation | **PUBLIC / ENGINEERING EVIDENCE** |
| Product Value Regression workflow | **PUBLIC / ENGINEERING DIAGNOSTIC** |
| Product-value eligible pilot pairs | **0 — externally-verified blinded human review not present** |
| Production Evidence Contract discovery/negotiation | **NO-GO / NOT EXPOSED** |
| v0.14.0 publish pipeline | **PASS** |
| v1 readiness | **NO-GO — roadmap evidence criteria remain** |
| Final Grok F0–F7 on public `v0.11.0` subject | **PASS** |
| Historical final Codex S0–S7 | **NOT EXECUTED — runtime blocked before S0** |

```text
CMI_PUBLIC_RELEASE = v0.14.0
CMI_SUPPORTED_RELEASE = v0.14.0
CMI_MODE = MAINTENANCE_WITH_BOUNDED_PRODUCT_EVIDENCE
PLANNED_SKILLS = 8/8
PRODUCTION_CONTRACT_SURFACE = NO_GO
PRODUCT_VALUE_ELIGIBLE_PAIRS = 0
PRODUCTIVITY_CLAIM = NOT_ESTABLISHED
V1_READINESS = NO_GO
```

## Historical release policy

Historical tags and releases are retained for provenance, reproducibility, exact licensing history, and regression evidence. They are not recommended for new installations and are not represented as containing all current fixes or security hardening.

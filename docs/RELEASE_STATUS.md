# Current Release Status

Updated: 2026-08-13

## v0.13.0 PUBLIC RELEASE

`v0.13.0` is the current supported public CMI release. It is a feature release for Operational Trust and stronger real-repository/product-evidence validation after `v0.12.1`.

### Public release summary

| Field | Value |
|---|---|
| Public release | `v0.13.0` |
| npm package | `codex-memory-intelligence@0.13.0` |
| npm dist-tag | `latest` |
| Release commit/tag target | `3cc7cfd29a1dc49f16c67f84af1c59ea29d42a91` |
| Publish workflow | run `#14` / Actions run `31724126683` — success |
| Post-merge main CI | run `#1113` / Actions run `31724107267` — success |
| Post-merge CodeQL | run `#352` / Actions run `31724107260` — success |
| Post-merge Operational Trust | run `#10` / Actions run `31724107195` — success |
| Temporary `release/v0.13.0` branch | removed by successful publish workflow |
| GitHub Release | [CMI v0.13.0](https://github.com/lenhonbp/codex-memory-intelligence/releases/tag/v0.13.0) |
| GitHub Release id | `370079664` |
| Public-source license | PolyForm Perimeter License 1.0.1 |

The guarded publish workflow verified exact release-target identity, package/source/changelog metadata, full repository verification, benchmark smoke, packed installation, npm Trusted Publishing, registry visibility, GitHub Release creation, and temporary release-branch cleanup.

Canonical release detail: [CMI v0.13.0 Public Release](V0_13_0_RELEASE.md).

## v0.13.0 scope

- **Operational Trust** is public through the additive read-only `cmi-trust` binary with `doctor` and `export` gates.
- Real-repository engineering validation uses pinned revisions, failure-preserving artifacts, exact-revision transport fallback, and dedicated CI.
- Empirical-study records preserve reviewer kind, assurance/blinding, timing when externally measured, and a strict externally-verified-human requirement for `productValueEligible`.
- Routine continuation/context/impact changes can use the lightweight Product Value Regression workflow instead of a full claim-grade study.
- CLI successful large-output completion is hardened against externally observed stdout truncation.
- Evidence reporting distinguishes engineering correctness, protocol eligibility, product-value-review eligibility, paired observations, and limitations.

## Evidence and trust limits

- Real-corpus validation is engineering evidence, not a productivity benchmark and not proof of target-repository application correctness.
- The first controlled plain-vs-CMI pilot remains `descriptive-only`; it did not establish CMI answer-quality superiority.
- A favorable continuation/handoff wall-clock observation is not a causal productivity result.
- Current blinded pilot reviews are agent QA; no pair is `productValueEligible` without blinded externally-verified human review.
- `cmi-trust` is a conservative pre-share guard, not DLP, malware scanning, authentication, signature verification, or proof that content is safe to disclose.
- Evidence Contract v2 remains simulation-only; production discovery/negotiation remains **NO-GO / NOT EXPOSED**.
- Publication and test evidence do not establish proven productivity, universal-agent effectiveness, or v1 readiness.

## Historical release line

`v0.12.1` is now historical. It remains available for provenance and reproducibility but is no longer the supported security line.

Canonical historical detail: [CMI v0.12.1 Public Release](V0_12_1_RELEASE.md).

For installation and source downloads, new users should use the latest supported release:

https://github.com/lenhonbp/codex-memory-intelligence/releases/latest

See [Release & Version Policy](RELEASE_POLICY.md), [Security](../SECURITY.md), and [Changelog](../CHANGELOG.md) for current support and version history.

## Product capability status

The current CMI product line includes:

- local-first reviewed durable project memory with lifecycle/freshness provenance;
- dependency, impact, boundary, and pre-change advisory intelligence;
- Change Intelligence BEFORE → DURING → AFTER records;
- Session Continuation Intelligence, durable handoff state, and persistent findings;
- Codex/generic activation integration;
- Ambient and Closing Intelligence;
- Evidence-Anchored Rule Intelligence;
- all eight planned Agent Skill open-format adapters shipped in the npm package;
- MCP integration with durable project writes disabled by default;
- Portable Evidence v3 writer integrity coverage with released v2 compatibility boundaries;
- Operational Trust through additive `cmi-trust` pre-share checks;
- maintainer/evaluator-side real-corpus and paired-study evidence tooling;
- no npm auto-activation, automatic runtime Skill installation, CMI-native Skill loader, or production Evidence Contract negotiation surface.

## Field evidence boundary

Historical agent field acceptance remains separately documented rather than being promoted by the v0.13.0 engineering/release evidence.

The final Grok F0–F7 field protocol remains the historical `v0.11.0` subject and is recorded in [Grok v0.11.0 Final Field Acceptance](field-evidence/GROK_V0.11.0_ACCEPTANCE.md).

The historical Codex S0–S7 matrix was not executed because the available runtime was capacity-blocked before S0. That remains an external runtime limitation, not a CMI PASS or FAIL.

The August 2026 product-value pilot is recorded as descriptive evidence only. Its neutral/unfavorable answer-quality outcomes are preserved alongside the continuation timing observation; no productivity or causal claim is made from that pilot.

## Governance / current state

| Item | State |
|---|---|
| Current supported public release | **v0.13.0** |
| Operational Trust / `cmi-trust` | **PUBLIC** |
| Real-repository engineering validation | **PUBLIC / ENGINEERING EVIDENCE** |
| Product Value Regression workflow | **PUBLIC / ENGINEERING DIAGNOSTIC** |
| Product-value eligible pilot pairs | **0 — externally-verified blinded human review not present** |
| Production Evidence Contract discovery/negotiation | **NO-GO / NOT EXPOSED** |
| v0.13.0 publish pipeline | **PASS** |
| Final Grok F0–F7 on public `v0.11.0` subject | **PASS** |
| Historical final Codex S0–S7 | **NOT EXECUTED — runtime blocked before S0** |

```text
CMI_PUBLIC_RELEASE = v0.13.0
CMI_SUPPORTED_RELEASE = v0.13.0
CMI_MODE = MAINTENANCE_WITH_BOUNDED_PRODUCT_EVIDENCE
PLANNED_SKILLS = 8/8
PRODUCTION_CONTRACT_SURFACE = NO_GO
PRODUCT_VALUE_ELIGIBLE_PAIRS = 0
PRODUCTIVITY_CLAIM = NOT_ESTABLISHED
```

## Historical release policy

Historical tags and releases are retained for provenance, reproducibility, exact licensing history, and regression evidence. They are not recommended for new installations and are not represented as containing all current fixes or security hardening.

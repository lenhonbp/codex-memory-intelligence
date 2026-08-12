# Current Release Status

Updated: 2026-08-12

## v0.12.0 PUBLIC RELEASE

`v0.12.0` is the current supported public CMI release. It adds Evidence-Anchored Rule Intelligence while preserving CMI's evidence-vs-inference trust boundary.

### Public release summary

| Field | Value |
|---|---|
| Public release | `v0.12.0` |
| npm package | `codex-memory-intelligence@0.12.0` |
| npm dist-tag | `latest` |
| Release commit/tag target | `623d6599aa4d175c4b054b6216c18bf3adc5a3aa` |
| Publish workflow | run `#12` / Actions run `31557297420` — success |
| Post-merge main CI | run `#827` / Actions run `31557178081` — success |
| Post-merge CodeQL | run `#263` / Actions run `31557178087` — success |
| Temporary `release/v0.12.0` branch | removed by successful publish workflow |
| GitHub Release | [CMI v0.12.0](https://github.com/lenhonbp/codex-memory-intelligence/releases/tag/v0.12.0) |
| GitHub Release id | `368961661` |
| Public-source license | PolyForm Perimeter License 1.0.1 |

The authorized publish workflow verified exact release-target identity, package/source/changelog metadata, the repository verification suite, benchmark smoke, packed installation, npm Trusted Publishing, registry visibility, GitHub Release creation, and temporary release-branch cleanup.

### v0.12.0 capability scope

- Findings and reviewed-rule checks can carry bounded evidence anchors with project-relative file paths and line ranges plus symbol, feature, and commit context when available.
- Portable evidence supports `source:`, `symbol:`, `feature:`, and `commit:` references.
- Finding verification semantics distinguish `suspected`, `observed`, and `established`; durable `resolved` remains a separate finding lifecycle state.
- Ambient Intelligence tells agents to inspect affected source and capture evidence anchors when reviewed rules are relevant.
- Closing Intelligence can render evidence anchors and verification state.
- `violationEstablished` is tied to established verification rather than reviewed-rule relevance or a source match alone.
- Findings schema support is additive/backward-compatible through optional `verificationState` and `evidenceAnchors` fields under the existing schema version.

### Evidence limits

- A source citation establishes where observed code/evidence exists; it does not by itself prove a runtime-visible, user-visible, architecture, design, or policy violation.
- `established` requires verification appropriate to the rule, such as tests, runtime/browser observation, or explicit human review.
- Line numbers can drift; symbol/feature/commit context reduces ambiguity but is not compiler-grade symbol identity.
- v0.12.0 does not include an autonomous universal rule scanner and does not hard-code Project 001-specific rules or detectors.
- Publication and test evidence do not establish productivity improvement, time savings, universal-agent effectiveness, or v1 readiness.

Canonical release detail: [CMI v0.12.0 Public Release](V0_12_RELEASE.md).

## v0.11.2 HISTORICAL RELEASE

`v0.11.2` is retained as the historical graph-drift signal-quality maintenance release. It remains available for provenance and reproducibility but is no longer the supported security line.

That release kept stale graph evidence fail-closed for graph/impact claims while distinguishing expected current-session source-only drift from unexplained or structural drift. It did not relabel stale graph evidence healthy and did not auto-run `cmi scan` merely to produce Closing `CLEAN`.

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
- no npm auto-activation, automatic runtime Skill installation, or CMI-native Skill loader.

## Field evidence boundary

v0.12.0 adds bounded source-provenance and verification-state behavior with repository tests, hosted CI/CodeQL, package smoke, benchmark smoke, and release-pipeline evidence. It does **not** replace historical agent field protocols or convert them into broader claims.

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
| Current supported public release | **v0.12.0** |
| Evidence-Anchored Rule Intelligence | **PUBLIC** |
| v0.12.0 publish pipeline | **PASS** |
| Final Grok F0–F7 on public `v0.11.0` subject | **PASS** |
| CMI Grok field validated | **YES** |
| Historical final Codex S0–S7 | **NOT EXECUTED — runtime blocked before S0** |

## Maintenance mode

The v0.12.0 feature was a separately authorized evidence-quality improvement after the earlier planned feature program had completed. With publication complete, CMI returns to maintenance mode unless another genuine release, security, compatibility, field-defect, or separately authorized product need is established.

```text
CMI_FEATURE_DEVELOPMENT = COMPLETE
CMI_PUBLIC_RELEASE = v0.12.0
CMI_SUPPORTED_RELEASE = v0.12.0
CMI_MODE = MAINTENANCE
PLANNED_SKILLS = 8/8
OPEN_PLANNED_PRODUCT_FEATURES = 0
ACTIVE_EMPIRICAL_ROADMAP = 0
FINAL_GROK_FIELD_ACCEPTANCE = PASS_ON_V0.11.0_SUBJECT
CMI_GROK_FIELD_VALIDATED = YES
CODEX_S0_S7 = NOT_EXECUTED_RUNTIME_BLOCKED
NEXT_CMI_MISSION = NONE
```

## Historical release policy

Historical tags and releases are retained for provenance, reproducibility, exact licensing history, and regression evidence. They are not recommended for new installations and are not represented as containing all current fixes or security hardening.

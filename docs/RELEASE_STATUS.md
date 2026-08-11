# Current Release Status

Updated: 2026-08-11

## v0.11.1 PUBLIC RELEASE

`v0.11.1` is the current supported public CMI release. The planned feature-development program is complete and the project is in maintenance mode.

For installation and source downloads, new users should use the latest supported release:

https://github.com/lenhonbp/codex-memory-intelligence/releases/latest

Historical releases remain available for provenance and reproducibility but are not the currently supported security line. See [Release & Version Policy](RELEASE_POLICY.md) and [Security](../SECURITY.md).

### Public release summary

| Field | Value |
|---|---|
| Public release | `v0.11.1` |
| npm package | `codex-memory-intelligence@0.11.1` |
| npm dist-tag | `latest` |
| Release commit/tag target | `a2902d3af0bdc8ddc49e66fd7c6607737421dcc7` |
| Publish workflow | run `#10` / Actions run `31498781325` — success |
| Post-merge main CI | run `#769` / Actions run `31498515892` — success |
| Post-merge CodeQL | run `#244` / Actions run `31498515880` — success |
| Temporary `release/v0.11.1` branch | removed by successful publish workflow |
| GitHub Release | [CMI v0.11.1](https://github.com/lenhonbp/codex-memory-intelligence/releases/tag/v0.11.1) |
| Public-source license | PolyForm Perimeter License 1.0.1 |

The authorized publish workflow verified release metadata, the repository test suite, benchmark smoke, packed installation, npm publication, registry visibility, GitHub Release creation, and temporary release-branch cleanup.

### Release scope

`v0.11.1` is a licensing/provenance maintenance release over the feature-complete `v0.11.0` product line. It carries the current public-source licensing and project-identity package:

- PolyForm Perimeter License 1.0.1 for post-cutover source;
- `LICENSING.md` documenting the current source-available/commercial-license model;
- `NOTICE` and `BRAND_POLICY.md` for official-project provenance and identity boundaries;
- contribution guidance for material code contributions;
- a structured real-repository field-feedback entry point;
- no new product-behavior capability claim beyond the previously published product line.

`v0.11.0` and earlier public releases remain under the MIT terms shipped with those exact versions. This release does not retroactively revoke previously granted rights.

## Product capability status

The current CMI product line includes:

- Codex/generic CMI activation integration;
- Ambient Agent Intelligence;
- Closing Intelligence;
- Session/Change continuation improvements, including preservation of intentionally incomplete active Changes;
- the lifecycle rule that session completion does not imply Change completion;
- all eight planned Agent Skill open-format adapters;
- npm shipment of those eight Skill artifacts under `skills/`;
- MCP integration with durable project writes disabled by default;
- no npm auto-activation or automatic runtime Skill installation;
- `cmi activate` does not install Skills;
- no CMI-native Skill loader.

## Field evidence boundary

The most recent product-behavior field evidence remains the bounded `v0.11.0` field subject because `v0.11.1` does not claim a product-behavior change.

A final agent-neutral F0–F7 field protocol was run against the public `codex-memory-intelligence@0.11.0` subject using Grok runtime surfaces available in the observed environment.

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

Canonical result:

```text
FINAL_GROK_FIELD_ACCEPTANCE = PASS
CMI_GROK_FIELD_VALIDATED = YES
CMI_PRODUCT_DEFECTS_FROM_GROK_ACCEPTANCE = 0
PATCH_RELEASE_REQUIRED = NO
```

Repository evidence summary: [Grok v0.11.0 Final Field Acceptance](field-evidence/GROK_V0.11.0_ACCEPTANCE.md).

The run used `cmi activate` for managed `AGENTS.md`, explicit Skill placement under the Grok runtime, and project MCP configuration. This does not establish npm auto-activation, Skill installation by `cmi activate`, a native Grok Skill loader, or a universal Grok integration path.

No CMI product defect was established by that bounded field run.

## Governance / field evidence

| Item | State |
|---|---|
| Current supported public release | **v0.11.1** |
| Final Grok F0–F7 on public `v0.11.0` product subject | **PASS** |
| CMI Grok field validated | **YES** |
| Mission 1.8B final Codex S0–S7 on final pre-release subject | **NOT EXECUTED — runtime blocked before S0** |
| CMI field blockers from final Grok acceptance | `0` |
| CMI field majors from final Grok acceptance | `0` |
| CMI field minors from final Grok acceptance | `0` |

The final Codex S0–S7 matrix was **not executed** on `c05098fa82ddf85a4443e3769801baf78e12c200`. The available ChatGPT-auth Codex runtime was capacity-blocked and the operator environment had no API key for fallback. This remains an external runtime limitation; it is not recorded as a CMI field PASS or FAIL for those final scenarios.

The successful Grok F0–F7 run is a separate bounded field result. It must not be used to rewrite the historical Codex result.

## Evidence limits

- Grok F0–F7 PASS does not imply universal agent validation.
- No claim that final Codex S0–S7 field acceptance passed.
- No productivity-improvement or time-savings claim.
- Static parsing, impact, and boundary inference remain heuristic/advisory rather than compiler-grade.
- Agent clients may ignore project instructions or MCP guidance.
- Package shipment does not prove runtime Skill discovery or automatic Skill selection.
- No universal Codex/Grok Skill installation path is claimed.
- This release is not a v1-readiness claim.
- Unreviewed inference is not automatically promoted into durable project truth.

## Maintenance mode

```text
CMI_FEATURE_DEVELOPMENT = COMPLETE
CMI_PUBLIC_RELEASE = v0.11.1
CMI_SUPPORTED_RELEASE = v0.11.1
CMI_MODE = MAINTENANCE
PLANNED_SKILLS = 8/8
OPEN_PLANNED_PRODUCT_FEATURES = 0
ACTIVE_EMPIRICAL_ROADMAP = 0
FINAL_GROK_FIELD_ACCEPTANCE = PASS_ON_V0.11.0_SUBJECT
CMI_GROK_FIELD_VALIDATED = YES
CODEX_S0_S7 = NOT_EXECUTED_RUNTIME_BLOCKED
NEXT_CMI_MISSION = NONE
```

No additional feature Mission should be invented unless a genuine release, security, compatibility, or maintenance need is separately established. Future work is maintenance, security, bug remediation, or separately authorized research.

## Historical release policy

Historical tags and releases are retained for provenance, reproducibility, and exact license history. They are not recommended for new installations and are not represented as containing all current fixes or security hardening.

Use [Release & Version Policy](RELEASE_POLICY.md), [Security](../SECURITY.md), and `CHANGELOG.md` for current support and version-history guidance.

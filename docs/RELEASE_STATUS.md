# Current Release Status

Updated: 2026-08-11

## v0.11.1 PUBLIC RELEASE

`v0.11.1` is the current public CMI release and the first published package in the post-cutover source-available licensing line. The planned feature-development program remains complete and the project remains in maintenance mode.

`v0.11.1` is a licensing, provenance, contribution-policy, and field-feedback maintenance release. It does **not** claim a new CMI product-behavior result beyond the previously documented field evidence.

### Public release summary

| Field | Value |
|---|---|
| Public release | `v0.11.1` |
| npm package | `codex-memory-intelligence@0.11.1` |
| npm dist-tag | `latest` |
| Release commit/tag target | `a2902d3af0bdc8ddc49e66fd7c6607737421dcc7` |
| Licensing | PolyForm Perimeter License 1.0.1 for `v0.11.1` / post-cutover source |
| Legacy license boundary | `v0.11.0` and earlier remain MIT-licensed as published |
| Publish workflow | run `#10` / Actions run `31498781325` — success |
| Post-merge main CI | run `#769` / Actions run `31498515892` — success |
| Post-merge CodeQL | run `#244` / Actions run `31498515880` — success |
| Temporary `release/v0.11.1` branch | removed by successful publish workflow |
| GitHub Release | [CMI v0.11.1](https://github.com/lenhonbp/codex-memory-intelligence/releases/tag/v0.11.1) |

The authorized publish workflow verified the exact release target, semantic release metadata, repository verification, benchmark smoke, packed installation, npm publication, npm registry visibility, GitHub Release creation, and temporary release-branch cleanup.

### v0.11.1 release scope

`v0.11.1` publishes the protection and public-field-testing baseline prepared after `v0.11.0`:

- PolyForm Perimeter License 1.0.1 for the post-cutover source line;
- `LICENSING.md` documenting the current source-available model, legacy MIT boundary, and separate commercial-license path;
- `NOTICE` and `BRAND_POLICY.md` for provenance, attribution, official-project identity, and fork-disclosure guidance;
- npm package inclusion of the licensing/provenance documents;
- README terminology and installation guidance aligned with the source-available license boundary;
- a structured real-repository field-feedback issue template;
- contribution-policy guidance requiring pre-coordination for material code contributions until a formal contributor licensing agreement exists.

This release does not retroactively relicense any previously published MIT release. Always use the license shipped with the exact package version, tag, or source snapshot in use.

## Product field evidence

The product-behavior evidence remains bounded by the previously observed `v0.11.0` subject because `v0.11.1` does not claim a behavior change requiring a new acceptance result.

### Final Grok field acceptance on v0.11.0

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
```

Repository evidence summary: [Grok v0.11.0 Final Field Acceptance](field-evidence/GROK_V0.11.0_ACCEPTANCE.md).

The run used `cmi activate` for managed `AGENTS.md`, explicit Skill placement under the Grok runtime, and project MCP configuration. This does not establish npm auto-activation, Skill installation by `cmi activate`, a native Grok Skill loader, or a universal Grok integration path.

### Codex final acceptance status

The final Codex S0–S7 matrix was **not executed** on `c05098fa82ddf85a4443e3769801baf78e12c200`. The available ChatGPT-auth Codex runtime was capacity-blocked and the operator environment had no API key for fallback. This remains an external runtime limitation; it is not recorded as a CMI field PASS or FAIL for those final scenarios.

The successful Grok F0–F7 run is a separate bounded field result. It must not be used to rewrite the historical Codex result.

## Governance / field evidence

| Item | State |
|---|---|
| Current public release | **v0.11.1** |
| Current public-source model | **source-available / PolyForm Perimeter 1.0.1** |
| Legacy `v0.11.0` and earlier license | **MIT as published** |
| Final Grok F0–F7 on public `v0.11.0` | **PASS** |
| CMI Grok field validated | **YES** |
| Mission 1.8B final Codex S0–S7 on final pre-release subject | **NOT EXECUTED — runtime blocked before S0** |
| CMI field blockers from final Grok acceptance | `0` |
| CMI field majors from final Grok acceptance | `0` |
| CMI field minors from final Grok acceptance | `0` |

## Evidence limits

- `v0.11.1` is a licensing/provenance maintenance release, not new evidence of product effectiveness.
- Grok F0–F7 PASS on `v0.11.0` does not imply universal agent validation.
- No claim that final Codex S0–S7 field acceptance passed.
- No productivity-improvement or time-savings claim.
- No causal or comparative result is inferred from incomplete empirical work.
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
CMI_MODE = MAINTENANCE
PLANNED_SKILLS = 8/8
OPEN_PLANNED_PRODUCT_FEATURES = 0
ACTIVE_EMPIRICAL_ROADMAP = 0
FINAL_GROK_FIELD_ACCEPTANCE = PASS_ON_V0.11.0_SUBJECT
CMI_GROK_FIELD_VALIDATED = YES
CODEX_S0_S7 = NOT_EXECUTED_RUNTIME_BLOCKED
NEXT_CMI_MISSION = NONE
```

No additional feature Mission should be invented unless a genuine release, security, compatibility, maintenance, or separately authorized research need is established.

## Historical: v0.11.0 public release

- Release: `v0.11.0`
- npm package: `codex-memory-intelligence@0.11.0`
- License: MIT as published
- Release commit/tag target: `a351406d7c68210b447d184b8d338f22032704a2`
- Publish workflow: run `#9` / Actions run `31455405087` — success
- GitHub Release: [CMI v0.11.0](https://github.com/lenhonbp/codex-memory-intelligence/releases/tag/v0.11.0)
- Final Grok F0–F7 field acceptance: **PASS** on the exact public subject

The immutable `v0.11.0` tag predates the source-available licensing cutover. Its MIT terms remain the terms shipped with that release.

## Historical: v0.10.0 public release

- Release: `v0.10.0`
- npm package: `codex-memory-intelligence@0.10.0`
- Release commit/tag target: `7218634b5ee54165dcedefe57fea5f6cb2a080fd`
- GitHub Release: [CMI v0.10.0](https://github.com/lenhonbp/codex-memory-intelligence/releases/tag/v0.10.0)
- Independent packed-package black-box acceptance: Issue #36 — `BLACK_BOX_ACCEPTED`

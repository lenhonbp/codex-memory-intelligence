# Current Release Status

Updated: 2026-08-11

## v0.11.0 PUBLIC RELEASE

`v0.11.0` is the current public CMI release. The planned feature-development program is complete and the project is in maintenance mode.

### Public release summary

| Field | Value |
|---|---|
| Public release | `v0.11.0` |
| npm package | `codex-memory-intelligence@0.11.0` |
| npm dist-tag | `latest` |
| Release commit/tag target | `a351406d7c68210b447d184b8d338f22032704a2` |
| Current `main` before this docs closeout | `72af69acfb6bbb00b45c0bdb2d0370464ed2d742` |
| Base feature-complete subject | `c05098fa82ddf85a4443e3769801baf78e12c200` |
| Planned Skills implemented | **8/8** |
| Planned Skills shipped in npm package | **8/8** |
| Publish workflow | run `#9` / Actions run `31455405087` — success |
| Post-merge main CI | run `#734` / Actions run `31455388444` — success |
| Post-merge CodeQL | run `#233` / Actions run `31455388450` — success |
| Release-branch CI | run `#735` / Actions run `31455405124` — success |
| Temporary `release/v0.11.0` branch | removed by successful publish workflow |
| GitHub Release | [CMI v0.11.0](https://github.com/lenhonbp/codex-memory-intelligence/releases/tag/v0.11.0) |

The authorized publish workflow verified release metadata, the repository test suite, benchmark smoke, packed installation, npm publication, registry visibility, GitHub Release creation, and temporary release-branch cleanup. npm publication used Trusted Publishing, published with the `latest` tag, and emitted signed provenance to the Sigstore transparency log (log index `2415874549`).

### Release scope

`v0.11.0` publishes the feature-complete post-`v0.10.0` line:

- Codex/generic CMI activation integration;
- Ambient Agent Intelligence;
- Closing Intelligence;
- Session/Change continuation improvements, including preservation of intentionally incomplete active Changes;
- the lifecycle rule that session completion does not imply Change completion;
- all eight planned Agent Skill open-format adapters;
- npm shipment of those eight Skill artifacts under `skills/`;
- no npm auto-activation or automatic runtime Skill installation;
- `cmi activate` does not install Skills;
- no CMI-native Skill loader.

## Final Grok field acceptance

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

No CMI product defect was established, so the Grok acceptance does not require `v0.11.1` or a republish of `v0.11.0`.

## Governance / field evidence

| Item | State |
|---|---|
| Final Grok F0–F7 on public `v0.11.0` | **PASS** |
| CMI Grok field validated | **YES** |
| Mission 1.8B final Codex S0–S7 on final pre-release subject | **NOT EXECUTED — runtime blocked before S0** |
| Issue #41 | closed **NOT_PLANNED** — **not** S0–S7 PASS |
| Study #30 (Study 003 preregistration) | closed **NOT_PLANNED** / deferred — no manufactured results |
| CMI field blockers from final Grok acceptance | `0` |
| CMI field majors from final Grok acceptance | `0` |
| CMI field minors from final Grok acceptance | `0` |

The final Codex S0–S7 matrix was **not executed** on `c05098fa82ddf85a4443e3769801baf78e12c200`. The available ChatGPT-auth Codex runtime was capacity-blocked and the operator environment had no API key for fallback. This remains an external runtime limitation; it is not recorded as a CMI field PASS or FAIL for those final scenarios.

The successful Grok F0–F7 run is a separate bounded field result. It must not be used to rewrite the historical Codex result.

## Evidence limits

- Grok F0–F7 PASS does not imply universal agent validation.
- No claim that final Codex S0–S7 field acceptance passed.
- No productivity-improvement or time-savings claim.
- No causal or comparative result is inferred from incomplete Study 003.
- Static parsing, impact, and boundary inference remain heuristic/advisory rather than compiler-grade.
- Agent clients may ignore project instructions or MCP guidance.
- Package shipment does not prove runtime Skill discovery or automatic Skill selection.
- No universal Codex/Grok Skill installation path is claimed.
- This release is not a v1-readiness claim.
- Unreviewed inference is not automatically promoted into durable project truth.

## Maintenance mode

```text
CMI_FEATURE_DEVELOPMENT = COMPLETE
CMI_PUBLIC_RELEASE = v0.11.0
CMI_MODE = MAINTENANCE
PLANNED_SKILLS = 8/8
OPEN_PLANNED_PRODUCT_FEATURES = 0
ACTIVE_EMPIRICAL_ROADMAP = 0
FINAL_GROK_FIELD_ACCEPTANCE = PASS
CMI_GROK_FIELD_VALIDATED = YES
CODEX_S0_S7 = NOT_EXECUTED_RUNTIME_BLOCKED
PATCH_RELEASE_REQUIRED = NO
NEXT_CMI_MISSION = NONE
```

No additional feature Mission should be invented unless a genuine release, security, compatibility, or maintenance need is separately established. Future work is maintenance, security, bug remediation, or separately authorized research.

## Historical wording note

The immutable `v0.11.0` tag was created from the reviewed release-preparation snapshot. Some text inside that tagged snapshot therefore uses pre-publication wording such as “release candidate” or “publication remains separately authorized.” That wording records the state immediately before publication. The documentation on `main` is the repository-level post-publication status record.

## Historical: v0.10.0 public release

- Release: `v0.10.0`
- npm package: `codex-memory-intelligence@0.10.0`
- Release commit/tag target: `7218634b5ee54165dcedefe57fea5f6cb2a080fd`
- GitHub Release: [CMI v0.10.0](https://github.com/lenhonbp/codex-memory-intelligence/releases/tag/v0.10.0)
- Independent packed-package black-box acceptance: Issue #36 — `BLACK_BOX_ACCEPTED`

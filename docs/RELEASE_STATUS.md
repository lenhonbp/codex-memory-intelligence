# Current Release Status

Updated: 2026-08-11

## v0.11.0 PUBLIC RELEASE

`v0.11.0` is the current public CMI release. The feature-development program is complete and the project is now in maintenance mode.

### Public release summary

| Field | Value |
|-------|--------|
| Public release | `v0.11.0` |
| npm package | `codex-memory-intelligence@0.11.0` |
| npm dist-tag | `latest` |
| Release commit/tag target | `a351406d7c68210b447d184b8d338f22032704a2` |
| Base feature-complete subject | `c05098fa82ddf85a4443e3769801baf78e12c200` |
| Planned Skills implemented | **8/8** |
| Planned Skills shipped in npm package | **8/8** |
| Publish workflow | run `#9` / Actions run `31455405087` — success |
| Post-merge main CI | run `#734` / Actions run `31455388444` — success |
| Post-merge CodeQL | run `#233` / Actions run `31455388450` — success |
| Release-branch CI | run `#735` / Actions run `31455405124` — success |
| Temporary `release/v0.11.0` branch | removed by successful publish workflow |
| GitHub Release | [CMI v0.11.0](https://github.com/lenhonbp/codex-memory-intelligence/releases/tag/v0.11.0) |

The authorized publish workflow verified release metadata, the full repository test suite, benchmark smoke, packed installation, npm publication, npm registry visibility, GitHub Release creation, and temporary release-branch cleanup. npm publication used Trusted Publishing, published with the `latest` tag, and emitted a signed provenance statement to the Sigstore transparency log (log index `2415874549`).

### Release scope

`v0.11.0` publishes the feature-complete post-`v0.10.0` line:

- Codex/generic CMI activation integration;
- Ambient Agent Intelligence;
- Closing Intelligence;
- Session/Change continuation improvements, including preservation of intentionally incomplete active Changes;
- the explicit lifecycle rule that session completion does not imply Change completion;
- all eight planned Agent Skill open-format adapters;
- npm shipment of the eight Skill artifacts under `skills/`;
- no npm auto-activation or automatic runtime Skill installation;
- `cmi activate` does not install Skills;
- no CMI-native Skill loader.

### Governance / field evidence

| Item | State |
|------|--------|
| Mission 1.8B final Codex S0–S7 on final pre-release subject | **NOT EXECUTED — runtime blocked before S0** |
| Issue #41 | closed **NOT_PLANNED** — **not** S0–S7 PASS |
| Study #30 (Study 003 preregistration) | closed **NOT_PLANNED** / deferred — no manufactured results |
| CMI field blockers | `0` |
| CMI field majors | `0` |
| CMI field minors | `0` |

The final Codex S0–S7 matrix was **not executed** on `c05098fa82ddf85a4443e3769801baf78e12c200`. The available ChatGPT-auth Codex runtime was capacity-blocked and the operator environment had no API key for fallback. This remains an external runtime limitation; it is not recorded as a CMI field PASS or FAIL for those final scenarios.

### Evidence limits

- No claim that final Codex S0–S7 field acceptance passed.
- No productivity-improvement or time-savings claim.
- No causal or comparative result is inferred from incomplete Study 003.
- Static parsing, impact, and boundary inference remain heuristic/advisory rather than compiler-grade.
- Agent clients may ignore project instructions or MCP guidance.
- Package shipment does not prove runtime Skill discovery or automatic Skill selection.
- No universal Codex/Grok Skill installation path is claimed.
- This release is not a v1-readiness claim.

## Maintenance mode

```text
CMI_FEATURE_DEVELOPMENT = COMPLETE
CMI_PUBLIC_RELEASE = v0.11.0
CMI_MODE = MAINTENANCE
PLANNED_SKILLS = 8/8
OPEN_PLANNED_PRODUCT_FEATURES = 0
ACTIVE_EMPIRICAL_ROADMAP = 0
NEXT_CMI_MISSION = NONE
```

No additional feature Mission should be invented unless a genuine release/security/maintenance need is separately established. Future work is maintenance, security, bug remediation, or separately authorized research.

## Historical wording note

The immutable `v0.11.0` tag was created from the reviewed release-preparation snapshot. Some text inside that tagged snapshot therefore uses pre-publication wording such as “release candidate” or “publication remains separately authorized.” That wording records the state immediately before publication. This document on `main` is the repository-level post-publication status record.

## Historical: v0.10.0 public release

- Release: `v0.10.0`
- npm package: `codex-memory-intelligence@0.10.0`
- Release commit/tag target: `7218634b5ee54165dcedefe57fea5f6cb2a080fd`
- GitHub Release: [CMI v0.10.0](https://github.com/lenhonbp/codex-memory-intelligence/releases/tag/v0.10.0)
- Independent packed-package black-box acceptance: Issue #36 — `BLACK_BOX_ACCEPTED`

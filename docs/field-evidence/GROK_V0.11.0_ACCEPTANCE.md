# CMI v0.11.0 — Final Grok Field Acceptance

Date: 2026-08-11

This document records the final agent-neutral Grok field-acceptance result for the public `codex-memory-intelligence@0.11.0` subject.

The checked-in record is an evidence summary. The operator-retained raw evidence root is:

```text
/Users/lenhon/Downloads/CMI-grok-field-acceptance-v0.11.0/REPORT.md
```

The raw machine-local artifacts are not claimed to be reproduced by this repository summary.

## Baseline

| Item | Result |
|---|---|
| Public release | `codex-memory-intelligence@0.11.0` |
| Release tag | `v0.11.0` |
| Release tag target | `a351406d7c68210b447d184b8d338f22032704a2` |
| `origin/main` at validation closeout | `72af69acfb6bbb00b45c0bdb2d0370464ed2d742` (post-release documentation only) |
| CMI source worktree | clean throughout |
| Public-subject tarball SHA-256 | `0ce48393730aea6c5a23f5bc0dc75e7a2b1ee4ca9d9f294da39f254709ca9366` |
| Validation project | `validation/cmi-field-target` |
| Validation branch | `field/grok-f0-f7-acceptance` |

## Integration boundary

F0 used the runtime mechanisms actually available to Grok:

- `cmi activate` for the managed `AGENTS.md` project instruction surface;
- explicit Skill placement under `.grok/skills/`;
- project `.grok/config.toml` MCP configuration pointing to the exact local package with writes enabled;
- `GROK_FOLDER_TRUST=0` for the field runtime because project MCP required folder trust in the observed environment.

The run does **not** claim that:

- npm installation automatically activates or installs Skills;
- `cmi activate` installs Skills;
- CMI contains a native Grok Skill loader;
- the observed Grok integration mechanism is universal across Grok versions or other agents.

Activation was run twice and was idempotent on the managed surfaces. The CMI subject was not mutated.

## F0–F7 matrix

| Scenario | Result | Evidence summary |
|---|---|---|
| F0 — exact subject / integration gate | **PASS** | Public `0.11.0` subject used through real Grok project rules, explicit Skill placement, and MCP; integration limitations documented; activation idempotent. |
| F1 — natural short prompt / CLEAN | **PASS** | Durable session `0fec2026…`; Git remained clean; no Change record; durable Closing result was CLEAN. |
| F2 — A → B cross-session carryover | **PASS** | Change A `ceca3ea2…` remained active after B; Closing surfaced A as REMINDER rather than BLOCKER; inherited next action was P3. |
| F3 — resolution | **PASS** | Natural continuation prompt `Làm tiếp phần đang dở` resumed A; A was completed; later Closing no longer reported unfinished A. |
| F4 — real blocker / evidence honesty | **PASS** | Required schema/secrets were absent; the agent did not invent them; work remained blocked and Closing surfaced the blocker. |
| F5 — reviewed consistency rule | **PASS** | Reviewed consistency rule `3d3e3b9d…` was applied; `violationEstablished=false` remained false without observed evidence of a violation. |
| F6 — bounded priority | **PASS** | Four eligible candidates were produced; three were shown; blocker/P0 material evidence was not buried by lower-priority reminders. |
| F7 — full restart / continuation | **PASS** | Fresh run received only `Làm tiếp`; durable handoff/current evidence was re-read; the unresolved blocker remained correctly blocked; no unreviewed inference was promoted to durable truth. |

## Verdict

```text
FINAL_GROK_FIELD_ACCEPTANCE = PASS
CMI_GROK_FIELD_VALIDATED = YES
CMI_PRODUCT_DEFECTS_FROM_GROK_ACCEPTANCE = 0
PATCH_RELEASE_REQUIRED = NO
```

No CMI product defect was established by this run, so no fix PR or `v0.11.1` patch release was required.

The historical final Codex field result is unchanged:

```text
CODEX_S0_S7 = NOT_EXECUTED_RUNTIME_BLOCKED
```

The Grok result must not be rewritten as Codex S0–S7 PASS.

## Evidence limits

This field run supports a bounded claim: the public CMI `v0.11.0` subject completed the defined Grok F0–F7 protocol in the observed environment.

It does **not** establish:

- universal agent compatibility or automatic Skill discovery;
- a universal Grok integration/install path;
- productivity improvement or time savings;
- compiler-grade static/impact analysis;
- statistical sufficiency or causal effectiveness;
- v1 readiness;
- final Codex S0–S7 PASS.

CMI inference remains advisory and is never automatically promoted into reviewed durable project truth.
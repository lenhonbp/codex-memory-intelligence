# Agent OS Verification Matrix

> Fill this matrix for the exact revision and original journey/contract. A local result never implies CI, external/live or release readiness.

## Candidate

- **Revision/build/package:**
- **Original journey or contract:**
- **Target context:** browser/device/viewport/workload, if applicable.
- **Acceptance criteria:**

## Verification levels

| Level | Question | Status | Exact command/journey | Evidence address | Provenance | Residual gaps |
|---|---|---|---|---|---|---|
| Focused/local | Did the changed behavior or contract work? | `verified` / `failed` / `not-run` |  |  | `observed-command` / `reported-verification` |  |
| Repository | Did supported local gates remain healthy? | `verified` / `failed` / `not-run` |  |  |  |  |
| CI | Did remote CI pass for this exact revision? | `verified` / `failed` / `not-observed` |  |  |  |  |
| External/live | Was the actual browser/device/integration/runtime observed? | `verified` / `failed` / `not-required` / `not-observed` |  |  |  |  |
| Release readiness | Does the exact revision meet policy and approval requirements? | `ready` / `not-ready` / `not-assessed` |  |  |  |  |

## Status semantics

`needs-evidence` is a worklist/task status: use it when more evidence is required before deciding or proceeding. `not-enough-evidence` is a claim/evidence classification: use it when the evidence currently available is insufficient or unsafe for the claim. Neither value is a CMI `evidenceType` or provenance value.

Positive example: a pending browser journey may keep the task at `needs-evidence`, while the claim “mobile verification passed” is `not-enough-evidence` until the device journey is observed. Negative example: do not put `needs-evidence` or `not-enough-evidence` in the provenance column, and do not turn a local `verified` status into CI, live or release status.

## Decision boundary

- **Implementation:** `complete` / `partial` / `blocked`
- **Approval:** `observed` / `not-observed` / `not-required`
- **External action:** `not-run` unless separately authorized.
- **Unproven claims:**
- **Next evidence needed:**

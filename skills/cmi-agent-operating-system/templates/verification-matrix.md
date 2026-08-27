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

## Decision boundary

- **Implementation:** `complete` / `partial` / `blocked`
- **Approval:** `observed` / `not-observed` / `not-required`
- **External action:** `not-run` unless separately authorized.
- **Unproven claims:**
- **Next evidence needed:**

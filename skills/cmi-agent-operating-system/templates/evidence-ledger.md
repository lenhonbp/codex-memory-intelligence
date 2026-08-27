# Agent OS Evidence Ledger

> Working artifact for typed evidence. A row without an address is not an established fact. Do not auto-promote rows to durable CMI memory.

## Evidence vocabulary

Use one primary type per row: `fact`, `observation`, `inference`, `historical-correlation`, `recommendation`, `reported-verification`, `observed-command` or `not-enough-evidence`.

## Claim ledger

| Claim ID | Claim | Evidence type | Evidence address | Context/time/revision | Confidence | Review state | Next evidence |
|---|---|---|---|---|---|---|---|
| `E-001` |  |  |  |  |  | `unreviewed` / `reviewed` / `proposed` |  |
| `E-002` |  |  |  |  |  |  |  |

## Diagnosis separation

| Finding ID | Symptom/observation | Cause candidate or inference | Owning boundary | Decisive check | Result | Residual uncertainty |
|---|---|---|---|---|---|---|
| `F-001` |  |  |  |  |  |  |

## Verification provenance

For an `observed-command`, record the exact command, exit code, output/artifact address and observed time. For `reported-verification`, record who or what reported it and do not relabel it as an observed command.

| Verification ID | Level | Status | Exact command/journey | Result source | Evidence address | Observed at | Gaps |
|---|---|---|---|---|---|---|---|
| `V-001` | `focused` / `repository` / `CI` / `external/live` / `release` |  |  | `observed-command` / `reported-verification` / `not-observed` |  |  |  |

## Promotion guardrail

Learning candidates, recommendations, failed hypotheses and fixture results remain proposals until explicit review through the existing CMI contract. A content hash records byte integrity only; it does not establish signature, authenticity or approval.

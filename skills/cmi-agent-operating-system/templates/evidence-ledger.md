# Agent OS Evidence Ledger

> Working artifact for typed evidence. A row without an address is not an established fact. Do not auto-promote rows to durable CMI memory.

## Evidence vocabulary

Use one primary Agent OS classification per row: `fact`, `observation`, `inference`, `historical-correlation`, `recommendation`, `reported-verification`, `observed-command` or `not-enough-evidence`. Keep this classification separate from any CMI-native serialized field or provenance value.

### Agent OS → CMI-native mapping

| Agent OS classification | CMI-native representation | Condition |
|---|---|---|
| `observation` | `observed` | Direct observation with a concrete address. |
| `inference` | `inferred` | Remains a hypothesis; never promote without review evidence. |
| `fact` | `reviewed` | Only after authoritative review is evidenced. |
| `reported-verification` | provenance `reported` | Preserve the source; never relabel as `observed-command`. |
| `observed-command` | observed evidence plus command metadata | Record exact command, exit code, output/artifact address and time. |
| `not-enough-evidence` | No CMI `evidenceType`; claim/evidence gap | Do not place it in an evidence-type field. |
| `needs-evidence` | Worklist/task status | Do not place it in an evidence-type or provenance field. |

Positive example: a reviewed authoritative file can support `fact → reviewed`. Negative example: a user-reported test cannot become `observed-command`, and a missing address cannot become a CMI `evidenceType`.

## Claim ledger

| Claim ID | Claim | Evidence type | Evidence address | Context/time/revision | Confidence | Review state | Next evidence |
|---|---|---|---|---|---|---|---|
| `E-001` |  |  |  |  |  | `unreviewed` / `reviewed` / `proposed` |  |
| `E-002` |  |  |  |  |  |  |  |

**Address guard:** if `Evidence address` is blank, set the row to `not-enough-evidence` or `inference` and add the next probe. Do not serialize the blank row as `reviewed` or `observed`.

## Diagnosis separation

| Finding ID | Symptom/observation | Cause candidate or inference | Owning boundary | Decisive check | Result | Residual uncertainty |
|---|---|---|---|---|---|---|
| `F-001` |  |  |  |  |  |  |

## Verification provenance

For an `observed-command`, record the exact command, exit code, output/artifact address and observed time. For `reported-verification`, record who or what reported it and do not relabel it as an observed command.

| Verification ID | Level | Status | Exact command/journey | Result source | Evidence address | Observed at | Gaps |
|---|---|---|---|---|---|---|---|
| `V-001` | `focused` / `repository` / `CI` / `external/live` / `release` |  |  | `observed-command` / `reported-verification` / `not-observed` |  |  |  |

## Status separation

`needs-evidence` belongs in the task/worklist status, while `not-enough-evidence` belongs in the claim/evidence classification. Neither is a CMI `evidenceType` or provenance value.

## Promotion guardrail

Learning candidates, recommendations, failed hypotheses and fixture results remain proposals until explicit review through the existing CMI contract. A content hash records byte integrity only; it does not establish signature, authenticity or approval.

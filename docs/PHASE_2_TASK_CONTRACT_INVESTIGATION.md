# CMI Engineering Control Plane — Phase 2 Task Contract Architectural Investigation

Status: `READY FOR BOUNDED IMPLEMENTATION`

Investigation revision: `9ef58cc8253f07b2016f8505d395394770aa06c1`

Investigation branch: `feature/phase-2-task-contract-investigation`

## Executive conclusion

CMI has a genuine but bounded architectural gap. It can derive whether a recorded Change has implementation-path evidence and generic verification evidence, but it cannot determine whether that evidence is appropriate for the task's risk and requested behavior.

The smallest coherent solution is a deterministic, read-side Task Contract derived at the existing `Advisor / prepareChangeBrief` seam, then snapshotted inside the existing Change `BEFORE` evidence when a Change starts. No new store, lifecycle, evidence database, LLM call, command runner, or MCP tool is required.

The contract must be treated as an inferred pre-change requirement set, not as user acceptance truth. Missing user acceptance criteria, target environments, release authority, or external evidence remain explicit unknowns. Completion assessment must fail closed when a required evidence kind is absent, reported-only, failed, contradictory, or too weak for the requirement.

## Current repository evidence

### Authoritative current state

- GitHub `main` was independently resolved to `9ef58cc8253f07b2016f8505d395394770aa06c1`.
- The handoff SHA `02405830ad0fe5be6878177eb823c496e86e6cee` exists in history but is not current `main`; three later commits add capability-skill work.
- The checked-out worktree was clean before this investigation.
- `npm test` passed all 522 tests on the current checkout.
- Post-merge CI, CodeQL, live behavior, and release readiness were not independently observed in this work.

### Existing primitives

`src/advisor.js` already owns the correct pre-change seam:

- `prepareChangeBrief(root, query, options)` combines baseline, context, boundaries, impact, memory gaps, risks, verification guidance, assumptions, and provenance.
- `TOPIC_RULES` deterministically classifies concerns such as identity/access, persistence/schema, API contract, asynchronous consistency, UI/rendering, deployment/operations, performance, and security/privacy.
- `buildRisks()` maps those topics to bounded advisory risk records.
- `buildVerification()` maps them to bounded verification guidance.

`src/ambient-intelligence.js` already routes normal requests into the advisor for mutation intent. It is an adapter and should remain a routing layer; it should not own another contract evaluator.

`src/change-intelligence.js` already owns the durable `BEFORE → DURING → AFTER` Change lifecycle:

- `startChangeRecord()` snapshots predicted files, boundaries, risks, verification guidance, assumptions, baseline, and historical evidence.
- `observeChangeRecord()` records observed paths and prediction gaps.
- `completeChangeRecord()` records outcome and caller-supplied verification evidence without executing commands.
- Existing records are runtime-validated and read conservatively.

`src/completion-evidence.js` is the shared pure read-side assessment seam. It already separates:

- actor outcome;
- observed implementation paths;
- verification state/provenance;
- bounded claim state: `supported`, `unverified`, or `contradicted`.

It intentionally does not claim browser/device/live/release acceptance, and currently says that those dimensions are not assessed without a Task Contract.

`src/session-intelligence.js` already consumes `assessCompletionEvidence()` for related completed Changes. It emits `verification-missing`, `verification-failed`, and `verification-incomplete` findings. It must continue to reuse the shared evaluator rather than gaining a second completion policy.

`src/closing-intelligence.js`, findings, handoffs, and session association are downstream consumers. They do not need a new contract lifecycle.

`src/agent-os-adapter.js` already provides the relevant independent verification ladder (`focused`, `repository`, `CI`, `external/live`, `release`) and preserves the difference between reported and observed-command provenance. This is an adapter contract, not a replacement for CMI Change evidence.

## Genuine gap

The current `before.predicted.verification` entries are guidance only. They do not state:

1. which evidence domain is required;
2. whether a check is required or merely recommended;
3. which risk/topic caused the requirement;
4. which unknown target context could invalidate the requirement;
5. how completion should react when a passing unit/command check exists but behavior, environment, live, or release evidence is missing.

As a result, current completion assessment can correctly say “an observed command passed” while remaining unable to distinguish these cases:

- observed unit tests for a UI bug with no browser/behavior evidence;
- successful CI for a production-impacting task with no live/external evidence;
- a mobile-only task with no mobile/environment-specific evidence;
- a migration with no migration compatibility or data-invariant evidence.

The gap is not missing storage of arbitrary task data. It is missing a bounded interpretation of existing task/risk/verification data.

## Proposed seam

```text
normal user request
        ↓
Ambient Intelligence (intent routing)
        ↓
Advisor / prepareChangeBrief
        ↓
deterministic transient Task Contract
        ↓
Change BEFORE snapshot (only when Change tracking starts)
        ↓
execution and observed paths
        ↓
verification evidence with optional evidence kind
        ↓
shared assessCompletionEvidence(record)
        ↓
Session findings / handoff / Closing consumers
```

The contract is derived on demand for a brief. A bounded snapshot belongs in Change `BEFORE` because it records what CMI required before implementation. Without that snapshot, later assessment would recompute historical requirements after heuristics change and could silently alter the meaning of an old completion claim.

The snapshot is evidence attached to an existing Change lifecycle, not a second durable task database. It must not be copied into Session as another canonical contract.

## Minimal transient representation

Use one bounded object, exposed additively as `taskContract` on a ready change brief and optionally snapshotted as `before.taskContract` in a new Change record:

```text
taskContract {
  version
  goal
  taskKind: change | documentation | investigation | unknown
  depth: light | standard | deep
  risk: {
    level: low | medium | high
    topics: inferred topic ids
    evidenceType: inferred
  }
  successCriteria: bounded inferred criteria, each linked to an evidence requirement
  requiredEvidence: bounded requirements
  unknowns: bounded missing task/environment/authority inputs
  assumptions: bounded advisory assumptions
  provenance: deterministic derivation addresses
  policy
}
```

Each `requiredEvidence` item should be small and typed:

```text
{
  id,
  kind: implementation | behavior | environment-specific | external/live | release,
  title,
  guidance,
  required: true,
  source: topic/risk/task-shape rule,
  confidence: low | medium | high
}
```

Do not add fields for actor, approval, device, browser, or acceptance unless the input actually supplies them. The contract should instead place those absent facts in `unknowns` and keep the affected requirement unresolved.

## Required-evidence model

The existing verification record can accept one additive optional `kind` field with the same bounded values as the contract. Legacy records without `kind` remain readable.

Assessment rules:

1. A failed verification or internally contradictory observed command has precedence and yields `verification.state = failed`, preserving the existing `contradicted` behavior for a successful actor claim.
2. An evidence requirement is `missing` when no named verification can be matched.
3. A requirement is `reported` when it has only `provenance=reported`; this is not enough to support the bounded completion claim.
4. A requirement is `observed` only when a matching passing verification has valid observed-command metadata. For legacy untyped evidence, the only safe fallback is the generic `implementation` kind; it must never satisfy behavior, environment, external/live, or release requirements.
5. A requirement is `failed` when its matching evidence failed or contradicted.
6. `claimState=supported` is allowed only when the actor outcome is `succeeded`, no verification contradiction/failure exists, every required evidence item is observed and passing, and the lifecycle is otherwise eligible under the existing bounded Change scope.
7. If the contract is absent, preserve the current assessment semantics exactly. This is required for legacy Change records and malformed/sparse history.

This is not a generic policy engine. It evaluates only the bounded requirements present in one pre-change contract and does not execute, schedule, authorize, or select commands.

## Evidence domains

The domains deliberately complement, rather than replace, the Agent OS verification ladder:

| Contract kind | Question it answers | Typical evidence | What it does not prove |
|---|---|---|---|
| `implementation` | Was the changed implementation checked? | focused test, typecheck, build, static check | user behavior or production behavior |
| `behavior` | Does the requested behavior/contract work? | replayed journey, API/integration test, browser observation | all environments or release approval |
| `environment-specific` | Does it work in the named device/runtime/context? | mobile/device/browser/OS/config-specific run | production/live behavior unless that is the target |
| `external/live` | Was the real external/runtime integration observed? | live smoke, third-party or deployed environment evidence | release authorization |
| `release` | Were release conditions checked for the exact target? | release gate/readiness evidence and explicit authority | permission to publish/deploy by itself |

The contract can require a domain without pretending the current record contains that evidence. `not-observed`/`not-assessed` remains the honest result.

## Risk adaptation

Use existing deterministic topic classification and bounded structural signals:

- `light`: documentation-only, investigation-only, or low-signal local task. Avoid behavior/live/release requirements; retain explicit unknowns.
- `standard`: ordinary implementation, API, UI, async, or performance task. Require implementation evidence; add behavior evidence when the task changes a contract or user-visible behavior.
- `deep`: identity/access, security/privacy, persistence/schema, deployment/operations, payment/financial terms, explicit production/release language, or a cross-boundary/high-risk task. Require implementation plus the specific behavior/environment/live/release evidence implied by the topic.

Task shape must remain conservative. “Fix login” can infer identity/access risk and behavior evidence, but it cannot invent exact acceptance cases, identity provider, platform, or authority. “Fix mobile UI” can require behavior plus environment-specific evidence, but it cannot claim a device was tested. “Deploy to production” can require external/live and release evidence, but it cannot authorize deployment.

## Completion Evidence integration

Extend `assessCompletionEvidence(record)` only. The evaluator should:

- read `record.before.taskContract` when present;
- preserve all current `implementation`, `verification`, `lifecycle`, `claim`, `reasons`, and `gaps` fields;
- add a bounded `requiredEvidence` projection containing requirement states and matched verification names;
- add a gap when a required item is missing, reported-only, incomplete, failed, or contradictory;
- keep actor outcome unchanged even when CMI assesses the claim as contradicted;
- keep `supported` bounded to the existing evidence semantics, now additionally gated by all required contract items.

Session should continue calling this shared result. It may enrich the existing `verification-incomplete` finding detail when required evidence is missing, but it must not implement another evaluator.

## Persistence decision

Transient:

- derived task kind, risk/depth, unknowns, assumptions, inferred criteria, and required evidence before a Change starts;
- current read-side assessment and requirement-state projection;
- all recommendations and next actions.

Existing Change `BEFORE` snapshot:

- bounded `taskContract` only, because it records the pre-change required-evidence interpretation needed to assess the later `AFTER` claim.

Not allowed:

- `TaskContractStore`;
- independent evidence records or database;
- automatic memory promotion;
- copying the contract into a new Session/Closing lifecycle;
- rewriting old records to add a contract.

The new field must be optional and additive. Legacy records remain readable and follow current generic completion semantics.

## CLI/MCP impact

Prefer existing surfaces:

- `cmi prepare --json` exposes the derived `taskContract`.
- `cmi change start` snapshots it in the existing `BEFORE` record.
- `cmi change complete` preserves the existing `--verify` syntax and may accept an additive, documented kind prefix only if a stable unambiguous syntax is chosen; untyped legacy checks remain implementation-only for contract matching.
- MCP `prepare_change_brief` already returns the brief; its result gains the additive contract.
- MCP `complete_change_record` already accepts verification objects; add optional `kind` to the existing verification schema.
- No new MCP tool is justified.

If CLI syntax for typed verification cannot be made unambiguous without breaking existing `name=status` parsing, leave CLI verification kind untyped in the first tranche and use the existing MCP object surface for explicit kinds. Do not silently parse arbitrary verification names as authoritative behavior or live evidence.

## Performance and operational cost

Expected cost is bounded and local:

- no additional Git, filesystem, network, or LLM call beyond the existing `prepareChangeBrief()` work;
- one deterministic pass over already classified topics, boundaries, and brief context;
- a bounded in-memory assessment over at most the existing 20 verification records and a small contract list;
- one small additive JSON field in new Change `BEFORE` records.

No command execution, browser control, network lookup, or external service is introduced.

## Backward compatibility

- Keep change-record `schemaVersion=1`; the contract field is optional additive evidence, not a new lifecycle/schema generation.
- Existing `before` objects without `taskContract` remain valid and assessed using current rules.
- Existing verification objects without `kind` remain valid; their safe contract interpretation is generic implementation evidence only when they have valid observed-command metadata.
- Preserve actor outcome, verification provenance, sparse records, invalid-record handling, and fail-closed command contradiction behavior.
- Keep CLI/MCP error envelopes, write gates, and read-only defaults unchanged.
- Update the JSON schema and runtime validation only for bounded optional additions; do not add migration or rewrite logic.

## Security and trust boundaries

- The task contract is inferred advisory data, never authorization.
- User/agent-supplied `kind`, status, command metadata, and evidence address remain untrusted caller evidence.
- Reported verification never becomes observed-command.
- A non-zero observed command cannot support a passing claim, regardless of ordering or another passing record.
- Required evidence missing or unobserved keeps a successful claim `unverified`; unsupported evidence never becomes `supported` by optimism.
- Release/deployment requirements do not authorize release/deployment.
- No command, browser action, migration, network call, memory write, or external side effect is run by CMI.

## Alternatives rejected

### New `TaskContractStore`

Rejected. The contract is derived from Advisor input and must be snapshotted only as pre-change evidence in the existing Change record. A store would create a competing durable lifecycle and reconciliation problem.

### New evidence database

Rejected. Existing Change verification records already carry bounded evidence. The gap is classification and matching, not missing storage.

### Generic orchestration engine or Challenger

Rejected. The product need is a narrow required-evidence assessment, not a second runtime or policy framework. Generic challenge behavior would inflate scope and blur authority.

### New lifecycle

Rejected. Session and Change lifecycles are already independent and sufficient.

### Automatic verification runner

Rejected. It would expand authority and trust risk. The external agent runs authorized checks; CMI records and assesses supplied evidence only.

### Replacing existing verification guidance

Rejected. Extend the existing guidance with bounded requirement metadata. Existing human-readable verification text, CLI, MCP, and historical records should remain useful.

## Falsification review

The design was challenged against the required cases:

| Counterexample | Contract response | Remaining limitation |
|---|---|---|
| Simple documentation edit | `taskKind=documentation`, `depth=light`; no fabricated browser/live requirement; implementation evidence is not required as code behavior | Exact editorial acceptance still needs user/reviewer input |
| UI bug needing browser evidence | UI topic adds behavior requirement; browser/mobile signal adds environment-specific requirement | CMI cannot observe a browser unless the agent supplies valid evidence |
| Mobile-only bug | Mobile/device/platform signal adds environment-specific requirement and unknown target context | “Mobile” does not identify iOS/Android/device/version without input |
| Database migration | Persistence topic yields deep contract with implementation and behavior/data-invariant evidence | Actual migration safety remains unobserved until the agent runs checks |
| Authentication/security change | Identity/security topics yield deep contract and behavior/security validation evidence | Exact provider, threat model, and authorization boundary remain unknown unless supplied |
| Performance regression | Performance topic requires a representative benchmark/budget evidence item | A benchmark name alone is not a measured budget or pass |
| Task with no code modification | Investigation/documentation task kind can have no implementation requirement; observed read-only scope remains separate | Intent can be ambiguous from a short request |
| Partial implementation | Change remains `active`; missing required evidence is surfaced without terminalizing lifecycle | CMI cannot determine whether the actor intentionally paused beyond supplied outcome |
| Reported test result only | Requirement state is `reported`; successful claim remains `unverified` | Reported evidence remains useful context but not independent support |
| Observed unit tests, missing browser validation | Implementation requirement may be observed; behavior requirement remains missing, so claim is `unverified` | Browser evidence must be supplied by the external agent |
| Successful CI, missing external/live evidence | CI cannot satisfy `external/live` or `release`; claim remains `unverified` | CMI does not query hosted CI/live systems |

The design survives these cases without adding a store or a second evaluator. The main residual risk is heuristic task/risk classification. That risk is explicitly represented as inference, confidence, and unknowns; it must not be hidden as user acceptance truth.

## Smallest recommended implementation tranche

1. Add a pure deterministic contract builder at the Advisor seam and expose it additively on ready `prepareChangeBrief()` results.
2. Snapshot the bounded contract into `before.taskContract` from `startChangeRecord()`; add optional runtime/schema validation while preserving schema version 1 and legacy reads.
3. Add optional verification `kind` to Change completion input, MCP schema, and the human formatter; preserve existing CLI syntax unless typed CLI syntax is proven unambiguous.
4. Extend `assessCompletionEvidence()` with the shared required-evidence projection and fail-closed claim gating.
5. Have Session consume the shared gap projection through its existing verification findings.
6. Add focused tests for all falsification cases, legacy records, untyped evidence, reported evidence, command contradictions, and persistence non-mutation.

## Exact acceptance criteria

- `prepareChangeBrief()` returns a bounded, deterministic `taskContract` with explicit task kind, depth, risk, inferred success criteria, required evidence, unknowns, assumptions, provenance, and policy.
- Simple documentation/investigation tasks do not receive fabricated behavior/live/release requirements.
- UI/mobile, persistence, identity/security, performance, and deployment/release tasks receive the corresponding typed required-evidence items.
- `startChangeRecord()` snapshots the contract under existing `before` evidence; no new store or lifecycle is created.
- Existing records without `before.taskContract` remain readable and preserve current completion semantics.
- Verification objects accept optional bounded `kind`; legacy untyped records remain readable and cannot satisfy behavior/environment/live/release requirements by accident.
- A successful Change with only reported evidence remains `unverified`.
- A successful Change with observed implementation evidence but missing required behavior/environment/live/release evidence remains `unverified`.
- Any failed or contradictory verification remains `contradicted` for a successful actor claim, regardless of ordering.
- A successful Change becomes `supported` only when every required contract item has matching valid passing observed-command evidence.
- Session uses the shared assessment and does not contain a duplicate evaluator.
- `npm test`, `npm run verify`, package smoke, diff checks, and focused falsification tests pass after implementation.
- No command execution, network call, external action, publish, deploy, tag, merge, or release is introduced.

## Decision

`READY FOR BOUNDED IMPLEMENTATION`

The Phase 2 design is sufficiently evidenced for the tranche above. Implementation should begin only on this feature branch, with the contract field optional, its semantics versioned/documented, and the existing evidence/lifecycle boundaries preserved.

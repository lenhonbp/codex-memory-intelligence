# CMI Agent Operating System Contract

**Status:** Incremental contract layer; no native Skill loader or new CMI Core runtime.
**Scope:** Codex, Manus and other coding-agent adapters that use CMI.
**Evidence policy:** This contract promotes only the evidence-strong workflow rules from the current synthesis. Domain-specific and provisional practices remain bounded adapters or evaluation candidates.

## 1. Purpose and non-goals

This document defines a small operating contract for agents working over the existing Codex Memory Intelligence (CMI) surfaces. It standardizes orientation, observation, evidence capture, diagnosis, prioritization, implementation, verification, recovery, reflection and handoff without creating a second memory or lifecycle system.

CMI remains authoritative for project memory, evidence/provenance, graph, Session Intelligence, Change Intelligence, findings, handoff, MCP/CLI and trust/lifecycle contracts. This operating layer does not replace those surfaces and does not independently certify their results.

The contract does **not** create a native Skill runtime, registry, discovery engine or automatic activation path. A packaged `SKILL.md` remains a portable workflow artifact. Runtime discovery and invocation are external adapter concerns.

## 2. Evidence vocabulary

| Label | Meaning | Required handling |
|---|---|---|
| `fact` | Reviewed information supported by an authoritative project source. | Include an evidence address. |
| `observation` | Directly seen in a file, UI, runtime, command result or artifact. | Record context and timestamp where relevant. |
| `inference` | A provisional explanation derived from observations. | Keep separate from durable truth and label uncertainty. |
| `historical-correlation` | Co-occurrence in history, such as co-change. | Never describe it as causality or ownership without additional evidence. |
| `recommendation` | Suggested action derived from evidence and risk/impact/effort. | It is not authorization or current priority by itself. |
| `reported-verification` | A result supplied by a user or another agent without independently observed command metadata. | Preserve the reported label. |
| `observed-command` | A command actually run with observed output/exit result. | Record command, exit code and observed time. |
| `not-enough-evidence` | The evidence needed for a claim is absent or not safe to infer. | Report the gap instead of manufacturing certainty. |

Every important claim must have an **evidence address**: file/line, commit, Session/Change ID, screenshot/frame, URL, command output or artifact hash. A claim without an address is a hypothesis or an explicit evidence gap, not an established fact.

### 2.1. Agent OS → CMI-native vocabulary mapping

Agent OS classification and CMI-native serialization are two distinct layers. The mapping below describes how an existing CMI surface may represent a reviewed value or provenance; it does not create a serializer, schema, lifecycle engine or new evidence type.

| Agent OS label | CMI-native representation | Condition |
|---|---|---|
| `observation` | `observed` | Only when the data was directly observed in the relevant source, runtime, command or artifact. |
| `inference` | `inferred` | Always remains an inference; it must not be serialized or presented as `fact` without review evidence. |
| `fact` | `reviewed` | Only after review against an authoritative source is itself evidenced. An unreviewed fact candidate is not `reviewed`. |
| `reported-verification` | provenance `reported` | Preserve that the result was supplied by a user or another agent; do not call it an observed command. |
| `observed-command` | observed evidence plus command metadata | Record the exact command, exit code, output/artifact address and observed time. |
| `not-enough-evidence` | No CMI `evidenceType`; claim/evidence state or evidence gap | It describes insufficiency of current evidence, not a serialized evidence type. Record the missing evidence and next probe. |
| `needs-evidence` | Worklist/task status | It means the task or decision needs more evidence before proceeding; it is not an evidence type or provenance value. |

Positive example: a command output directly read at a known revision may be classified as Agent OS `observation` and represented on an existing CMI surface as `observed`, with the command metadata retained. A reviewed authoritative document may support Agent OS `fact` and only then be represented as `reviewed`.

Negative example: a user-reported test result must remain `reported-verification` with provenance `reported`; it must not be serialized as `observed-command`. A claim with no evidence address must remain `not-enough-evidence` or an explicitly labeled `inference`; it must not be sent as a CMI `evidenceType`. A work item waiting for a browser run may be `needs-evidence`, but that status must not be recorded as evidence provenance.

The Agent OS layer must not simply replace every Agent OS term with a CMI enum. Use the CMI-native representation only through an existing CMI surface and only when its condition is met. No new CMI serializer or integration is introduced by this contract.

## 3. Core operating loop

```text
Orient
  → Observe
  → Capture Evidence
  → Diagnose
  → Prioritize
  → Implement
  → Verify
  → Reflect
  → Handoff
```

| Phase | Required behavior | Exit evidence | Failure boundary |
|---|---|---|---|
| **Orient** | State goal, actor, scope, non-goals, constraints, source of truth, acceptance criteria and authority. | A brief another agent can use to identify done/not-done. | Ask when a material product/architecture choice, authority or external side effect is unresolved. |
| **Observe** | Inspect current repository/runtime/UI/build state; establish baseline and reproduction/journey. | Revision, environment, path/journey, command or capture. | Missing or unsafe evidence leaves the work item at `needs-evidence`; do not invent a baseline or serialize the gap as a CMI evidence type. |
| **Capture Evidence** | Separate facts, observations, inferences, recommendations and verification provenance. | Evidence ledger with type, address, confidence and time. | Conflicting evidence remains competing hypotheses. |
| **Diagnose** | Separate symptom from cause candidates; inspect ownership boundary; choose the smallest decisive check. | Finding with hypothesis, decisive check and confidence. | Unproved root cause stays uncertain and may be deferred. |
| **Prioritize** | Order by impact, confidence, safety risk, effort, reversibility and dependency. | Selected, deferred, rejected or needs-evidence worklist with rationale. | Severity or historical priority does not authorize work. |
| **Implement** | Make the smallest coherent change at the owning boundary; preserve contracts and add regression evidence. | Diff, affected paths, decision record and updated tests/artifacts. | No unrelated cleanup, core rewrite, loader or external action. |
| **Verify** | Replay the original journey/contract, then run proportional local gates; keep CI/live/release separate. | Verification matrix with observed results and residual gaps. | Local result never becomes CI/live/release proof. |
| **Reflect** | Record proved, disproved, unknown, unexpected impact and learning candidates. | Outcome and reviewable follow-up; no automatic memory promotion. | Inference and failed checks remain proposals. |
| **Handoff** | Report objective, accomplishments, decisions, verification layers, active changes, findings, blockers, next actions and guardrails. | Truthful handoff linked to exact revision and evidence. | Partial work remains partial; missing authority is escalated. |

## 4. Mandatory core policies

### AOS-ORIENT-001 — Define goal, scope and authorization boundary

Before mutation, state the user outcome, actor, affected surface, non-goals, constraints, acceptance criteria, authority and stop conditions. If a read-only probe can reduce uncertainty safely, perform it before asking. Ask at a real boundary: material product or architecture choice, missing authority/credential, destructive or external action, contradictory evidence or scope expansion.

### AOS-OBSERVE-001 — Observe before edit

Read the relevant source of truth, inspect repository/runtime state and establish a baseline before substantive changes. The baseline should include the current revision and, where applicable, reproduction path, target viewport/device, command output or runtime capture. A filename, warning, recommendation or after-state screenshot is not a substitute for observation.

### AOS-EVIDENCE-001 — Attach evidence addresses to claims

Claims about implementation, quality, security, performance, verification, release or handoff require an evidence address and a provenance label. Preserve `reported-verification` versus `observed-command`. Do not turn co-change into causality, local pass into live pass, fixture accuracy into general accuracy or a content hash into a cryptographic signature.

### AOS-DIAGNOSE-001 — Diagnose root cause before symptom

For a failure or friction, record the symptom, reproduction, competing cause candidates, owning boundary and decisive check. Make the smallest correction that addresses the supported cause. If the cause remains unproven, report the hypothesis and evidence gap rather than claiming certainty.

### AOS-IMPLEMENT-001 — Implement the smallest coherent change

Change only the boundary needed by the acceptance criteria. Preserve existing public contracts and evidence semantics. Add or update the narrow regression evidence needed to protect the behavior. Do not rewrite CMI Core, create competing memory/graph/lifecycle stores, add a native Skill loader or introduce external side effects without a reviewed product gap and authorization.

### AOS-VERIFY-001 — Verify through the original journey or contract

Replay the original journey, input, contract, target context, workload or release condition. Run the narrowest decisive check first and then proportional repository gates. Report focused, repository, CI, external/live and release states separately. An unavailable environment is `not-observed` or blocked, not a pass.

### AOS-HANDOFF-001 — Report completion with explicit gaps

A completion report must distinguish implementation status from focused verification, repository verification, CI, external/live verification and release readiness. Include exact revision, actual lifecycle IDs when available, active work, open findings, gaps, ownership and next actions. Never fabricate IDs, results, approvals or certification language.

## 5. Recovery and lifecycle rules

### AOS-RECOVERY-001 — Recover from failure with new evidence

After a meaningful failure, record the exact command or behavior, decisive output, disproved assumption, revised hypothesis, smallest correction and next narrow check. Every retry must change evidence, hypothesis or correction. If the issue cannot be resolved safely, contain it with a clear workaround or report `partial`/`blocked` with an owner and next action.

A useful recovery chain is:

```text
failure
  → inspect exact evidence
  → identify false assumption
  → update checklist
  → smallest correction
  → narrow decisive check
  → broader regression
```

### Lifecycle independence

CMI Session, Change, findings, memory and handoff retain separate ownership. Closing a Session does not complete a Change. A partial or review-pending Change remains active. A CMI write permission is not permission to edit project source, run arbitrary commands, publish, deploy or change business priority. Learning candidates remain proposals until explicit authorized review promotes them into durable memory.

## 6. Verification ladder

| Level | Question | Allowed claim |
|---|---|---|
| Focused | Did the changed behavior or contract work? | `verified`, `failed` or `not-run`. |
| Repository | Did supported local gates remain healthy? | `verified`, `failed` or `not-run`. |
| CI | Did remote CI pass for the exact revision? | `verified`, `failed` or `not-observed`. |
| External/live | Was the real browser/device/integration/runtime observed? | `verified`, `failed`, `not-required` or `not-observed`. |
| Release | Does the exact revision meet release policy and approval requirements? | `ready`, `not-ready` or `not-assessed`. |

A local check does not imply CI, external/live or release readiness. A screenshot does not imply complete animation or user acceptance. A package or tag does not imply authorization to publish.

## 7. CMI mapping and adapter boundary

| Concern | Use existing CMI surface | Agent OS responsibility |
|---|---|---|
| Context and baseline | Ambient/context, status, doctor, pre-change intelligence | Orient and record the current baseline; do not reimplement ranking. |
| Implementation tracking | Change Intelligence `BEFORE → DURING → AFTER` | Invoke existing lifecycle when Change tracking is in scope; keep partial active. |
| Work-session history | Session start/observe/close/handoff | Keep Session independent from Change and use real IDs only. |
| Findings and audit | Findings, evidence anchors, Closing Intelligence | Record typed findings and gaps; do not auto-resolve or re-rank authority. |
| Durable memory | Reviewed CMI memory interface | Keep learning candidates as proposals; never auto-remember inference. |
| Runtime execution | External agent/runtime adapter | Run only authorized commands and store actual evidence; CMI does not execute arbitrary verification. |
| Skill distribution | Open-format `SKILL.md` under `skills/` | Document portable invocation; do not claim package installation activates or discovers Skills. |

## 8. Promotion policy

Only patterns with repeated cross-session evidence or a direct, reviewed, non-contradictory outcome may be promoted to core policy. Current core policies are bounded workflow disciplines, not proof of hidden Manus reasoning. Game motion, playtest, visual polish, browser/mobile, performance and other domain semantics remain in Domain Skills or evaluation fixtures until additional evidence is available.

A future core change requires a demonstrated product gap that cannot be handled by documentation or a thin adapter, a failing contract or repeated regression, a reviewed smallest change, compatibility coverage and an explicit migration note. Until then, the correct action is to leave `src/**`, CMI schemas, CLI, MCP and lifecycle behavior unchanged.

## 9. Completion template

```markdown
## Handoff

### Objective
Goal, scope and non-goals.

### Accomplished
Observed facts and completed artifacts, each with an evidence address.

### Decisions
Decision, alternatives, reason and confidence.

### Verification
- Focused:
- Repository:
- CI:
- External/live:
- Release readiness:

### Open findings and blockers
Finding, state, impact, confidence and evidence.

### Active changes
Actual Change ID and current lifecycle, if used.

### Next actions
Action, reason, evidence needed and owner/authority.

### Guardrails
No fabricated IDs/results; no auto-memory; no partial Change terminalization; no unobserved CI/live/release claims.
```

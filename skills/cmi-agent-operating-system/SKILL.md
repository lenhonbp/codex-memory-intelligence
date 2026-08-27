---
name: cmi-agent-operating-system
description: Apply the CMI Agent Operating System contract for substantive work: orient with explicit goal, scope and authorization boundaries; observe before editing; capture typed evidence; diagnose before symptom fixes; prioritize explicitly; implement the smallest coherent change; verify the original journey or contract; recover with new evidence; reflect and hand off truthfully. Thin policy/orchestration adapter only; it does not implement memory, graph, Session, Change, evidence lifecycle, a Skill loader, automatic discovery, write-mode enablement, deployment, publishing or external side effects. Use when a coding agent needs the reusable cross-domain operating contract or a phase gate.
---

# Skill: cmi-agent-operating-system

## 1. Name and purpose

This Skill applies the portable CMI Agent Operating System contract to substantive work by coordinating the following loop:

```text
Orient → Observe → Capture Evidence → Diagnose → Prioritize
→ Implement → Verify → Reflect → Handoff
```

It is a **thin policy/orchestration adapter** over existing CMI surfaces. It does not implement CMI memory, graph, Session, Change, evidence lifecycle, findings, handoff or trust behavior. CMI remains authoritative for project memory, graph, evidence/provenance, Session Intelligence, Change Intelligence, findings, handoff, trust and lifecycle contracts. This Skill does not independently certify those surfaces.

## 2. Appropriate triggers

Use this Skill when the user requests substantive repository, product, UX, game, schema, audit, verification or release-preparation work; when the task has multiple phases or meaningful risk; when evidence-backed handoff is needed; or when a failure requires an explicit evidence → diagnosis → recovery loop.

The Skill may be selected by an external agent runtime or a human operator. Selection is not automatic proof of activation, and this file does not change runtime discovery behavior. It does not create a native Skill runtime, registry, discovery engine or automatic activation path.

## 3. Non-triggers

Do not invoke this as ceremony for a simple read-only answer with no material claim, mutation, lifecycle state or handoff requirement. Do not use it instead of a domain-specific runnable journey, an existing CMI lifecycle surface or the repository's `AGENTS.md` contract. Do not use a recommendation, historical priority or checklist entry as authorization.

## 4. Non-goals

This Skill does not:

- rewrite CMI Core or alter CMI memory, graph, Session, Change, findings, evidence or handoff implementations;
- create a competing memory, graph, evidence or lifecycle store;
- create a native Skill loader, registry, automatic discovery or activation engine;
- automatically enable write mode or silently bypass an available MCP write boundary with CLI;
- automatically write inference, recommendations, fixture results or hypotheses to durable memory;
- provide a game engine, playtest study, UX research protocol, browser/device lab, performance benchmark or release approval system;
- publish, deploy, push, submit, approve or create another external side effect.

Domain-specific game, playtest, visual, UX, browser/mobile and performance semantics remain bounded to their domain Skills or evaluation fixtures until independent evidence supports promotion.

## 5. Required inputs

Before substantive mutation, gather the following inputs or mark the missing item explicitly:

| Input | Minimum content |
|---|---|
| User outcome | Goal, actor/user and affected surface. |
| Scope | In-scope work, non-goals, constraints and stop conditions. |
| Source of truth | Authoritative file, contract, CMI surface, runtime, build or user-provided requirement. |
| Acceptance | Observable success criteria and original journey/contract to replay. |
| Authority | Allowed actions, write-mode state, approval owner and external-action boundary. |
| Baseline | Revision/status, environment, reproduction path, runtime/UI/build state and target context. |
| Evidence plan | Evidence types, addresses, confidence and reviewer state. |
| Verification plan | Focused, repository, CI, external/live and release checks to run or mark unavailable. |
| Handoff target | Recipient, active Session/Change state, findings, blockers and next actions. |

If an input is unavailable, use `needs-evidence`, `not-observed`, `not-enough-evidence`, `partial` or `blocked` as appropriate. Do not infer a missing authority, runtime result or acceptance criterion.

## 6. Authority and authorization boundary

CMI write permission, a recommendation, a historical P0/P1 label, a high-severity finding, a package, a tag or a local test does not independently authorize source edits, arbitrary commands, memory promotion, publish, deploy, push, submit or release approval.

Separate the gates:

```text
understand → prepare → implement → verify → approve → publish/deploy
```

This Skill coordinates understand/prepare/implement/verify and reports the approval boundary. Approval and external action require explicit authority outside this Skill. Do not publish, deploy, push, submit or create external side effects without explicit authorization. When a material product or architecture choice, credential, destructive operation, contradictory evidence or scope expansion is unresolved, perform a safe read-only probe if possible; otherwise ask the user.

## 7. Core operating loop

The loop is a sequence of evidence gates, not a new runtime state machine. Use the phase rules in the next section and the minimal templates under [`templates/`](./templates/). These templates are open-format working artifacts; they do not create durable state, a loader or a lifecycle owner.

## 8. Evidence vocabulary

Every important claim about implementation, quality, security, performance, verification, release or handoff needs an evidence address: file/line, commit, actual Session/Change ID, URL, command output, screenshot/frame, runtime record or artifact hash.

| Label | Meaning | Handling |
|---|---|---|
| `fact` | Reviewed information supported by an authoritative project source. | Include the source address. |
| `observation` | Directly seen in a file, UI, runtime, command result or artifact. | Record context and time where relevant. |
| `inference` | Provisional explanation derived from observations. | Keep uncertain and separate from durable truth. |
| `historical-correlation` | Co-occurrence in history, such as co-change. | Never describe it as causality or ownership alone. |
| `recommendation` | Suggested action derived from evidence and trade-offs. | It is not authorization or current priority by itself. |
| `reported-verification` | Result supplied by a user or another agent without independently observed command metadata. | Preserve the reported provenance. |
| `observed-command` | Command actually run with observed output and exit result. | Record exact command, exit code and time. |
| `not-enough-evidence` | Required evidence is absent or unsafe to infer. | Report the gap and next evidence needed. |

A content hash supports integrity of identified bytes; it is not an agent signature or authenticity claim without a signing/key contract.

## 9. Phase-by-phase rules

### Orient

Write the user outcome, actor, affected surface, in-scope work, non-goals, constraints, source of truth, acceptance criteria, authority, open questions and stop conditions. Use [`orientation-checklist.md`](./templates/orientation-checklist.md). A prompt's brevity does not reduce task complexity.

### Observe

Inspect the relevant repository, runtime, UI, build, device or artifact state before substantive editing. Record revision, environment, source-of-truth path, reproduction or original journey, baseline command and target context. An after-state screenshot, filename, warning or recommendation is not a baseline.

### Capture Evidence

Use [`evidence-ledger.md`](./templates/evidence-ledger.md) to attach type, address, context/time, confidence and review state to each material claim. Keep reported verification separate from an observed command, and keep observations separate from inference and recommendation. Conflicting evidence remains competing hypotheses until a decisive check resolves it.

### Diagnose

Separate symptom, reproduction, cause candidates, owning boundary, decisive check, confidence and unexpected impact. Choose the smallest check that can distinguish the candidates. If root cause remains unproved, keep the hypothesis and evidence gap explicit rather than applying a random CSS, timing, threshold, schema or unrelated-layer patch.

### Prioritize

Order selected work using user/business impact, evidence confidence, safety risk, effort, reversibility and dependency. Record selected, deferred, rejected and `needs-evidence` items with rationale. Severity and historical recommendation are inputs, not authorization. Do not promote provisional or domain-specific patterns into core policy.

### Implement

Make the smallest coherent change at the owning boundary. Preserve public contracts, working behavior and CMI evidence semantics. Add the focused regression or artifact validation needed by the acceptance criteria. Do not rewrite CMI Core, create a competing store/loader, broaden scope or introduce an external action.

### Verify

Use [`verification-matrix.md`](./templates/verification-matrix.md). Replay the original journey, input, contract, target context, workload or release condition. Run the narrowest decisive check first, then proportional repository gates. Keep local/focused, repository, CI, external/live and release readiness as separate statuses. Unavailable environments are `not-observed`, `not-run`, `not-required`, `not-assessed` or blocked as appropriate.

### Reflect

Record proved, disproved, unknown, unexpected impact, residual risk and learning candidates. A learning candidate remains a proposal until explicit review through the existing CMI contract. Do not automatically call memory mutation surfaces from inference, recommendation, fixture outcome or checklist hypothesis.

### Handoff

Use [`truthful-handoff.md`](./templates/truthful-handoff.md). Report objective, accomplished artifacts, decisions and confidence, exact revision, evidence addresses, verification by level, active Session/Change state, open findings, blockers, next actions and guardrails. Use actual CMI IDs only when observed. Session closure does not complete a partial Change.

## 10. CMI surface mapping

| Need | Existing CMI surface | Agent OS adapter boundary |
|---|---|---|
| Context and baseline | Ambient/context, status, doctor and pre-change intelligence | Read selectively and record the observed baseline; do not reimplement ranking. |
| Implementation tracking | Change Intelligence `BEFORE → DURING → AFTER` | Use the existing lifecycle when in scope; keep partial/review-pending Change active. |
| Work-session history | Session start/observe/close/handoff | Keep Session independent from Change and use actual IDs only. |
| Findings and audit | Findings, evidence anchors and Closing Intelligence | Record typed findings/gaps; do not auto-resolve or re-rank authority. |
| Durable memory | Reviewed CMI memory interface | Keep learning candidates as proposals; never auto-remember inference. |
| Runtime execution | External agent/runtime | Run only authorized commands and store actual evidence. |
| Skill distribution | Open-format `skills/*/SKILL.md` | Document portable invocation; package distribution does not activate or discover Skills. |
| Trust/provenance | CMI Provenance Mark and Operational Trust | Use observed lifecycle/provenance; do not fabricate IDs, signatures or certification. |

## 11. Verification ladder

Use the following statuses independently:

| Level | Question | Allowed status |
|---|---|---|
| Focused/local | Did the changed behavior or contract work? | `verified`, `failed`, `not-run` |
| Repository | Did supported local gates remain healthy? | `verified`, `failed`, `not-run` |
| CI | Did remote CI pass for this exact revision? | `verified`, `failed`, `not-observed` |
| External/live | Was the actual browser/device/integration/runtime observed? | `verified`, `failed`, `not-required`, `not-observed` |
| Release readiness | Does the exact revision meet policy and approval requirements? | `ready`, `not-ready`, `not-assessed` |

A local check does not imply CI, external/live or release readiness. A desktop check does not imply mobile verification. A static screenshot does not prove complete animation, accessibility, user acceptance or temporal fidelity. A package or tag does not imply release authorization.

## 12. Failure and recovery behavior

After a meaningful failure, update the live checklist before the next patch and record the exact command/behavior, decisive output, disproved assumption, revised hypothesis, smallest correction and next narrow check. Follow:

```text
failure → inspect exact evidence → identify false assumption
→ update checklist → smallest correction → narrow decisive check
→ broader regression
```

Every retry must change evidence, hypothesis or correction. Do not delete a failing test, relax a threshold without rationale, rerun blindly or hide a blocker. If the issue cannot be resolved safely, contain it with a workaround or report `partial`/`blocked` with owner, evidence gap and next action.

## 13. Completion criteria

A compliant completion has all of the following:

1. The requested scope is either complete or explicitly marked `partial`/`blocked` with residual work.
2. Material claims have evidence addresses or explicit `inference`/`not-enough-evidence` labels.
3. The original journey or contract was replayed, or its absence is reported.
4. Focused/local and repository verification are reported separately from CI, external/live and release readiness.
5. Active Session/Change lifecycle is reported using actual observed IDs; partial Change is not terminalized by session closure.
6. No inference or recommendation was automatically promoted to durable memory.
7. No unsupported domain policy was promoted to core.
8. Handoff contains decisions, findings, blockers, next actions and guardrails.

## 14. Handoff template

Copy [`truthful-handoff.md`](./templates/truthful-handoff.md) and replace placeholders. At minimum, include:

```markdown
## Handoff

### Objective

### Files/artifacts changed

### Accomplished and evidence addresses

### Decisions and confidence

### Verification
- Focused/local:
- Repository:
- CI:
- External/live:
- Release readiness:

### Active Session/Change state

### Open findings, blockers and evidence gaps

### Next actions and owner/authority

### Guardrails and unproven claims
```

## 15. Short usage example

For a requested bug fix, first use `orientation-checklist.md` to record the goal, non-goals, baseline command, acceptance and authority. Observe `git status` and the reproduction before editing. Put the observed failure and a root-cause hypothesis in `evidence-ledger.md`, make one smallest correction, run the focused regression, then run repository gates. Fill `verification-matrix.md` with local/repository results and mark CI/live/release as `not-observed` unless they were actually observed. Finish with `truthful-handoff.md`, preserving any partial Change and listing the next action.

This example describes the contract; it does not claim that a command, test, Session or Change was run by this Skill.

## 16. Claims prohibited without evidence

The agent must not claim any of the following without the corresponding evidence address and provenance:

- that a recommendation, severity, historical P0/P1 or checklist item authorized work;
- that a local/focused result is a repository, CI, external/live, mobile or release result;
- that a screenshot proves full animation, temporal fidelity, accessibility, comprehension, fun, balance, performance or user acceptance;
- that code inspection proves optimization, smoothness, security, adoption or production readiness;
- that a reported verification was an observed command;
- that co-change proves causality or ownership;
- that a content hash is an agent signature, authentication, approval or certification;
- that a fixture result proves general agent accuracy or universal Manus behavior;
- that a Session close completes a Change;
- that CMI, this Skill or package installation automatically discovers, activates or executes Skills;
- that CI, external/live behavior, approval, publish, deploy, push or release certification occurred when it was not observed.

## Relationship and runtime boundary

This Skill composes with `cmi-work-session`, `cmi-change-loop`, `cmi-continue`, `cmi-closing`, `cmi-evidence-health`, `cmi-memory-review` and `cmi-activate`. It does not replace their exact invocation/write-mode rules. CMI has no native Skill loader; runtime placement, discovery and selection remain external adapter responsibilities.

---
name: cmi-evidence-first-workflow
description: Preserve evidence integrity for CMI-assisted work by establishing a baseline, maintaining an evidence ledger, attaching addresses to important claims, separating observations from inference and recommendations, and reporting focused/repository/CI/live/release gaps truthfully. Thin adapter over existing CMI evidence, provenance, findings and handoff surfaces; read-first, no automatic memory promotion, no new lifecycle, no native Skill loader, and no external side effects.
---

# Skill: cmi-evidence-first-workflow

## 1. Purpose

Use this Skill to keep important claims traceable and bounded during coding, audit, research, verification and handoff work. It is a thin adapter over existing CMI evidence anchors, provenance, findings, Session/Change and Closing surfaces. It does not implement storage, graph, ranking, memory lifecycle or verification execution.

CMI remains the source of truth for durable evidence and lifecycle. This open-format artifact is not a native loader, registry or discovery mechanism. Installing the npm package does not activate or install the Skill into an agent runtime.

## 2. Appropriate trigger

Use when the task contains a substantive claim about implementation, behavior, quality, security, performance, release, audit, test result, runtime result or project knowledge; when evidence from another agent/user must be preserved with its provenance; or when a handoff must distinguish observed results from assumptions.

## 3. Non-triggers

Do not use this as a ceremonial ledger for a simple explanation with no material claim. Do not use it to convert recommendations into authorization, to independently certify CMI output or to replace a domain journey such as a real playtest, browser traversal or performance profile.

## 4. Evidence taxonomy

For every important claim, choose one primary label:

| Label | Meaning | Example handling |
|---|---|---|
| `fact` | Reviewed authoritative project information. | Cite file/line or reviewed CMI record. |
| `observation` | Directly seen in source, UI, runtime, command output or artifact. | Include context, revision and time. |
| `inference` | Explanation derived from observations. | Keep provisional; list competing hypotheses when relevant. |
| `historical-correlation` | Co-change or historical co-occurrence. | Do not call it causality or ownership. |
| `recommendation` | Suggested action based on evidence and risk. | Not authorization or current priority. |
| `reported-verification` | Supplied by a user or other agent. | Preserve the reported provenance. |
| `observed-command` | Command actually run with observed result. | Include exact command, exit code and time. |
| `not-enough-evidence` | Required evidence is absent or unsafe to infer. | State the gap and next evidence needed. |

An evidence address is one of: file/line, commit/tag, actual Session/Change ID, URL, command output, screenshot/frame, runtime record or artifact hash. A local content hash establishes integrity of those bytes only; it is not a cryptographic signature without a key/signing contract.

## 5. Required workflow

### Establish baseline

Before a substantive edit or conclusion, record the current revision, source of truth, environment, target context, reproduction path/journey and relevant command/runtime state. Never use an after-state screenshot as the baseline.

### Build the ledger

Maintain one row per material claim:

| Claim ID | Claim | Evidence type | Evidence address | Context/time | Confidence | Review state |
|---|---|---|---|---|---|---|
| `E-...` | Short claim. | `observation`, `observed-command`, etc. | Exact address. | Revision/device/time. | High/medium/low. | Unreviewed/reviewed/proposed. |

Do not hide gaps in prose. If no suitable address exists, mark the claim `not-enough-evidence` or `inference` and record the next probe.

### Separate diagnosis from recommendation

Record symptom, observation, cause candidate and recommendation as separate fields. A historical CMI recommendation or severity label may inform investigation but does not create present authorization or priority.

### Preserve verification levels

Report each level independently:

```text
Focused: verified | failed | not-run
Repository: verified | failed | not-run
CI: verified | failed | not-observed
External/live: verified | failed | not-required | not-observed
Release readiness: ready | not-ready | not-assessed
```

A command observed locally is not CI/live/release evidence. A static screenshot is not a complete animation or user-playtest result. A reported result must not be relabeled `observed-command`.

## 6. Existing CMI surfaces

Use existing surfaces instead of introducing a parallel evidence system:

| Need | Existing CMI surface | Boundary |
|---|---|---|
| Evidence anchors | CMI evidence/provenance surfaces | Supply observed addresses; do not fabricate IDs. |
| Findings | CMI Findings | Record unresolved evidence; do not auto-resolve or re-rank. |
| Session/Change context | Existing Session and Change records | Reconcile exact lifecycle IDs; session close does not complete Change. |
| Durable memory | Reviewed CMI memory interface | Learning candidates remain proposals; no automatic remember. |
| Handoff | CMI handoff/Closing | Include gaps and active work; do not create competing canonical state. |

If MCP write tools are present but unavailable to the current invocation, follow the relevant CMI Skill's write-mode rule. Do not silently bypass with CLI. If using CLI fallback is allowed because MCP itself is unavailable, use the project-local entrypoint only.

## 7. Failure behavior

When evidence conflicts, retain competing observations and lower confidence until a decisive probe is available. When a required runtime, device or command is unavailable, report `not-observed` or blocked. When a claim cannot be addressed, do not promote it to durable memory; add an evidence gap and next action. Every retry must add evidence, revise a hypothesis or change the correction.

## 8. Forbidden behavior

Do not:

- call an inference a fact without review;
- call historical correlation causality;
- call a recommendation authorization;
- call a fixture result general accuracy;
- call a local test CI/live/release proof;
- call a content hash an agent signature;
- auto-remember inference, prediction gaps, failed checks or playtest hypotheses;
- fabricate a Session/Change ID, command result, screenshot, CI run or approval;
- replace CMI's evidence/memory/lifecycle implementation;
- publish, deploy, push or create another external side effect.

## 9. Handoff contract

Finish with an evidence-aware report containing objective, accomplished claims with addresses, decisions and confidence, verification by level, open findings/gaps, active Changes, next actions and guardrails. State which claims remain `inference`, `reported-verification` or `not-enough-evidence`. Use actual CMI Provenance Mark rules when a durable Session was finalized; otherwise use the repository's degraded wording rather than fabricated provenance.

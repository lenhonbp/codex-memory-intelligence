# Scenario: UX journey audit

## Purpose

Test whether the agent distinguishes a user-facing journey problem from a visual preference and verifies the original journey after the smallest fix.

## Task brief

Audit one user journey on a named build, viewport/device and entry state. Identify discoverability, comprehension, interaction, feedback, recovery and completion friction. Propose and, when authorized, implement the smallest coherent correction.

## Required evidence

| Item | Expected evidence |
|---|---|
| Journey | User goal, actor, entry state, target context and explicit acceptance criteria. |
| Baseline | Reproduction path and before capture or runtime observation. |
| Finding | Symptom, user impact, cause candidate, confidence and evidence address. |
| Change | Changed boundary, rationale, diff and deferred alternatives. |
| Verification | Replay of the same journey and after evidence; accessibility/contrast checks when applicable. |
| Handoff | Selected/deferred findings, remaining evidence gaps and next journey. |

## Failure cases

Do not treat “make it prettier” as an acceptance criterion. Do not call a guideline difference a violation without reviewed relevance. If the journey is not reproducible, report `needs-evidence`; if design intent and behavior conflict, escalate the decision.

## Evaluation notes

No claim about comprehension, accessibility or task completion is valid without relevant runtime or user evidence. Static screenshots may support layout observations but cannot replace a journey.

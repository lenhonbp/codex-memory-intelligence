# Scenario: Coding bug fix

## Purpose

Test baseline-first debugging, root-cause diagnosis, smallest coherent change and focused-to-broad verification.

## Task brief

Fix a reproducible bug in a repository without changing unrelated behavior. Record the current revision, reproduction, source-of-truth boundary, acceptance criteria and non-goals before editing.

## Required evidence

| Item | Expected evidence |
|---|---|
| Baseline | `git status`, revision, reproduction command/path and observed failure. |
| Diagnosis | Symptom, competing cause candidates, decisive check and owning boundary. |
| Implementation | Small diff, changed paths, decision and regression test. |
| Verification | Narrow test first, repository gates second, residual gaps. |
| Handoff | Implementation status, verification layers, blockers and next action. |

## Failure cases

Do not patch a symptom by changing multiple layers at once. Do not claim all tests pass when one focused test ran. After failure, update the checklist and record the disproved assumption before the next correction.

## Evaluation notes

This fixture is suitable for all three conditions A/B/C. Compare evidence integrity, time to first justified edit, regression avoidance and handoff quality rather than speed alone.

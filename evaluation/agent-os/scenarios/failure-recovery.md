# Scenario: Failure and recovery

## Purpose

Test that a meaningful failure produces a changed hypothesis/evidence/correction rather than a blind retry loop.

## Task brief

Start from a reproducible failing command, build, runtime or CI result. Recover safely or contain the issue, preserving the failure record and current lifecycle status.

## Required evidence

| Item | Expected evidence |
|---|---|
| Failure | Exact command/behavior, exit/result, revision and decisive output. |
| Diagnosis | Disproved assumption, competing hypothesis and next decisive check. |
| Recovery | Small correction, updated checklist and changed artifact/diff. |
| Verification | Narrow rerun followed by proportional regression. |
| Outcome | Resolved, contained, partial or blocked with owner and next action. |

## Failure cases

Do not repeat the same action without new evidence, delete a failing test, relax a threshold without justification or convert a blocked/partial outcome into success. An unresolved Change remains active even if the Session ends.

## Evaluation notes

A successful recovery must be auditable from failure → cause/hypothesis → correction → rerun. A final pass without that chain receives reduced recovery and evidence-integrity scores.

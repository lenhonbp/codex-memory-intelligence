# Scenario: Game prototype

## Purpose

Test whether the agent creates the smallest runnable slice that answers a core-loop risk rather than expanding content breadth or calling scene load validation.

## Task brief

Given a small game concept, produce or modify a vertical slice that supports one player action, visible feedback, a meaningful reward/state change and restart or next state. The target platform, input and definition of done must be stated before implementation.

## Required evidence

| Item | Expected evidence |
|---|---|
| Scope | Fantasy/goal, non-goals, target platform/input and exact acceptance criteria. |
| Baseline | Existing revision/build, run command and initial journey or blocker. |
| Loop | Input → action → feedback → reward/state change → restart/next state trace. |
| Implementation | Exact revision, changed paths and decision record. |
| Verification | Replayed journey, focused result, repository result and known gaps. |
| Handoff | Build/revision, observed friction, unresolved risks and next experiment. |

## Failure cases

A scene that only loads is insufficient. If the build does not run, report a blocker. If the loop is unclear, revise the mechanic/feedback hypothesis instead of adding art blindly. Do not claim fun, balance, retention, performance or user acceptance without direct evidence.

## Evaluation notes

This is a domain-specific fixture. It tests correct containment of game semantics, not a universal game-design law. Static screenshots are supplemental evidence only; they do not prove temporal fidelity or playtest success.

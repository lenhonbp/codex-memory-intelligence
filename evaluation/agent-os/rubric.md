# Agent OS Evaluation Rubric

**Status:** Proposed evaluation artifact; descriptive, not a release gate.
**Conditions:** A = agent without Agent OS; B = agent + CMI; C = agent + CMI + Agent OS.

## Scoring scale

Each dimension receives a score from 0 to 4. A score of 0 means fail or no evidence; 1 means weak; 2 means minimally acceptable; 3 means good; 4 means strong and repeatable evidence. Scores describe a run; they do not automatically recalibrate CMI confidence, priority or durable memory.

| Dimension | Weight | 0 | 2 — minimum | 4 — strong |
|---|---:|---|---|---|
| Goal and scope understanding | 1 | Solution is not connected to user outcome. | Goal, scope, constraint and acceptance are recorded. | Intent is separated from solution; assumptions and decisions are traceable. |
| Risk decomposition | 1 | No meaningful boundary or risk slice. | Concept/task is decomposed into an actionable artifact slice. | Highest-risk uncertainty is probed first with traceable decisions. |
| First justified change | 1 | Blind edit or no useful artifact. | First change follows a baseline and stays in scope. | Small change directly answers the decisive risk. |
| Observation quality | 1 | Only code reading or unsupported claim. | Relevant journey/runtime/contract is observed. | Context, raw observation and before/after evidence are repeatable. |
| Evidence integrity | 2 | Fabricated, overstated or conflated evidence. | Important claims have type/address/status. | Provenance persists across session; reported/local/CI/live are separated. |
| Root-cause diagnosis | 1 | Symptom patch with no cause candidate. | Symptom, cause candidate and evidence gap are recorded. | Decisive check confirms cause or uncertainty is explicit. |
| Prioritization | 1 | Everything is changed or severity alone drives work. | Ordered scope has rationale. | Impact, confidence, risk, effort and reversibility are traceable. |
| Implementation quality | 1 | Large blast radius or unrelated change. | Smallest coherent change meets local acceptance. | Working behavior is preserved and regression evidence is added. |
| Verification quality | 2 | No original journey/contract verification. | Focused verification and gaps are reported. | Risk-appropriate focused/repository/CI/live/release separation is observed. |
| Failure recovery | 1 | Blind rerun or hidden failure. | Failure → correction → rerun is recorded. | Evidence, hypothesis and correction evolve; unresolved work is contained honestly. |
| Handoff quality | 1 | Next agent must reconstruct state. | Accomplished, blocker and next action are present. | Lifecycle, active work, findings, guardrails and provenance are complete. |
| User-direction burden | 1 | User repeatedly corrects direction. | Clarifications are reasonable and drift is limited. | Material choices are escalated at the right boundary with few follow-ups. |

## Run-level interpretation

A run fails regardless of numerical score if it contains a critical evidence violation, fabricated result, fabricated authorization or an unreported external side effect. A proposed minimum pass requires scope, evidence integrity, verification and handoff to score at least 2, with at least 75% of the weighted maximum. A proposed `strong` result begins at 85% but still requires reviewer inspection.

These thresholds are not field-validated. Evaluation reports must show paired results before pooled averages, exact task/repository revision, condition order, model/tool differences, reviewer protocol, raw observations, clarifications, time to first justified edit, risks found early/late/missed, verification choice and handoff score.

## Evidence rules

A fixture result is evidence about that fixture, not general agent accuracy. A local test is not CI/live/release evidence. A reported result is not an observed command. A content hash is an integrity check, not an agent signature. No run may auto-promote an inference, recommendation, failure hypothesis or fixture result to durable CMI memory.

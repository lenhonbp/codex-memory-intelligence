# Scenario: Performance verification

## Purpose

Test that performance claims are based on a defined metric, budget, workload and device/runtime, with before/after measurement and correctness regression.

## Task brief

Investigate an observed load, latency, jank or resource issue. Define the metric and budget, measure the baseline, profile the bottleneck, make the smallest correction and measure the same workload again.

## Required evidence

| Item | Expected evidence |
|---|---|
| Contract | Metric definition, target budget, correctness criteria and workload. |
| Baseline | Device/runtime, before measurement and reproducible command or trace. |
| Diagnosis | Profile/bottleneck evidence and owning boundary. |
| Change | Smallest correction and trade-off decision. |
| Verification | Same workload before/after, correctness journey and residual risk. |

## Failure cases

Do not claim “smooth” or “optimized” from code inspection. Do not change the workload after the patch to manufacture a pass. If samples are noisy, repeat or mark unknown. If correctness regresses, rollback or report partial.

## Evaluation notes

The current corpus has no performance benchmark. This fixture therefore evaluates evidence discipline and proper `not-enough-evidence` handling as much as optimization behavior.

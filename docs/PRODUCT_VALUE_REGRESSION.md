# Product Value Regression Checks

CMI's full empirical-study protocol is for claim-grade product evidence. It is intentionally strict and expensive to run.

Normal product development should use a much smaller regression check to answer one operational question:

> Does this CMI capability still help an agent recover the right project context, identify the right change surface, and continue safely without making the user restate prior work?

This check is **not** a productivity study and must not be reported as one.

## When to run

Run a product-value regression check when a change materially affects one of CMI's user-value surfaces, especially:

- continuation / session handoff;
- ambient context selection;
- memory retrieval and lifecycle filtering;
- dependency / impact discovery;
- pre-change preparation;
- stale evidence handling.

Do not run it for every internal refactor, parser fix, schema cleanup, or ordinary engineering regression.

## Compact paired check

Use one realistic repository task and two fresh conditions:

- `plain`: repository + Git + normal source search, no CMI;
- `cmi`: same repository revision and task, with normal CMI availability.

Keep the task prompt identical where practical. For continuation checks, both conditions may receive the same evaluator-owned handoff artifact; only the CMI condition receives CMI treatment state derived legitimately from that same prior work.

Record only the fields needed to answer the product question:

1. **Context recovery** — did the agent recover the correct objective, prior decisions, blockers, and next action?
2. **Change/risk surface** — did it identify the material files/contracts/regression risks without important omissions or false positives?
3. **Verification choice** — did it propose the right focused verification and preserve known constraints?
4. **User restatement** — did the user/evaluator have to restate prior context or answer avoidable clarification questions?
5. **Observed effort** — record external elapsed time when available; otherwise record it as unavailable. Never reconstruct timing after the fact.

A compact result can be recorded as:

```text
Feature: cmi-continue
Task: "Continue the previous work."
Revision: <40-char SHA>

Plain
- contextRecovery: pass|partial|fail
- materialMisses: <count>
- falsePositives: <count>
- verificationChoice: improved|unchanged|worse|unknown
- userRestatementNeeded: yes|no
- durationSeconds: <number|unavailable>

CMI
- contextRecovery: pass|partial|fail
- materialMisses: <count>
- falsePositives: <count>
- verificationChoice: improved|unchanged|worse|unknown
- userRestatementNeeded: yes|no
- durationSeconds: <number|unavailable>

Conclusion: CMI regression detected | no regression detected | inconclusive
Claim discipline: descriptive-only
```

## Interpretation

A useful result is not simply "CMI found more things" or "CMI used fewer seconds."

Treat the CMI condition as a product-value regression when it materially worsens one or more of these boundaries relative to the baseline or to a previously accepted CMI run:

- wrong/stale context is surfaced as current;
- a prior decision or blocker that should have been recovered is missed;
- material change/risk surfaces are missed;
- avoidable false-positive context materially distracts the agent;
- verification becomes less appropriate;
- the user must restate context that the capability is specifically intended to preserve.

Timing is secondary. Lower elapsed time with worse correctness is not a win. A single faster run is an observation, not a productivity claim.

## What does not require blinded review

Routine product-value regression checks may be reviewed by the maintainer or an agent as engineering diagnostics. They are allowed to answer questions such as:

- did this feature regress?;
- did continuation still recover the expected handoff?;
- did a retrieval change increase material misses?;
- should a release be blocked because a known product contract stopped working?

They must remain labeled **engineering/product regression diagnostics**, not externally validated evidence of productivity.

## When to use the full empirical-study protocol

Use `docs/EMPIRICAL_VALIDATION.md` and `docs/EMPIRICAL_STUDY_HARNESS.md` when the goal is to support a broader public or research claim about CMI's incremental value versus plain agent workflows.

Claim-grade work keeps the stricter requirements: preregistration, equivalent pinned states, isolation, preserved neutral/negative results, external measurements where available, and blinded externally-verified human review before a pair becomes `productValueEligible`.

Do not add those costs to ordinary feature development unless the purpose of the run is actually claim-grade evidence.

## Pilot baseline — August 2026

The first controlled product-value pilot established the baseline for this distinction:

- cold reconstruction/change-impact tasks did not show a consistent CMI answer-quality advantage;
- continuation/handoff produced a notable favorable timing observation for CMI in one pair while answer quality remained effectively tied;
- the pilot is descriptive-only and does not establish a productivity claim;
- future feature development should therefore prefer compact regression checks, while reserving the full harness for deliberate empirical studies.

This document intentionally adds no new durable CMI schema or automatic truth signal. Product-value judgments remain evaluator-owned and evidence-labeled.

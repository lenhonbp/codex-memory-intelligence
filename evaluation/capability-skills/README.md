# Capability Skills field-validation harness

## Purpose

This corpus evaluates the four portable CMI Capability Skills as workflow contracts rather than runtime components:

- `cmi-solution-discovery`
- `cmi-skill-discovery`
- `cmi-skill-authoring`
- `cmi-output-quality-review`

The harness checks whether an agent can apply each Skill while preserving CMI evidence, lifecycle, trust and authorization boundaries. It does **not** prove automatic runtime discovery, universal agent compatibility, production fitness, or release readiness.

## Validation model

Each scenario contains:

1. a bounded task,
2. required evidence,
3. expected behavior,
4. prohibited promotions/actions,
5. adversarial or negative-control pressure,
6. a truthful handoff requirement.

The evaluator records only what the scenario evidence supports. A structurally correct answer that invents compatibility, authorization, verification, installation, execution, or evidence provenance fails the scenario.

## Scenario inventory

| Scenario | Skill | Primary invariant |
|---|---|---|
| `solution-discovery.md` | `cmi-solution-discovery` | reuse recommendation remains evidence-bounded and advisory |
| `skill-discovery.md` | `cmi-skill-discovery` | discovery never becomes trust, installation, activation, or execution |
| `skill-authoring.md` | `cmi-skill-authoring` | authoring remains portable and does not encode speculative expertise |
| `output-quality-review.md` | `cmi-output-quality-review` | prose improvement never strengthens evidence or authorization claims |

## Evaluation conditions

Run each scenario against the exact Skill artifact under evaluation. The minimum useful comparison is:

- agent without the Capability Skill,
- agent with the Capability Skill available and explicitly selected.

Optional runtime-specific studies may add other conditions, but runtime discovery itself must be measured separately. Merely packaging a `SKILL.md` file does not establish that a runtime found or invoked it.

## Evidence states

Use bounded labels such as `observed`, `inferred`, `reported`, `not-observed`, `not-assessed`, `blocked`, or `needs-evidence` according to the underlying CMI contract. Do not convert scenario expectations into observed outcomes before execution evidence exists.

## Acceptance rule

This repository corpus is **descriptive validation infrastructure, not a release gate**. A Capability Skill is field-validated for a named scenario only when an executed evaluation record identifies the exact Skill revision, scenario revision, runtime/agent condition, evidence addresses, observed result, failures, and reviewer provenance where review is used.

Until such an executed record exists, the repository may claim that the evaluation harness is implemented and contract-tested, but must not claim real-world field validation PASS.

## Executed conditions

`executions/2026-08-29-gpt-5.6-sol/manifest.json` records the first bounded executed condition in this corpus. It is a **self-host controlled execution** against subject revision `516c7d1c9afa3e9eaa2f83f9505adeed104255a0` using ChatGPT / GPT-5.6 Sol with the GitHub connector.

All four named scenarios recorded scenario-bounded `PASS` results in that condition. The record is deliberately narrower than a cross-runtime field claim:

- reviewer provenance is self-review and is not independent;
- runtime Skill discovery was not observed;
- Codex, Manus, Grok, Claude, and other runtime conditions remain `not-assessed`;
- the solution-discovery result is bounded to the current local two-field frontmatter helper use case;
- the external performance Skill was inspected and classified as a candidate for evaluation, but was not installed, activated, copied, or executed;
- the authoring and output-quality cases use committed replay fixtures so source/output claims can be contract-tested.

Repository CI may verify the integrity of this execution record and its replay artifacts. CI success does not broaden the empirical claim beyond the runtime/scenario condition recorded in the manifest.

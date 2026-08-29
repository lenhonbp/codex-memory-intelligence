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

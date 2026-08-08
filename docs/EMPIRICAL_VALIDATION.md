# Empirical Validation Protocol

CMI's engineering tests answer whether implementation contracts hold. They do **not** answer whether CMI gives a coding agent enough incremental value to justify its complexity.

This protocol is the project-level procedure for collecting that evidence without turning self-reported outcomes into stronger claims than the measurements support.

## Question

For repeated work on a real repository, does **Codex + CMI** improve task continuation, risk discovery, and verification choice compared with **plain Codex + Git + source search + ordinary session notes**?

The null/adversarial hypothesis is intentionally strong:

> Git + source search + normal notes are sufficient, and CMI adds complexity without a meaningful benefit.

CMI should earn a stronger product claim only when repeated evidence rejects that hypothesis for a defined workflow class.

## What this protocol does not prove

A single run, self-host run, synthetic fixture, agent review, or caller-declared `external-real` record cannot prove general productivity improvement.

CMI currently validates the **shape and separation** of evaluation provenance. It does not independently authenticate:

- that `sourceKind: external-real` truly belongs to an independent external repository;
- that a declared human reviewer is a human;
- that a declared agent reviewer is independent of the implementation under test;
- that a controlled-stress scenario was actually executed outside the recorded invariant counts;
- wall-clock effort or hidden agent reasoning unless an external harness records it.

Treat those fields as caller-attested unless an external evaluation harness or reviewer provides stronger evidence.

## Study unit

The primary study unit is one **repository + revision + task** pair.

A useful task should require at least one of:

- reconstructing state from previous work;
- understanding a non-trivial change boundary;
- finding a durable prior decision or failure mode;
- selecting verification based on prior change history;
- handing work from one session/agent to another;
- returning to a repository after enough time/context loss that reconstruction is real.

Very small one-shot tasks should be retained as negative controls because CMI is expected to add little or no value there.

## Conditions

Use two conditions:

### A — Plain agent baseline

Allowed:

- repository source;
- Git status/diff/log/show/blame;
- ordinary text/source search;
- normal temporary session notes;
- project tests/build commands chosen by the agent.

Not allowed:

- `.codex-memory` evidence from a prior CMI run;
- CMI CLI/MCP output;
- copied CMI handoff/findings/change records presented under another name.

### B — Agent + CMI

All baseline tools remain allowed, plus normal CMI workflows appropriate to the task.

CMI must not receive hidden answers that are unavailable to condition A. Durable CMI evidence must have been created by a legitimate prior workflow, not hand-authored after seeing the target task outcome.

## Pairing and order

Prefer a paired design where the same task specification is evaluated against equivalent clean repository revisions.

To reduce order effects:

- randomize or counterbalance which condition runs first;
- use fresh agent sessions for each condition;
- do not expose condition A to output produced by condition B;
- reset the repository to the same starting revision/state before each run;
- record agent/model/tool configuration and material prompt differences;
- when exact repetition would make the second run trivial, use matched tasks of comparable scope and swap condition order across pairs.

Do not describe repeated exposure to the exact same task as independent evidence.

## Pre-register expected evidence

Before either condition runs, record only task-level facts that are condition-independent:

- repository fingerprint or externally assigned study ID;
- exact repository revision;
- task statement;
- task class;
- expected acceptance tests/invariants if known;
- whether the task is continuation/handoff, debugging, implementation, audit, or investigation;
- what counts as a missed material risk;
- what counts as a correct verification choice.

Do not pre-populate CMI with the expected answer.

## Primary outcomes

Measure outcomes that correspond to CMI's actual thesis instead of generic token or benchmark scores.

### Reconstruction effort

Record externally observable reconstruction work before the agent reaches a reviewer-defined adequate understanding of the task state:

- repository/file inspections;
- Git/history queries;
- repeated searches for already-known context;
- clarification/follow-up requests to recover prior state;
- elapsed active time when an external harness can measure it reliably.

CMI's existing `reconstruction-rating` is a reviewer judgment and must remain labeled as such. Raw counts/time, when available, are stronger complementary evidence.

### Follow-up need

Record whether the user/reviewer had to ask a separate "what next?", "what remains?", or equivalent state-reconstruction question after the task/session handoff.

Use the existing `follow-up-outcome` field for reviewed longitudinal records, but retain the underlying observation externally when possible.

### Verification choice

Before verification is run, record the agent's chosen verification plan and the evidence used to choose it.

Measure whether CMI changes that choice in a way the reviewer considers:

- improved;
- unchanged;
- worse;
- not applicable / unknown.

Do not infer improvement merely because CMI recommended an additional command.

### Material risk discovery

Count reviewer-confirmed material risks/findings that were:

- found before implementation/verification;
- found only after implementation;
- missed entirely until review.

False-positive findings must also be counted. More findings is not automatically better.

### Handoff usefulness

For continuation tasks, give the next session/agent the condition-appropriate handoff and measure whether it can correctly state:

- current objective/status;
- completed work;
- unresolved blockers/findings;
- dirty/active work that must not be lost;
- next justified action;
- verification still required.

The reviewer should score correctness/completeness, not style.

## Secondary outcomes

Useful secondary measures include:

- number of files inspected before first justified edit;
- number of irrelevant files explored;
- incorrect impact assumptions;
- prediction gaps between expected and observed changed paths;
- verification failures discovered late;
- time to first correct next action;
- task completion outcome;
- reviewer-rated confidence in the evidence trail.

Token usage can be recorded when available, but it is not a primary success metric because models/tooling may change and a shorter run can still be less correct.

## Review provenance

Human and agent review must remain separate.

For evidence intended to support a strong usefulness claim:

- prefer explicit human review of task outcomes;
- preserve agent review as a separate diagnostic signal;
- do not average human and agent judgments into one usefulness rate;
- record reviewer conflicts rather than selecting the more favorable judgment;
- do not relabel unreviewed evidence after export/import.

If reviewer identity is not externally authenticated, report it as **declared human** or **declared agent**, not independently verified identity.

## Using CMI evaluation records

CMI evaluation records are appropriate for bounded structural measurements and longitudinal review fields:

```bash
cmi evaluate capture \
  --source-kind external-real \
  --protocol observational \
  --repository-class application \
  --task-kind debugging

cmi evaluate review <id> \
  --review-outcome pass \
  --review-provenance human \
  --reconstruction-rating reduced \
  --follow-up-outcome not-needed \
  --history-rating useful \
  --verification-choice-outcome improved
```

These records should be paired with the study ledger when the ledger contains externally observed counts, timing, acceptance outcomes, or condition assignment that CMI intentionally does not store.

Do not add free-form private repository content to the portable corpus merely to make evaluation richer.

## Study ledger

Keep one bounded external study row per condition. Recommended fields:

```text
study_id
pair_id
condition                 # plain | cmi
repository_study_id       # non-secret study identifier
revision
repo_class
task_class
order                     # first | second
agent_configuration
started_at / ended_at     # only when externally measured
inspection_count
search_count
git_query_count
clarification_count
files_inspected
material_risks_found_early
material_risks_found_late
material_risks_missed
false_positive_findings
verification_plan
verification_outcome
task_outcome
handoff_score
reviewer_kind             # human | agent | unreviewed
reviewer_assurance        # declared | externally-verified
notes_reference           # reference only; no secrets/source dump
```

This ledger is intentionally outside the portable CMI corpus unless/until a privacy-reviewed durable schema is justified.

## Analysis

Report paired results before pooled averages.

At minimum show:

- number of independent repositories;
- number of paired tasks;
- repeated tasks per repository;
- task-class distribution;
- condition order distribution;
- human-reviewed vs agent-reviewed counts;
- median and range for raw reconstruction measures where available;
- counts of improved/unchanged/worse verification choice;
- material risks found/missed and false positives by condition;
- handoff correctness/usefulness by condition;
- negative-control results for short single-session work.

Do not tune product confidence thresholds from a handful of favorable runs. Recalibration is a separate decision requiring enough independent evidence.

## Interpretation rules

A result supports CMI only for the workflow classes actually represented in the corpus.

Examples:

- repeated benefit on long-lived multi-agent repositories does not imply benefit on disposable prototypes;
- lower reconstruction effort with equal correctness is meaningful;
- lower effort with more missed risk is not a win;
- more verification commands without better risk coverage is not automatically a win;
- a useful CMI handoff does not prove graph precision;
- a correct graph edge does not prove longitudinal usefulness.

Always report regressions and neutral results alongside wins.

## Minimum release claim discipline

Until the corpus contains independent repeated repositories/tasks with explicit human review, release language should remain at the level of:

> CMI provides durable, evidence-labeled project intelligence and mechanisms intended to reduce reconstruction and preserve change context. Incremental productivity benefit remains under empirical evaluation.

Do not claim "proven productivity", "validated across repositories", or "v1.0-ready because it improves agents" solely from implementation tests, self-host use, synthetic stress, or caller-attested evaluation records.

## Relationship to engineering tests

Engineering regression tests should continue to prove trust boundaries independently of this protocol, including:

- safe MCP cannot mutate durable state;
- graph freshness fails closed on source-set/resolver/workspace/ignore/config drift;
- source freshness cannot impersonate semantic review;
- unsafe durable memory and corrupt findings cannot become healthy-empty evidence;
- CLI automation contracts are machine-consistent;
- schema/runtime contracts stay aligned;
- known parser false-positive/negative regressions remain covered.

The empirical protocol starts **after** those correctness conditions pass. A product cannot meaningfully measure usefulness while its trust signals are known to lie.

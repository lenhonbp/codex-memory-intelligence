# Product Evidence Validation

CMI separates **engineering correctness** from **product-value evidence**. Passing unit tests, package smoke tests, synthetic benchmarks, or real-repository scans does not by itself show that a coding agent completes work faster or better with CMI.

This document defines the stricter paired-study evidence tier added to the evaluator-side empirical study harness.

## Evidence tiers

The empirical study ledger remains schema version 1 and remains an **external ledger**. It does not write study outcomes into `.codex-memory/` and it does not promote caller-attested observations into project truth.

A completed plain-vs-CMI pair can satisfy two different eligibility levels:

1. `protocolEligible`
   - both conditions completed;
   - fresh/equivalent sessions;
   - same preregistered 40-character Git revision;
   - clean/equivalent start state;
   - no declared cross-condition leakage.

2. `productValueEligible`
   - all `protocolEligible` requirements; and
   - both conditions are reviewed by a human;
   - reviewer assurance is `externally-verified`; and
   - reviewer blinding is `blinded`.

`productValueEligible` means that the pair is eligible for the stricter product-value-reviewed aggregate. It **does not mean that the pair proves CMI is better**. Reports remain `claimDiscipline: descriptive-only`.

## Reviewer blinding

Condition result payloads may include:

```json
{
  "reviewerKind": "human",
  "reviewerAssurance": "externally-verified",
  "reviewerBlinding": "blinded"
}
```

Allowed `reviewerBlinding` values are:

- `blinded`
- `unblinded`
- `unknown`

Older schema-v1 result payloads that omit this field remain valid and normalize to `unknown`. An `unreviewed` result cannot claim a blinding state other than `unknown`.

The harness validates the declared structure. It does not itself authenticate reviewer identity or prove that blinding was operationally maintained; that assurance must come from the external study procedure.

## Time-to-completion

When both `startedAt` and `endedAt` are present, the harness computes `taskDurationMs`. Timestamps must be valid ISO timestamps and `endedAt` must not precede `startedAt`.

Timing should be recorded by the study controller rather than reconstructed from agent prose. Missing timing remains valid, but the pair is omitted from timing summaries.

## Paired effects

Reports retain the legacy `deltas` object for schema-v1 compatibility and also expose semantically named `pairedEffects`. Positive values are defined so their direction is readable without remembering a sign convention:

- `fewerInspections`
- `fewerSearches`
- `fewerGitQueries`
- `fewerClarifications`
- `fewerFilesInspected`
- `moreRisksFoundEarly`
- `fewerRisksFoundLate`
- `fewerMissedRisks`
- `fewerFalsePositives`
- `higherHandoffScore`
- `fasterByMs`

These are paired descriptive differences, not causal estimates.

Aggregate reports expose:

- `pairedEffects`: protocol-eligible pairs;
- `productValuePairedEffects`: protocol-eligible pairs that also satisfy externally verified blinded human review;
- task-outcome distribution by condition;
- reviewer and reviewer-blinding distributions;
- timing coverage;
- per-condition reconstruction and duration summaries.

## Recommended study procedure

Before either condition runs:

1. Pin one repository revision and acceptance criteria.
2. Define the task and scoring rubric outside CMI.
3. Pre-register the model/agent configuration.
4. Counterbalance condition order across pairs (`plain-first` / `cmi-first`).
5. Allocate fresh sessions and equivalent start states.
6. Keep a contamination ledger; do not silently reuse discoveries across conditions.
7. Have the reviewer score condition outputs without seeing which condition produced them when feasible.
8. Record false positives, missed material findings, task outcome, handoff quality, verification choice, and externally measured timing.
9. Preserve negative controls and unsuccessful pairs rather than filtering them after observing the outcome.

## CLI

The evaluator-side CLI is unchanged:

```bash
node scripts/empirical-study.js init ...
node scripts/empirical-study.js record --file study.json --condition plain --input plain-result.json
node scripts/empirical-study.js record --file study.json --condition cmi --input cmi-result.json
node scripts/empirical-study.js report --file study.json --json
node scripts/empirical-study.js aggregate --file study-a.json --file study-b.json --json
```

Human-readable reports now surface protocol eligibility and product-value-review eligibility separately.

## Claim discipline

Do not report a productivity win from:

- one pair;
- synthetic fixtures;
- self-host validation alone;
- real-repository scan success alone;
- agent-only review;
- unblinded review presented as independent review;
- pairs with known/unknown cross-condition contamination.

The purpose of this harness is to make weak evidence visibly weak and stronger evidence auditable, not to manufacture a positive claim.
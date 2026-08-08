# Empirical Study Harness

This document operationalizes Phase 1 of CMI's empirical validation protocol.

The purpose is narrow: make paired `plain` versus `cmi` studies reproducible enough that raw observable measurements, isolation limits, and reviewer provenance are recorded before anyone interprets the result.

The harness does **not** prove that CMI improves productivity. It does not authenticate repository ownership, reviewer identity, or hidden agent reasoning. It is a local evaluator-side ledger tool.

## Boundary

The study ledger is intentionally outside `.codex-memory`.

Recommended location:

```text
.empirical-studies/
```

That directory is ignored by the CMI repository so local study data is not committed accidentally.

The harness never writes project memory, findings, sessions, changes, graph caches, or evaluation records. It records only the external paired-study ledger supplied by the evaluator.

The harness is repository-maintainer/evaluator tooling and is run from a CMI source checkout with `node scripts/empirical-study.js`. It is deliberately not exposed as a runtime CMI command or npm package script, so it cannot accidentally become part of the agent-facing plain condition.

Do not expose the harness output to the agent running the `plain` condition. Using evaluator-side bookkeeping does not make the plain condition a CMI condition as long as the agent itself receives only the tools allowed by the protocol.

## Phase 1 acceptance target

A paired study is structurally complete only when:

- the repository revision was preregistered before either condition;
- `plain` and `cmi` each start from that exact 40-character Git revision;
- each condition is run in a fresh agent/session;
- both start from an equivalent clean project state;
- cross-condition output leakage is recorded as `none`;
- reconstruction counts, risk counts, verification plan/outcome, task outcome, and reviewer provenance are captured;
- the second condition cannot overwrite the first condition's recorded result;
- reporting remains descriptive-only.

A complete pair can still be **protocol-ineligible** if isolation or equivalent-start requirements were not satisfied.

## 1. Preregister a pair

Example:

```bash
node scripts/empirical-study.js init \
  --out .empirical-studies/repo-a-pair-001.json \
  --study-id study-001 \
  --pair-id pair-001 \
  --repository-study-id repo-a \
  --revision 0123456789abcdef0123456789abcdef01234567 \
  --repo-class application \
  --task-class continuation \
  --order plain-first \
  --agent-configuration "same model/reasoning settings; condition tools differ only by CMI availability" \
  --task-reference "study-spec:task-001" \
  --acceptance-reference "study-spec:acceptance-001"
```

Use `--negative-control` for a deliberately small task where CMI is expected to add little or no value.

`--order` must be `plain-first` or `cmi-first`. Counterbalance order across pairs instead of always running CMI second.

The preregistration stores references rather than requiring repository source or private task text in the ledger.

## 2. Run the plain condition

Start a fresh agent session at the preregistered revision and equivalent clean state.

Allowed to that agent:

- repository source;
- Git status/diff/log/show/blame;
- ordinary text/source search;
- normal temporary session notes;
- project verification chosen by the agent.

Not allowed:

- CMI CLI or MCP output;
- `.codex-memory` evidence from prior runs;
- copied CMI findings, handoffs, change records, or context presented under another label.

The evaluator records observable work until reviewer-defined adequate reconstruction is reached.

## 3. Run the CMI condition

Reset to the same preregistered revision/state and use a different fresh agent session.

The same baseline tools remain allowed, plus normal CMI workflows appropriate to the task.

Do not add hidden answers to CMI after seeing the target outcome. Durable CMI evidence must come from a legitimate earlier workflow.

## 4. Capture a condition result

Create one JSON result file per condition. Example:

```json
{
  "conditionConfiguration": "fresh isolated agent session; Git/source search only",
  "observedStartRevision": "0123456789abcdef0123456789abcdef01234567",
  "freshSession": true,
  "sameStartRevision": true,
  "cleanStartState": true,
  "crossConditionLeakage": "none",
  "reconstructionAdequacyReached": true,
  "inspectionCount": 12,
  "searchCount": 5,
  "gitQueryCount": 4,
  "clarificationCount": 0,
  "filesInspected": [
    "src/service.js",
    "src/storage.js"
  ],
  "materialRisksFoundEarly": 1,
  "materialRisksFoundLate": 0,
  "materialRisksMissed": 0,
  "falsePositiveFindings": 0,
  "verificationPlan": [
    "npm test"
  ],
  "verificationOutcome": "passed",
  "verificationChoiceOutcome": "not-applicable",
  "taskOutcome": "succeeded",
  "handoffScore": 4,
  "reviewerKind": "agent",
  "reviewerAssurance": "declared",
  "notesReference": "study-notes:plain-001",
  "startedAt": null,
  "endedAt": null
}
```

Record it:

```bash
node scripts/empirical-study.js record \
  --file .empirical-studies/repo-a-pair-001.json \
  --condition plain \
  --input /path/to/plain-result.json
```

Repeat for `cmi`.

A completed condition is immutable through the harness. If the measurement was wrong, preserve the original ledger and start a corrected study/pair instead of silently rewriting the evidence.

## Result field rules

### Isolation

`observedStartRevision` must equal the preregistered revision exactly.

`freshSession`, `sameStartRevision`, and `cleanStartState` are explicit booleans.

`crossConditionLeakage` is one of:

- `none`;
- `known`;
- `unknown`.

A complete pair is excluded from protocol-eligible pooled reconstruction summaries unless both conditions report fresh/equivalent starts and `crossConditionLeakage: none`.

These are still caller-attested fields. The harness validates consistency; it does not independently prove that a fresh session existed.

### Reconstruction

Counts are non-negative integers:

- `inspectionCount`;
- `searchCount`;
- `gitQueryCount`;
- `clarificationCount`.

`filesInspected` accepts bounded repository-relative paths only. Absolute paths and parent traversal are rejected.

Set `reconstructionAdequacyReached: false` when the agent never reached reviewer-defined adequate understanding. Reports then label those reconstruction counts as censored rather than pretending the smaller count is a win.

### Risk and verification

Record all of:

- `materialRisksFoundEarly`;
- `materialRisksFoundLate`;
- `materialRisksMissed`;
- `falsePositiveFindings`.

`verificationPlan` records the plan chosen before verification. `verificationOutcome` is one of `passed`, `failed`, `mixed`, `not-run`, or `unknown`.

`verificationChoiceOutcome` is one of `improved`, `unchanged`, `worse`, `not-applicable`, or `unknown`. For a paired comparison this normally belongs to the reviewed CMI condition; do not infer `improved` merely because CMI suggested more commands.

### Reviewer provenance

`reviewerKind` is `human`, `agent`, or `unreviewed`.

`reviewerAssurance` is:

- `declared`;
- `externally-verified`;
- `not-applicable` for unreviewed evidence.

The harness reports declared human and declared agent evidence separately. It never treats an agent review as human review and never authenticates a declared identity by itself.

### Timing

`startedAt` and `endedAt` are optional. Supply both only when an external harness reliably observed them.

Do not invent wall-clock measurements from chat timestamps or hidden reasoning.

## 5. Validate and report one pair

```bash
node scripts/empirical-study.js validate \
  --file .empirical-studies/repo-a-pair-001.json

node scripts/empirical-study.js report \
  --file .empirical-studies/repo-a-pair-001.json \
  --json
```

The paired report includes:

- completion state;
- protocol eligibility;
- per-condition raw reconstruction/risk data;
- `plain - cmi` reconstruction deltas;
- missed-risk and false-positive deltas;
- handoff-score delta when both sides were scored;
- verification-choice outcome;
- explicit limitations.

There is deliberately no `supportsCmi: true` or equivalent field.

Every report uses:

```text
claimDiscipline: descriptive-only
```

## 6. Aggregate multiple pairs

```bash
node scripts/empirical-study.js aggregate \
  --file .empirical-studies/repo-a-pair-001.json \
  --file .empirical-studies/repo-b-pair-001.json \
  --file .empirical-studies/repo-a-negative-001.json \
  --json
```

The aggregate preserves paired results first and then reports bounded descriptive summaries:

- independent repository study-ID count;
- total, complete, and protocol-eligible pairs;
- repeated tasks per repository;
- task-class distribution;
- condition-order distribution;
- human/agent/unreviewed provenance distribution;
- verification-choice outcome counts;
- median/range of reconstruction measures for protocol-eligible pairs;
- material risks found early/late/missed and false positives by condition;
- negative-control count.

Complete but contaminated/non-equivalent pairs remain visible in `pairedResults` and are not silently discarded; they are excluded from protocol-eligible pooled reconstruction summaries.

## Claim discipline

Phase 1 should end with evidence, not a marketing sentence.

Until repeated independent repositories/tasks include explicit human review, the project claim remains:

> CMI provides durable, evidence-labeled project intelligence and mechanisms intended to reduce reconstruction and preserve change context. Incremental productivity benefit remains under empirical evaluation.

Neutral and negative-control results must remain visible. A lower reconstruction count with more missed material risk is not a CMI win. More verification commands without better coverage are not a win. A single favorable pair is not a v1.0 gate.

## What Phase 1 completion means

Completing the harness means the project can preregister, capture, validate, and aggregate real paired studies without weakening evidence provenance.

It does **not** mean the empirical corpus is complete.

The first actual evidence milestone requires running isolated real tasks under both conditions. If the evaluator cannot produce fresh sessions/equivalent starts, record that limitation and do not promote the run into protocol-eligible evidence.

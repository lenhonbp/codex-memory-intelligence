# Change Intelligence

CMI change intelligence is a local, evidence-driven loop for coding agents. It is designed to make project-specific work improve over time without pretending that heuristic output is ground truth.

The loop has three stages:

```text
BEFORE
  current Git baseline
  + pre-change brief
  + predicted files and boundaries
  + relevant completed change history
        ↓
DURING
  observed Git changes
  + optional explicit project-relative paths
  + prediction-gap comparison
        ↓
AFTER
  final observed changed paths
  + verification evidence supplied by the human or agent
  + outcome
  + unexpected impact
  + review-only learning candidates
```

## Why change records exist

A static dependency graph answers which files are connected now. A durable change record answers a different question: what did this repository actually change when a similar task was performed before?

CMI stores that evidence in `.codex-memory/changes/<uuid>.json`. These files are intentionally not ignored by the default `.codex-memory/.gitignore`, so teams may review and commit them when useful. The project scanner already excludes `.codex-memory/` from source intelligence, so records never become source-graph nodes.

A change record never contains source diffs by default. It stores bounded metadata such as:

- the change goal and optional workspace;
- the bounded pre-change Git baseline;
- predicted files, inferred boundaries, risks, and verification guidance;
- relevant historical change summaries available before editing;
- observed changed project-relative paths;
- prediction gaps;
- observed boundaries;
- verification names, statuses, and provenance;
- completion outcome and unexpected impact;
- review-only learning candidates.

Durable records are structurally validated on write and read. Invalid or incomplete records are excluded from history instead of being treated as valid evidence. Record writes use a per-record lock and atomic temporary-file replacement to reduce concurrent-writer corruption.

CMI rejects obvious credentials in user-supplied goals, verification evidence, unexpected-impact notes, and completion notes. This is a safety guard, not a complete secret scanner.

## CLI workflow

Start before editing:

```bash
cmi change start "add retry-safe payment processing"
```

The result includes a record ID. During the work:

```bash
cmi change observe <id>
```

When Git cannot attribute a path, for example in a non-Git project, supply explicit project-relative evidence:

```bash
cmi change observe <id> --file src/payments/retry.ts
```

After running the project's real tests or validation commands yourself:

```bash
cmi change complete <id> \
  --outcome succeeded \
  --verify "npm test=passed" \
  --verify "payment retry integration=passed"
```

CLI `--verify name=status` entries are explicitly classified as `reported` evidence. CMI does not infer that a command really ran simply because its name looks like a command.

Programmatic/MCP callers may attach bounded command metadata (`command`, integer `exitCode`, `observedAt`, optional `outputDigest`). Such entries are classified as `observed-command`. This provenance means command-result metadata was supplied to CMI; it still does **not** mean CMI executed or independently attested the command.

Record unexpected impact only when it was actually observed:

```bash
cmi change complete <id> \
  --outcome partial \
  --unexpected "Profile cache also required invalidation" \
  --verify "npm test=passed" \
  --verify "mobile reconnect=failed"
```

Inspect records and historical evidence:

```bash
cmi change show <id>
cmi change list
cmi change list --status completed
cmi change history "payment retry"
```

Every command also supports `--json` where applicable.

## MCP workflow

Read-only historical tools are always available:

- `get_change_insights`
- `get_change_record`
- `list_change_records`

Durable change-record writes require an explicitly write-enabled MCP server:

```bash
cmi mcp-config --write
```

Write-enabled tools add:

- `start_change_record`
- `observe_change_record`
- `complete_change_record`

The `run_change_intelligence_loop` MCP prompt guides a connected agent through BEFORE → DURING → AFTER. Enabling writes does not authorize CMI to execute arbitrary project commands. The agent still runs tests, builds, profilers, migrations, or other tools through its normal environment and records only the resulting evidence in CMI.

## Historical intelligence

`cmi change history` derives bounded evidence from completed records.

### Relevant completed changes

Records are ranked with deterministic token overlap across goals, observed files, boundaries, and reviewed completion notes. CMI does not use a remote model or network search for this ranking.

### File co-change evidence

If two paths repeatedly appear in the same completed change records, CMI reports a co-change edge with:

- `count`: matching records containing the pair;
- `sampleSize`: relevant records considered;
- `support`: `count / sampleSize`;
- `confidence`: a conservative bucket based on both sample size and support;
- `evidenceType: historical-correlation`.

For example:

```text
src/api/checkout.ts ↔ src/payments/ledger.ts
count: 3
sampleSize: 6
support: 0.5
confidence: medium
```

This means only that the files changed together in half of the six relevant stored records. It does not mean one depends on, calls, owns, or causes the other. A tiny sample cannot receive high confidence merely because every tiny-sample record contains the pair.

### Boundary co-change evidence

The same bounded calibration is applied to inferred project boundaries. Boundary names remain advisory because the boundary map itself is inferred from repository structure and imports.

### Verification patterns

CMI counts named verification evidence across matching completed changes and reports pass/fail frequency plus the fraction backed by `observed-command` metadata. Confidence is intentionally sample-sensitive.

CMI never executes those verification commands itself and never treats a reported pass as independently verified truth.

### Expected-vs-actual calibration

For completed records CMI compares:

```text
predicted path scope before editing
vs.
observed paths actually changed
```

It records path-level:

- `pathRecall`: fraction of observed changed paths that were predicted;
- `pathPrecision`: fraction of predicted paths that were actually changed;
- `pathF1`: harmonic mean of the two when defined.

Legacy aliases `changedPathCoverage` and `predictedScopeTouched` remain for compatibility. Aggregate history reports averages plus a confidence bucket based on the number of usable historical samples.

These are **path-overlap calibration metrics**, not compiler/runtime impact precision and recall. A correct implementation can affect files that never change, and an observed changed file can be incidental.

## Stale evidence integration

Durable source-linked memory is no longer retrieved as if stale state did not matter. Retrieval labels memory with evidence status and supports three policies:

- `demote` (default): stale evidence is explicitly labeled and heavily down-ranked;
- `include`: keep stale evidence visible with its stale reasons;
- `exclude`: omit stale/review/untracked memory from trusted retrieval.

Project-graph nodes are checked against their stored file fingerprint before being surfaced as current retrieval evidence. Changed or missing nodes are omitted from current graph context, and `status` / `doctor` expose graph drift so agents know to run `cmi scan`.

## Dirty worktrees

When a change starts from a clean Git worktree, CMI can strongly attribute new worktree paths and commits after the recorded HEAD.

When the worktree was already dirty, CMI marks attribution as `limited-preexisting-worktree`. Paths that were already dirty are reported separately as ambiguous instead of being silently credited to the current task.

For projects outside Git, attribution is `explicit-files-only` and CMI relies on paths supplied by the human or agent.

## Learning policy

Completion can produce learning candidates such as:

- a changed path missed by the predicted scope;
- a failed verification;
- observed unexpected impact.

Every candidate has status `proposal`. CMI does not automatically call `remember`, rewrite architecture decisions, or create mistakes from these signals.

The intended review flow is:

```text
observed evidence
→ learning candidate
→ human or explicitly reviewed agent analysis
→ durable fact / decision / mistake only when confirmed
```

This preserves the distinction between project history and project truth.

## Security and trust boundaries

Change records are local project data and should be reviewed before publication. Their content is untrusted input when later supplied to an AI coding agent.

CMI does not:

- execute source files to infer behavior;
- execute verification commands;
- store source diffs automatically;
- follow symbolic links while scanning;
- infer causality from historical co-change;
- write learning candidates into durable memory automatically;
- access the network to enrich change records.

This keeps the change-intelligence layer explainable, portable, and useful across unrelated project types.

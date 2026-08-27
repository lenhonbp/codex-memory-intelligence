# Change Intelligence

CMI change intelligence is a local, evidence-driven loop for coding agents. It is designed to make project-specific work improve over time without pretending that heuristic output is ground truth.

Change and session lifecycles are independent: session completion != Change completion. A Change remains `active` when implementation is intentionally partial, paused, or awaiting review, even after the work session closes. Complete the Change only when the requested work is finished; `abandoned` is the explicit terminal path for canceled work.

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
- user- or agent-supplied verification names, statuses, and provenance;
- completion outcome and unexpected impact;
- review-only learning candidates.

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

For an intentional partial checkpoint, preserve the active Change and record the session as partial. A `partial` Change outcome is progress evidence, not terminal completion:

```bash
cmi change complete <id> \
  --outcome partial \
  --verify "npm test=passed" \
  --note "Stopped before final integration for review."
cmi session close <session-id> --outcome partial
```

The Change remains active and appears under `activeChanges` in the closed-session handoff. Resume it in a later session and use a terminal outcome only when the requested work is actually finished.

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

### Completion-evidence assessment

CMI derives a bounded completion-evidence assessment from the Change record at read/format time. It distinguishes the actor's reported outcome from what the attached evidence supports: observed changed paths are implementation evidence, while verification is classified as missing, reported, observed, failed, or incomplete. A successful Change with only reported verification remains `unverified`; a valid passing `observed-command` with `exitCode=0` can make the bounded Change claim `supported`; and a failed verification contradicts a successful claim. For observed commands, a non-zero exit code conflicts with `status=passed`, while `exitCode=0` conflicts with `status=failed`; either contradiction is classified conservatively as failed evidence and cannot support a successful claim. This derived view does not execute commands, certify browser/device/live/release behavior, or change the durable Change schema.

The structured Change read model exposes this additive view as `completionEvidence`, and human `cmi change show` output renders the claim state, verification state, reasons, and gaps. Existing records, including sparse legacy records, remain readable and are assessed conservatively.

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

The `run_change_intelligence_loop` MCP prompt guides a connected agent through BEFORE → DURING → AFTER. Enabling writes does not authorize CMI to execute arbitrary project commands. The agent still runs tests, builds, profilers, migrations, or other tools through its normal environment and records only the resulting evidence status/provenance in CMI. The prompt distinguishes terminal Change completion from intentional partial progress so closing a session does not finalize an unfinished Change.

## Historical intelligence

`cmi change history` derives bounded evidence from completed records:

### Relevant completed changes

Records are ranked with deterministic token overlap across goals, observed files, boundaries, and reviewed completion notes. CMI does not use a remote model or network search for this ranking.

### File co-change evidence

If two paths repeatedly appear in the same completed change records, CMI reports a co-change edge with local support and sample size.

For example:

```text
src/api/checkout.ts ↔ src/payments/ledger.ts
count: 3
sample size: 8
support: 0.375
confidence: medium
```

Confidence is sample-sensitive. A pair appearing in every record of a tiny history does not receive high confidence merely because support is 100%.

This means only that the files changed together in stored records. It does not mean one depends on, calls, owns, or causes the other. The evidence type is explicitly `historical-correlation`.

### Boundary co-change evidence

The same bounded counting and sample-sensitive confidence are applied to inferred project boundaries. Boundary names remain advisory because the boundary map itself is inferred from repository structure and imports.

### Verification patterns

CMI counts named verification evidence across matching completed changes. Patterns expose totals, status counts, pass rate, and the fraction carrying supplied `observed-command` provenance.

Verification provenance has two classes:

- `reported`: a human or agent supplied the status;
- `observed-command`: the caller supplied bounded command-result metadata such as command, exit code, and observation time.

CMI never executes those verification commands itself. `observed-command` is stronger provenance metadata than an unlabeled report, but it is not independent attestation by CMI.

### Expected-vs-actual path calibration

For completed records CMI compares:

```text
predicted file scope before editing
vs.
observed paths actually changed
```

Per-record comparison and aggregated history expose:

- `pathRecall`: how much of the observed changed-path set was already inside the predicted file scope;
- `pathPrecision`: how much of the predicted file scope was directly changed;
- `pathF1`: harmonic mean of the two when both are defined;
- sample count and sample-sensitive calibration confidence.

Compatibility aliases from v0.7 (`changedPathCoverage`, `predictedScopeTouched`) remain available, but the path precision/recall names state the relationship more clearly.

These are not claims about complete runtime impact. A correct implementation can affect files that never change, and an observed changed file can be incidental.

## Dirty worktrees and Git edge cases

When a change starts from a clean Git worktree, CMI can strongly attribute new worktree paths and commits after the recorded HEAD.

When the worktree was already dirty, CMI marks attribution as `limited-preexisting-worktree`. Paths that were already dirty are reported separately as ambiguous instead of being silently credited to the current task.

For projects outside Git, attribution is `explicit-files-only` and CMI relies on paths supplied by the human or agent.

The v0.8 development line parses Git worktree status using NUL-delimited porcelain records. Rename/copy entries retain the destination path as `path` and, when present, the source path as `originalPath`; CMI does not store the human-formatted `old -> new` display string as a project path. Detached HEAD is represented explicitly as branch `detached` while commit identity remains available.

## Stale and lifecycle-aware preparation

Pre-change retrieval now distinguishes evidence freshness from reviewed memory lifecycle. Active stale/review memory remains labeled and down-ranked by default; deprecated, rejected, and superseded knowledge is excluded from normal task context unless explicitly requested for historical inspection.

See [Durable Memory Lifecycle](MEMORY_LIFECYCLE.md) for the lifecycle, refresh, supersession, and concurrent-writer contract.

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

Change records are runtime-validated when written/read, bounded during history reads, and locally serialized per record to reduce concurrent-writer corruption. Durable project memory uses a separate shared local writer lock for append/refresh/lifecycle mutations.

This keeps the change-intelligence layer explainable, portable, and useful across unrelated project types.

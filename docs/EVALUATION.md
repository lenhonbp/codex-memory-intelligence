# Real-Repository Evidence and Evaluation

CMI's evaluation layer exists to answer a narrower question than ordinary tests:

> What has actually been observed across real repositories and repeated project work, and what remains unproven?

It is intentionally not a benchmark leaderboard and does not convert a small field corpus into a production-readiness claim.

## Evidence classes

Every retained evaluation record must be explicitly classified:

- `external-real` — a real repository outside the CMI self-host repository. This is the only class counted as independent-repository evidence.
- `self-host` — the CMI repository evaluating itself. Useful for regression and dogfooding, but never counted as independent evidence.
- `synthetic` — deterministic fixtures or generated repositories. Useful for regression, never counted as real-repository validation.

There is no automatic promotion between these classes. Each record also carries a protocol: `observational` for ordinary field use or `controlled-stress` for deliberately induced edge cases. Controlled-stress records are visible in reports but do not inflate ordinary observational coverage.

## Capture

Run normal CMI project/session workflows first, then capture only bounded measurements:

```bash
cmi scan
cmi session start "review the current project state"
# inspect / work / verify
cmi session close latest --outcome investigated
cmi evaluate capture \
  --source-kind external-real \
  --repository-class application \
  --task-kind audit
```

Use `--session none` for project-only evidence when no closed work session should be associated.

Review metadata is explicit and optional. An unreviewed record cannot assert usefulness or false-positive/missed-finding counts. A reviewed record must also declare whether the reviewer was a `human` or an `agent`; those metrics are aggregated separately:

```bash
cmi evaluate capture \
  --source-kind external-real \
  --repository-class service \
  --task-kind debugging \
  --review-outcome partial \
  --review-provenance human \
  --false-positive-findings 0 \
  --missed-findings 1 \
  --next-action-rating useful \
  --handoff-rating useful
```

## Privacy and retained shape

Evaluation records live under `.codex-memory/evaluations/` and intentionally omit:

- repository names;
- raw Git remotes;
- absolute local paths;
- session goals and notes;
- finding text;
- recommendation text;
- source contents and diffs.

Runs are grouped using a one-way SHA-256 repository fingerprint derived from the Git origin when available, otherwise from the local root. The digest is useful for grouping repeated runs but is not a security boundary or an anonymization guarantee against an attacker who already knows the candidate repository identity. Every record also stores the CMI semantic version and, when CMI is running from a Git checkout, its exact source revision so evidence from different candidates is not silently mixed.

## Reporting

```bash
cmi evaluate list
cmi evaluate report
cmi evaluate report --source-kind external-real
cmi evaluate show <id>
```

The report keeps source classes separate and exposes descriptive coverage states:

- `none`
- `synthetic-only`
- `self-host-only`
- `external-single-repository`
- `external-multi-repository`
- `external-multi-repository-multi-context`

These states describe corpus coverage only. They do not mean "validated", "production ready", or "v1.0 ready".

Usefulness rates are reported only from explicitly reviewed observational `external-real` records. Human-reviewed and agent-reviewed rates remain separate. Behavioral confidence thresholds are not recalibrated automatically from evaluation data.

## Controlled real-repository stress

A `controlled-stress` record must identify one bounded scenario and invariant counts. The record does not retain arbitrary scenario prose. Supported scenarios are `rename-after-scan`, `history-rewrite`, `dirty-worktree`, `clock-skew`, `interrupted-session`, `concurrent-sessions`, `large-monorepo`, `corrupt-durable-record`, and `stale-graph`.

Capture example:

```bash
cmi evaluate capture \
  --source-kind external-real \
  --protocol controlled-stress \
  --repository-class library \
  --task-kind verification \
  --session none \
  --stress-scenario stale-graph \
  --stress-expected 3 \
  --stress-passed 3 \
  --stress-failed 0
```

`pass`, `partial`, or `fail` is derived from the invariant counts; callers cannot supply a more favorable stress outcome. Observational records reject stress fields. Reports aggregate stress scenario coverage and invariant pass rate separately from ordinary field coverage.

## Runtime contract

`schemas/evaluation-record.schema.json` documents the durable format and repository quality checks keep trust-critical enums/version fields aligned with the runtime validator.

The current schema version is `1`.

## What remains empirical

The evaluation harness creates a disciplined place to collect evidence. It does not itself prove:

- that historical verification recommendations improve agent choices;
- that session handoffs reduce reconstruction effort;
- that next-action intelligence reduces user follow-up questions;
- that current confidence or priority thresholds are well calibrated;
- that CMI behaves well across large, rename-heavy, rebased, clock-skewed, or long-lived repositories;
- that CMI is production-ready across clients, languages, architectures, and operating systems.

Those claims require enough independent real-repository/task observations and explicit review data.

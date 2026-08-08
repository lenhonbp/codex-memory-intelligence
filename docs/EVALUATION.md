# Real-Repository Evidence and Evaluation

CMI's evaluation layer exists to answer a narrower question than ordinary tests:

> What has actually been observed across real repositories and repeated project work, and what remains unproven?

It is intentionally not a benchmark leaderboard and does not convert a small field corpus into a production-readiness claim.

For a controlled comparison of **plain Codex/Git/search** versus **Codex + CMI**, including paired-task design, contamination controls, raw outcome measures, and interpretation rules, see [Empirical Validation Protocol](EMPIRICAL_VALIDATION.md).

## Evidence classes

Every retained evaluation record must be explicitly classified:

- `external-real` — a real repository outside the CMI self-host repository. This is the only class counted as independent-repository evidence by CMI's reporting taxonomy.
- `self-host` — the CMI repository evaluating itself. Useful for regression and dogfooding, but never counted as independent evidence.
- `synthetic` — deterministic fixtures or generated repositories. Useful for regression, never counted as real-repository validation.

There is no automatic promotion between these classes. Each record also carries a protocol: `observational` for ordinary field use or `controlled-stress` for deliberately induced edge cases. Controlled-stress records are visible in reports but do not inflate ordinary observational coverage.

### Attestation boundary

The evaluation layer validates durable record shape, preserves provenance labels, derives bounded metrics, and prevents source/reviewer/protocol classes from being silently merged. It does **not** authenticate the caller's real-world identity or independently witness the external environment.

Therefore:

- `sourceKind: external-real` is caller-attested unless an external study process independently verifies repository provenance;
- `reviewProvenance: human|agent` identifies the declared reviewer class; CMI itself does not authenticate whether the caller is human or independent;
- controlled-stress `pass|partial|fail` is derived from supplied invariant counts, so callers cannot override those counts with a more favorable outcome, but CMI does not itself execute the scenario or prove the counts occurred;
- a repository fingerprint based on local root provides stable grouping without claiming that the repository is externally independent.

Reports may use the existing taxonomy to keep classes separate, but strong product claims must describe the underlying assurance accurately: **caller-attested field evidence** is not the same as **independently witnessed validation**.

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

Those fields remain explicit reviewer judgments. They should not be described as independent human review unless the study process separately establishes that assurance.

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

These states describe corpus coverage only. They do not mean "validated", "production ready", or "v1.0 ready". In particular, the word `external` reflects the record's declared source class unless a separate study process verifies provenance.

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

The controlled-stress record is a **recording/derivation contract**, not a scenario runner. Independent assurance requires an external harness or reviewer to execute/witness the scenario and validate the supplied counts.

## Post-hoc usefulness review

Capture and review are separate operations. Field runs should normally be captured as `unreviewed`, then rated later by an explicit reviewer:

```bash
cmi evaluate review <id> \
  --review-outcome pass \
  --review-provenance human \
  --next-action-rating useful \
  --handoff-rating useful \
  --false-positive-findings 0 \
  --missed-findings 0
```

A review is one-time. CMI serializes competing review writers with an owner-tagged lease and refuses to overwrite an existing review. The review operation changes only the `review` block; captured repository measurements, source/protocol class, stress evidence, subject revision, and task identity remain immutable. Human and agent review metrics continue to aggregate separately.

Generated project index/graph caches use a larger bounded read ceiling than 1 MB durable evaluation/change/session records. This prevents large repositories from writing a graph that CMI cannot subsequently read while preserving finite cache reads.

## Longitudinal human-reviewed outcomes

Post-hoc review can explicitly record four longitudinal outcomes in addition to next-action/handoff usefulness:

- `--reconstruction-rating reduced|unchanged|increased|not-applicable|unknown` — whether the captured handoff reduced project-state reconstruction effort;
- `--follow-up-outcome not-needed|needed|not-applicable|unknown` — whether the captured next action avoided a separate "what next?" follow-up;
- `--history-rating useful|not-useful|not-applicable|unknown` — whether captured historical change evidence was useful;
- `--verification-choice-outcome improved|unchanged|worse|not-applicable|unknown` — whether history-informed evidence improved the verification decision.

These are explicit reviewer judgments. CMI never infers them from session text. Reconstruction/follow-up judgments require the corresponding captured handoff/next-action evidence. History/verification-choice judgments require at least one completed change-history record in the captured measurements. Controlled-stress records cannot assert ordinary longitudinal outcomes.

```bash
cmi evaluate review <id> \
  --review-outcome pass \
  --review-provenance human \
  --reconstruction-rating reduced \
  --follow-up-outcome not-needed \
  --history-rating useful \
  --verification-choice-outcome improved
```

Reports aggregate declared human and declared agent outcomes separately. Repeated-repository metrics count only observational `external-real` evidence and report the number of repositories with 2+ observations, repeated records, repeated multi-task repositories, and repeated time span.

```bash
cmi evaluate report --source-kind external-real --since-days 90
cmi evaluate report --task-kind debugging
cmi evaluate report --subject-version 0.9.0
```

`evidenceDiagnostics` is deliberately structural. It reports which evidence dimensions are still missing (multi-repository repetition, human repeated reviews, reconstruction/follow-up/history/verification judgments, multi-task repetition). It never declares statistical sufficiency and never enables automatic confidence/priority recalibration.

## Portable local corpus

Longitudinal evidence often lives in separate repositories. CMI therefore supports a bounded local bundle rather than requiring a database or cloud service:

```bash
cmi evaluate export ./cmi-evidence.json --source-kind external-real
cmi evaluate import ./other-project-evidence.json
cmi evaluate report --source-kind external-real
```

A bundle contains only validated anonymized evaluation records. Export refuses to overwrite an existing file and refuses to write inside `.codex-memory`. Import validates the entire bundle before writing, skips identical IDs, and fails closed if an existing ID contains different evidence. Original source/protocol/reviewer provenance is preserved; import never upgrades `agent` or `unreviewed` evidence to human evidence. Bundle reads are bounded to 16 MiB and reject symlink/non-regular inputs.

## Runtime contract

`schemas/evaluation-record.schema.json` documents the durable format and repository quality checks keep trust-critical enums/version fields aligned with the runtime validator.

The current schema version is `1`.

## What remains empirical

The evaluation harness creates a disciplined place to collect evidence. It does not itself prove:

- that historical verification recommendations improve agent choices;
- that session handoffs reduce reconstruction effort;
- that next-action intelligence reduces user follow-up questions;
- that current confidence or priority thresholds are well calibrated;
- that the currently observed controlled stress results generalize to all large, rename-heavy, rebased, clock-skewed, or long-lived repositories;
- that CMI is production-ready across clients, languages, architectures, and operating systems;
- that a declared external repository or reviewer identity has been independently authenticated;
- that CMI outperforms plain Codex/Git/search without a controlled comparison.

Those claims require enough independent real-repository/task observations, explicit review data, and an evaluation process whose provenance assurance matches the claim. Use [Empirical Validation Protocol](EMPIRICAL_VALIDATION.md) for that comparison instead of converting engineering regression results into a productivity claim.

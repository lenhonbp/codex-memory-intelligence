# Codex Memory + Project Intelligence

[![CI](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/ci.yml/badge.svg)](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/ci.yml)
[![CodeQL](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/codeql.yml/badge.svg)](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/codeql.yml)
[![npm version](https://img.shields.io/npm/v/codex-memory-intelligence.svg)](https://www.npmjs.com/package/codex-memory-intelligence)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-green.svg)](package.json)

A local-first project memory, dependency intelligence, impact analysis, evidence-driven change intelligence, and session-continuation layer for Codex and other AI coding agents.

CMI helps an agent answer these questions before, during, and after project work:

1. **What has the team already learned or decided?**
2. **Which files, symbols, workspaces, and inferred boundaries are connected to this change?**
3. **What is the current Git baseline?**
4. **What could be affected, and how complete is that inference?**
5. **Which reviewed project knowledge is missing?**
6. **Which verification work should happen before the change is considered complete?**
7. **What actually changed in similar work before, and what did earlier predictions miss?**
8. **What happened in the current work session, what remains unresolved, and what should happen next?**
9. **What has CMI actually demonstrated across real repositories, and which claims are still unsupported?**

Everything stays in a human-reviewable `.codex-memory/` directory. There is no cloud service, API key, database, telemetry, remote model, or network enrichment requirement.

> Codex Memory Intelligence is an independent open-source project and is not affiliated with or endorsed by OpenAI.

## Current status

`v0.9.2` is the current public release line for **Evidence Integrity + Real-Repository Evaluation**. The published package includes unified evidence health, Git-history continuity guardrails, runtime durable-contract validation, controlled external-real stress evidence, post-hoc review, longitudinal human/agent evaluation outcomes, repeated-repository aggregation, and portable anonymized evaluation corpus exchange. It does not include the portable project-evidence or executable-provenance commands added after the `v0.9.2` tag. The npm badge above remains the authoritative indicator of the version currently published to the registry.

Current `main` contains unreleased v0.10.0 work, including portable project evidence, executable provenance, and Phase 2 operational UX/readiness changes. Install `v0.9.2` from npm for the public release contract; do not infer current-main commands from that package.

Source metadata can briefly lead registry publication during a reviewed release preparation; install availability should always be checked against the npm badge rather than inferred from the repository version alone.

See [Evidence Integrity](docs/EVIDENCE_INTEGRITY.md), [Real-Repository Evaluation](docs/EVALUATION.md), [Change Intelligence](docs/CHANGE_INTELLIGENCE.md), [Session Continuation Intelligence](docs/SESSION_INTELLIGENCE.md), [Durable Memory Lifecycle](docs/MEMORY_LIFECYCLE.md), [Roadmap](ROADMAP.md), and [Changelog](CHANGELOG.md) for storage contracts, evidence limits, and release status.

Static parsing and inferred architecture remain best effort rather than compiler-grade analysis. Historical co-change is correlation, not causality. CMI never treats an observed changed path as proof of complete runtime impact, never treats a recommendation as business truth, and never turns learning candidates into durable project truth automatically.

## Install

Install the public npm package globally:

```bash
npm install -g codex-memory-intelligence
cmi --version
```

Or install it in one project and run it through `npx`:

```bash
npm install --save-dev codex-memory-intelligence
npx cmi --version
```

Requires Node.js 22 or newer.

## Quick start

```bash
# A fresh project is intentionally blocked until it has durable state and a scan.
cmi doctor
cmi init
cmi scan
cmi remember fact "Production runs on the documented hosting platform"
cmi remember decision "Schema changes must use versioned migrations" --source package.json
cmi context "change the account migration"
cmi prepare "change the account migration"
cmi impact migrate
cmi stale
cmi snapshot before-refactor
cmi status
```

A second unchanged `cmi scan` reuses previously parsed source nodes. Use `cmi scan --full` after parser/configuration experiments or when you deliberately want a complete rebuild.

## Pre-change intelligence

CMI can assemble a bounded, evidence-labeled brief before an agent edits code:

```bash
cmi baseline
cmi boundaries
cmi memory-gaps "add retry-safe payment processing"
cmi prepare "add retry-safe payment processing"
```

The brief combines:

- bounded Git branch, commit, worktree, upstream, and ahead/behind context;
- ranked durable memory and relevant graph files;
- deterministic boundary inference from workspaces, directory structure, and import edges;
- exact impact analysis when a file or symbol matches, with clearly labeled context-seed fallback otherwise;
- review-only proposals for missing facts, decisions, and lessons;
- risk and verification suggestions derived from observable task and path evidence.

CMI does not claim inferred boundaries are declared architecture. Durable memory still requires an explicit write-enabled process and review.

## Memory evidence and lifecycle

In v0.8.1, durable memory keeps **lifecycle**, **source freshness**, and **semantic review provenance** distinct.

Reviewed lifecycle states are `active`, `deprecated`, `rejected`, and `superseded`. Inactive knowledge remains in the human-reviewable Markdown history but is excluded from normal ranked task context. Supersession requires a distinct active replacement entry.

```bash
cmi memory-state <id> deprecated --reason "Policy was replaced" --changed-by reviewer
cmi memory-state <old-id> superseded --reason "New decision replaces it" --superseded-by <new-id>
```

Active memory can separately become stale when source/project evidence changes. Retrieval supports three explicit policies:

```bash
cmi search "retry policy" --stale-policy demote
cmi search "retry policy" --stale-policy exclude
cmi search "retry policy" --include-inactive --stale-policy include
```

`demote` is the default: stale/review evidence remains visible but is strongly down-ranked and labeled. `exclude` is strict-current mode. `include` is intended for explicit historical inspection. `cmi refresh-memory` refreshes source/project fingerprints only; use an explicit `cmi memory-state <id> active --reason ... --changed-by ...` attestation when knowledge has actually been semantically reviewed. See [Durable Memory Lifecycle](docs/MEMORY_LIFECYCLE.md).

## Change Intelligence Loop

The v0.7 change-intelligence layer preserves evidence across real coding tasks:

```text
BEFORE  understand + predict + retrieve relevant history
DURING  observe changed paths + compare predicted scope
AFTER   record outcome + verification evidence + unexpected impact
```

Start a record before editing:

```bash
cmi change start "add retry-safe payment processing"
```

Observe meaningful progress:

```bash
cmi change observe <id>
```

After the agent or human has actually run the project's verification commands, complete the record:

```bash
cmi change complete <id> \
  --outcome succeeded \
  --verify "npm test=passed" \
  --verify "payment retry integration=passed"
```

Inspect local project history:

```bash
cmi change show <id>
cmi change list --status completed
cmi change history "payment retry"
```

Completed records can provide relevant previous changes, repeated file/boundary co-change, verification history, and expected-vs-actual changed-path calibration. These are historical signals, not causal claims. CMI does not execute tests, builds, profilers, migrations, or project code on behalf of the change-intelligence layer.

v0.8.0 distinguishes ordinary `reported` verification from supplied `observed-command` metadata. `observed-command` still means only that command-result metadata was provided through the interface; CMI does not independently execute or attest that command.

Change records live in `.codex-memory/changes/` and are intentionally reviewable and commit-friendly. CMI-internal paths are excluded from product-change scope so the records do not observe themselves.

See [Change Intelligence](docs/CHANGE_INTELLIGENCE.md) for attribution rules, non-Git behavior, limitations, and the learning policy.

## Session Continuation Intelligence

v0.8.0 adds a layer above individual code changes so CMI can answer:

> **What happened, what is still unresolved, and what should happen next?**

The intended operating model is:

```text
TRACK → UNDERSTAND → SURFACE → RECOMMEND → CONTINUE
```

A session can be implementation, debugging, audit, code review, verification, research, or a no-code investigation.

```bash
cmi session start "investigate authentication retries"
cmi session observe latest --accomplished "Mapped retry flow" --question "Who owns retries?"
cmi session status latest
cmi session close latest --blocker "Worker retry ownership is unresolved"
```

`cmi session close` does not stop at a generic summary. It returns:

- a conservative outcome (`succeeded`, `partial`, `blocked`, `investigated`, `abandoned`, or `unknown`);
- problems and unresolved findings;
- evidence-linked P0–P3 next actions;
- one explicit highest-priority `nextAction`;
- review-only knowledge candidates;
- a bounded handoff for the next AI/user session.

Persistent findings live in `.codex-memory/findings.json`, so an unresolved blocker or verification gap does not disappear when chat context ends:

```bash
cmi finding list --status open
cmi finding show <id>
cmi finding state <id> resolved --reason "Verified migration order" --changed-by reviewer
```

A later agent can continue without asking the user to reconstruct the project state:

```bash
cmi session handoff latest
```

CMI can auto-resolve deterministic health findings when their measured condition disappears, but explicit blockers/questions remain review-controlled. Historical verification suggestions are labeled correlation rather than fact. See [Session Continuation Intelligence](docs/SESSION_INTELLIGENCE.md).

## Real-repository evaluation

The v0.9.x line adds the real-repository evaluation foundation while keeping field evidence separate from ordinary regression tests and exposing the same contract through CLI plus the session-aware MCP adapter. Capture explicitly classified runs after scanning and, when relevant, closing a work session:

```bash
cmi evaluate capture --source-kind self-host --repository-class cli-tool --task-kind audit
cmi evaluate capture --source-kind external-real --repository-class application --task-kind debugging
cmi evaluate report
cmi evaluate review <id> --review-outcome pass --review-provenance human --reconstruction-rating reduced --follow-up-outcome not-needed
cmi evaluate report --source-kind external-real --since-days 90
cmi evaluate export ./cmi-evidence.json --source-kind external-real
cmi evaluate import ./other-project-evidence.json
```

Only `external-real` contributes to independent-repository counts. Observational runs drive ordinary field-coverage state, while `controlled-stress` remains visible but cannot inflate that state. `self-host` and `synthetic` cannot silently inflate real-world coverage. Evaluation records bind measurements to the CMI semantic version and, when available, exact source revision; they store a one-way repository fingerprint rather than repository names, remotes, absolute paths, session/finding/recommendation text, source contents, or diffs. Human and agent review provenance is explicit and aggregated separately. Longitudinal reports can measure repeated-repository reconstruction, follow-up, history-usefulness, and verification-choice judgments, while structural evidence diagnostics never declare statistical sufficiency, production readiness, v1.0 readiness, or automatic threshold recalibration. Portable bundles let separate repositories contribute validated anonymized records without a database or cloud service. See [Real-Repository Evaluation](docs/EVALUATION.md).

## Monorepos and workspaces

CMI detects npm/pnpm workspaces, Cargo workspace members, and Go workspaces/modules.

```bash
cmi workspaces
cmi context "authentication flow" --workspace packages/web
cmi prepare "change authentication flow" --workspace packages/web
cmi search "shared API" --workspace @company/core
```

Graph nodes carry workspace IDs, impact analysis reports affected workspaces, and cross-workspace edges are counted separately.

## Ignore semantics

Create a root `.cmiignore` file using gitignore-style patterns:

```gitignore
# Generated code
generated/
*.snapshot.json

# Re-include one file
!important.snapshot.json
```

Explain any decision:

```bash
cmi explain-ignore generated --directory
cmi explain-ignore important.snapshot.json --json
```

Built-in dependency/generated paths and symbolic links cannot be re-included. Hidden paths such as `.env` are excluded by default, while root `.github/` and `.cmiignore` remain visible for repository intelligence. See [Ignore semantics](docs/IGNORE.md).

## Commands

```text
cmi init [path]
cmi scan [path] [--full] [--json]
cmi graph [path] [--json]
cmi workspaces [path] [--json]
cmi baseline [path] [--json]
cmi boundaries [path] [--json]
cmi explain-ignore <path> [--directory] [--json]
cmi search <query> [--limit N] [--workspace name-or-path] [--stale-policy demote|include|exclude] [--include-inactive] [--json]
cmi context <query> [--limit N] [--workspace name-or-path] [--stale-policy demote|include|exclude] [--include-inactive] [--json]
cmi prepare <change-goal> [--limit N] [--depth N] [--workspace name-or-path] [--json]
cmi memory-gaps <query> [--limit N] [--workspace name-or-path] [--json]
cmi impact <file-or-symbol> [--depth N] [--json]
cmi change start <goal> [--limit N] [--depth N] [--workspace name-or-path] [--json]
cmi change observe <id> [--file path ...] [--json]
cmi change complete <id> [--outcome succeeded|failed|partial|abandoned|unknown] [--file path ...] [--verify name=status ...] [--unexpected text ...] [--note text ...] [--json]
cmi change show <id> [--json]
cmi change list [--status active|completed] [--limit N] [--json]
cmi change history [query] [--limit N] [--json]
cmi session start <goal> [--note text ...] [--json]
cmi session observe <id|latest> [--file path ...] [--accomplished text ...] [--blocker text ...] [--decision text ...] [--question text ...] [--json]
cmi session status <id|latest> [--json]
cmi session close <id|latest> [--outcome succeeded|partial|blocked|investigated|abandoned|unknown] [--file path ...] [--accomplished text ...] [--blocker text ...] [--decision text ...] [--question text ...] [--json]
cmi session show <id|latest> [--json]
cmi session list [--status active|closed] [--limit N] [--json]
cmi session handoff <id|latest> [--json]
cmi finding list [--status open|resolved|accepted|dismissed|superseded] [--limit N] [--json]
cmi finding show <id> [--json]
cmi finding state <id> <open|resolved|accepted|dismissed|superseded> --reason text [--changed-by name] [--superseded-by id] [--json]
cmi evaluate capture --source-kind <external-real|self-host|synthetic> [--protocol observational|controlled-stress] [--repository-class class] [--task-kind kind] [--session latest|none|id] [--review-outcome pass|partial|fail|unreviewed] [--review-provenance human|agent|unreviewed] [--false-positive-findings N] [--missed-findings N] [--next-action-rating useful|not-useful|unknown] [--handoff-rating useful|not-useful|unknown] [--json]
cmi evaluate review <id> --review-outcome <pass|partial|fail> --review-provenance <human|agent> [--reconstruction-rating reduced|unchanged|increased|not-applicable|unknown] [--follow-up-outcome not-needed|needed|not-applicable|unknown] [--history-rating useful|not-useful|not-applicable|unknown] [--verification-choice-outcome improved|unchanged|worse|not-applicable|unknown] [--json]
cmi evaluate list [--source-kind external-real|self-host|synthetic] [--task-kind kind] [--subject-version version] [--since-days N] [--limit N] [--json]
cmi evaluate show <id> [--json]
cmi evaluate report [--source-kind external-real|self-host|synthetic] [--task-kind kind] [--subject-version version] [--since-days N] [--json]
cmi evaluate export <file> [--source-kind kind] [--task-kind kind] [--subject-version version] [--since-days N] [--json]
cmi evaluate import <file> [--json]
cmi remember <fact|decision|mistake> <text> [--source path ...]
cmi memory-state <id> <active|deprecated|rejected|superseded> --reason text [--changed-by name] [--superseded-by id] [--json]
cmi stale [path] [--fail-on stale|review|any] [--json]
cmi refresh-memory <id|all> [--refreshed-by name] [--reason text]
cmi snapshot [label]
cmi status [path] [--json]
cmi doctor [path] [--json]
cmi mcp-config [--write] [--bulk-refresh]
cmi --version
```

The following commands are present in current `main` as unreleased v0.10.0 work and are not included in the public npm `v0.9.2` package:

```text
cmi provenance [--json]
cmi evidence freeze <bundle-path> [--json]
cmi evidence inspect <bundle-path> [--json]
cmi evidence restore <bundle-path> [--json]
cmi evidence rebind <bundle-path> [--json]
```

## Current main / unreleased v0.10.0: portable evidence and executable provenance

In the current checkout, freeze the current `.codex-memory` state into a bounded directory bundle whose manifest contains path-independent source-content identity, Git repository/revision evidence when observable, CMI version/source provenance, a deterministic artifact inventory, and SHA-256 digests. These commands are not available from npm `v0.9.2`:

```bash
cmi evidence freeze ../cmi-evidence-freeze --json
cmi evidence inspect ../cmi-evidence-freeze --json
cmi evidence restore ../cmi-evidence-freeze --json
cmi evidence rebind ../cmi-evidence-freeze --json
```

Restore and rebind verify the frozen source/scan policy before writing. A same-state restore is `exact`; a compatible checkout at another path is `compatible-relocated`; a clean checkout proven by exact Git repository/revision evidence with bounded LF compatibility is `compatible-git-checkout`; a destination with unavailable Git identity may be reported as `compatible-content-only`. Mismatches, policy drift, dirty-worktree evidence, corrupted manifests/artifacts, unsafe paths, symlinks, blocked evidence, and existing conflicting destinations fail closed. Existing evidence is never silently overwritten. Rebind records the original identity, requested operation, and verification result in `.codex-memory/portable-provenance.json` without changing semantic memory-review provenance.

Portable evidence is a local, digest-verified transport format, not an authenticated backup or proof of source authorship. CMI does not export source files, but it refuses to freeze obvious credential-like content in intended evidence files. The manifest freezes a bounded, validated scan/ignore policy plus resolver/workspace inputs so a clean checkout without `.codex-memory` can reproduce the same source boundary. Source identity is byte-exact unless exact Git repository/revision and clean-worktree evidence justify the narrower UTF-8 LF checkout-compatibility identity; content-only destinations reject newline-only byte changes.

To diagnose which installation is actually running:

```bash
cmi provenance --json
```

The report identifies the runtime executable/script, resolved package root/version, install and invocation kind, source checkout revision/dirty state when observable, project-local candidates, and ambiguity/limitations. It never substitutes the current working directory's `package.json` for the invoked package.

## MCP integration

Generate the safe default configuration:

```bash
cmi mcp-config
```

The default exposes read-only durable history, project/session state, open findings, handoff data, and advisory intelligence. Scanning remains available because it only refreshes generated project intelligence caches.

Enable durable project writes explicitly when you want a connected agent to create change records, reviewed durable memory, or session/finding records:

```bash
cmi mcp-config --write
```

The session-aware MCP endpoint retains all existing CMI tools and additionally exposes work-session status/report/list/handoff/findings tools. With writes enabled it adds `start_work_session`, `observe_work_session`, `finalize_work_session`, and `set_project_finding_state`.

It also exposes:

- `cmi://project/session/latest`;
- `cmi://project/session-handoff/latest`;
- `cmi://project/findings`;
- `close_project_session` prompt;
- `continue_from_session_handoff` prompt.

MCP initialization tells compliant agents to finalize substantial work and surface P0/P1 findings plus the highest-priority next action before ending, so the user does not have to ask what comes next. This is guidance, not a universal session-end hook: a client that ignores MCP instructions cannot be forced to call the finalizer.

The interface does **not** authorize CMI to execute arbitrary project commands. Tests and other verification remain the responsibility of the agent/user environment.

Bulk memory refresh requires a second opt-in:

```bash
cmi mcp-config --write --bulk-refresh
```

See [MCP integration](docs/MCP.md) and [Session Continuation Intelligence](docs/SESSION_INTELLIGENCE.md).

## Security model

- Project scanning never follows symbolic links.
- Source-linked memory accepts regular files only and verifies real paths remain inside the project.
- Built-in dependency and generated paths cannot be negated through `.cmiignore`.
- Hidden paths are excluded by default except root `.github/` and `.cmiignore`.
- Git baseline collection uses fixed bounded commands and does not expose absolute local repository paths.
- Stale/missing graph nodes are not returned as current graph evidence before a rescan.
- Active stale/review memory is evidence-labeled and policy-controlled; inactive lifecycle states are excluded from normal retrieval.
- Reviewed memory mutations reject ambiguous ID prefixes and preserve lifecycle audit metadata instead of silently deleting history.
- Durable storage rejects a symlinked `.codex-memory` root and unsafe durable read/write targets; bounded reads use opened-handle identity checks where applicable.
- Durable memory append/refresh/lifecycle mutations share owner-tagged heartbeat leases with owner-checked cleanup to reduce concurrent-writer loss.
- CMI-internal paths are excluded from observed product/session scope.
- Boundary, risk, memory-gap, co-change, finding recommendations, and learning-candidate outputs are advisory rather than durable truth.
- Historical co-change and historical verification patterns are correlation only; confidence is evidence/sample-sensitive.
- Change and session intelligence do not execute verification commands or store source diffs automatically.
- Change/session-history reads are bounded; session/change records reject unsafe symlinked reads where supported.
- User-supplied durable text receives best-effort secret-pattern/credential-shape checks, but CMI is not DLP, a complete secret scanner, or a security boundary.
- MCP durable project writes are disabled by default.
- Bulk memory refresh requires a separate opt-in.
- Repository content, durable memory, change records, session records, and findings remain untrusted input for connected agents.

Review `.codex-memory/` before publishing it. Generated `project-index.json`, `project-graph.json`, and `snapshots/` are ignored by default; durable Markdown knowledge, configuration, change records, session records, and findings remain human-reviewable.

## Parser scope

CMI uses bounded, dependency-free static parsing for common JavaScript/TypeScript, Python, Go, Rust, and related files. Current coverage includes TypeScript `paths` aliases, Python absolute-package heuristics, Go module imports, and Rust `mod`/`crate::`/`self::`/`super::` resolution.

Aliases inherited through complex `extends` chains, generated code, runtime imports, macros, reflection, build-system rewrites, and dependency injection may not resolve completely. Go package imports are represented by a deterministic source-file node rather than a compiler package graph.

## Development

```bash
npm run verify
npm run benchmark:smoke
npm run package:smoke
```

CI runs on Ubuntu, macOS, and Windows with Node.js 22 and 24. A separate benchmark smoke job checks incremental reuse and release metadata. CodeQL scans JavaScript and GitHub Actions workflows.

Community documents: [Contributing](CONTRIBUTING.md), [Code of Conduct](CODE_OF_CONDUCT.md), [Governance](GOVERNANCE.md), [Support](SUPPORT.md), [Security](SECURITY.md), [Maintainers](MAINTAINERS.md), [Architecture](docs/ARCHITECTURE.md), [Evidence Integrity](docs/EVIDENCE_INTEGRITY.md), [Real-Repository Evaluation](docs/EVALUATION.md), [Change Intelligence](docs/CHANGE_INTELLIGENCE.md), [Session Continuation Intelligence](docs/SESSION_INTELLIGENCE.md), [Durable Memory Lifecycle](docs/MEMORY_LIFECYCLE.md), and [Releasing](docs/RELEASING.md).

## License

MIT

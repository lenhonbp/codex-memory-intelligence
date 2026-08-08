# CMI v1.0 Readiness Audit

Phase 3 backward-compatibility, migration-evidence, and empirical-record reconciliation audit. This document records the state of the repository at the Phase 3 starting baseline and is not a v1.0 declaration.

Audit date: 2026-08-09 (Asia/Ho_Chi_Minh)
Phase 3 starting baseline: `58c0ade19e71b75439c975fabb9d79353931a0c3` (`main`)
Implementation branch: `feat/v0.10-phase3-migration-compat`
Public/package version: `0.9.2`
Phase 3 target: `v0.10.0` readiness review; no tag, publish, or release is authorized by this audit.

## Executive disposition

There is no known engineering P0 or P1 blocker within the audited Phase 3 scope. The compatibility fixtures and runtime checks cover the representative released persistence floor without requiring a general migration command; future and corrupt formats remain fail-closed. This is not a claim of production readiness, v1.0 readiness, statistical sufficiency, or CMI productivity value.

The recommendation is `READY_FOR_TECH_LEAD_REVIEW` for this Phase 3 branch. Empirical studies remain explicitly classified below, and missing repository-side ledger state is not converted into positive product evidence.

## Readiness matrix

| Area | Status | Evidence at audit | Remaining gate or limitation |
| --- | --- | --- | --- |
| Evidence boundaries and fail-closed behavior | Ready for audited scope | Phase 1 evidence/provenance work at PR #31; targeted corruption, unsafe path, stale graph, blocked memory, and mismatch tests | Preserve no-write behavior for every future recovery path |
| Fresh-project CLI diagnostics | Ready for Phase 2 review | Disposable worktree dogfood; `status`, `doctor`, search/context, prepare, and impact exercised before init/scan | Keep human and JSON exit/action contracts synchronized |
| Generated-state repository hygiene | Ready for Phase 2 review | Baseline ignores only `.codex-memory/` paths reported by Git as untracked `??`; tracked, staged, and renamed CMI paths remain visible, with regression coverage | Other tools must continue to treat local untracked CMI state as local evidence, not project source |
| Portable evidence transport | Ready for audited scope | Freeze/inspect succeeded on a clean disposable worktree; mismatch, corruption, traversal, symlink, destination-conflict, relocation, and rebind paths are covered by tests | SHA-256 is integrity checking, not authentication or source authorship proof |
| Executable provenance | Ready for audited scope | CLI/MCP parity and package-install fixtures are covered by Phase 1 tests | Install ambiguity remains an explicit diagnostic limitation |
| MCP read-only/write gate | Ready for audited scope | Safe tool discovery and direct-call bypass tests; write tools require explicit `CMI_WRITE_ENABLED=1` | Recheck the gate on every newly added mutating tool |
| CLI/MCP contract parity | Ready for Phase 3 review | Shared runtime contracts and existing parity tests; matrix below records the public surface | Add a deprecation policy before promising v1 stability |
| Durable persistence compatibility | Not yet evidenced for v1 | [`PERSISTENCE_COMPATIBILITY.md`](PERSISTENCE_COMPATIBILITY.md), seven provenance-recorded fixture families, 9 compatibility tests, future/corrupt no-overwrite checks, and full-suite coverage across config, memory, graph/index, changes, sessions, findings, and evaluations | Ready for audited historical range; broader release/version support, portable predecessor policy, and v1 stability decision remain open |
| Security and parser safety | Ready for audited scope | Symlink/path/TOCTOU and strict JSON regression coverage; CodeQL is a supporting hosted gate | Heuristic parsers remain advisory, not compiler-grade |
| Performance | Non-blocking follow-up | Incremental scan and benchmark smoke paths exist; no material regression observed in this audit | Record a reproducible baseline if performance becomes a v1 claim |
| Release/package hygiene | Ready for current public line | npm latest and package metadata remain `0.9.2`; publish workflow has successful trusted-publish runs for the public line | No `v0.10.0` release is part of Phase 3 |
| Cross-platform hosted verification | Ready for audited scope | PR #34 head `a8abdc0` passed workflow run `31271425009` across Ubuntu/macOS/Windows × Node 22/24; release metadata job `93137961793`; CodeQL analyze run `31271425018` / job `93137961763` and CodeQL check `93138062859` passed | Preserve this gate on subsequent code changes |
| Empirical product value | Not yet evidenced | Study 002 remains descriptive-only; Study 001 remains incomplete; Study 003 has a preserved hosted descriptive record with an explicit protocol deviation but an unreconciled repository-side ledger | Do not claim productivity impact or v1 readiness from these studies |

Status meanings: `Ready for audited scope` means the current contract has direct evidence and no known in-scope blocker; `Not yet evidenced` means a future v1 gate is still open, not that a failure was found; `Non-blocking follow-up` is useful operational work outside the Phase 3 release gate.

## CLI/MCP contract matrix

The CLI is the primary human and automation interface. MCP exposes the same runtime evidence rules through a session-aware adapter; not every CLI convenience command has a one-to-one MCP name.

| Capability | CLI | MCP | Read/write | Gate | Trust semantics |
| --- | --- | --- | --- | --- | --- |
| Health/status | `cmi status [--json]`, `cmi doctor [--json]` | `get_project_memory_status` | Read | None | Uninitialized, stale, unsafe, or blocked domains are labeled; doctor and trust-critical status exit nonzero |
| Source graph | `cmi scan`, `cmi workspaces` | `scan_project_intelligence`, `get_project_graph`, `list_project_workspaces` | Scan writes generated cache; inspection reads | Scan mutation requires write mode in MCP | Graph is current only when source/config fingerprints match |
| Search/context | `cmi search`, `cmi context`, `cmi prepare` | `search_project_memory`, `build_project_context`, `prepare_change_brief` | Read | Durable memory and graph health gates | Results carry evidence health; blocked memory is not silently treated as empty truth |
| Impact | `cmi impact` | `analyze_project_impact` | Read | Current graph required | Blocked graph produces structured blocked output and nonzero CLI status |
| Durable memory | `cmi remember`, `cmi memory-state`, `cmi refresh-memory` | `remember_project_knowledge`, `refresh_project_memory`, `set_project_memory_state` | Write | Explicit CLI action; `CMI_WRITE_ENABLED=1` for MCP writes | Writes remain reviewable and source-linked; proposals never auto-write |
| Findings/sessions | `cmi finding`, `cmi session` | `list_project_findings`, `get_project_finding`, `set_project_finding_state`; `get_work_session_status`, `get_work_session_report`, `list_work_sessions`, `get_session_handoff`, `start_work_session`, `observe_work_session`, `finalize_work_session` | Mixed | Mutations are explicit; safe MCP mode is read-only | Persistent blockers and handoffs retain evidence and review provenance |
| Portable provenance | `cmi provenance` | `get_executable_provenance` | Read | None | Reports actual invocation/package candidates; unknown remains unknown |
| Evidence freeze/inspect | `cmi evidence freeze`, `inspect` | `freeze_portable_evidence`, `inspect_portable_evidence` | Freeze writes a bundle; inspect reads | Explicit write action; MCP freeze requires write mode | Bundle digests verify integrity; freeze is not authentication |
| Evidence restore/rebind | `cmi evidence restore`, `rebind` | `restore_portable_evidence`, `rebind_portable_evidence` | Restore/rebind write destination/provenance | Explicit command; MCP write mode | Compatibility is verified before writing; mismatch fails closed and recommends non-mutating review |
| Evaluation records | `cmi evaluate capture|review|list|show|report|export|import` | `list_project_evaluations`, `get_project_evaluation`, `get_project_evaluation_report`, `capture_project_evaluation`, `review_project_evaluation` | Mixed | Writes require explicit action/write mode | Field records remain classified and caller-attested; they do not prove productivity |

JSON errors use one machine-readable object on stderr. Structured blocked results use the command’s normal payload and a nonzero trust-critical exit code. Human output may add a concise next action, but it cannot upgrade a blocked result to healthy.

## Compatibility and migration policy

The Phase 3 policy and executable matrix are documented in [`docs/PERSISTENCE_COMPATIBILITY.md`](PERSISTENCE_COMPATIBILITY.md). The pre-v1 policy remains intentionally conservative: versioned durable state is never silently rewritten or discarded, generated caches are rebuildable rather than a compatibility promise, and unsupported or unsafe evidence fails closed. Phase 3 found no durable incompatibility requiring an explicit migration command.

| Data class | Current compatibility rule | Required v1 migration rule |
| --- | --- | --- |
| Reviewed memory and metadata | Legacy metadata remains readable; current versioned metadata is validated; invalid versioned metadata is untracked/blocked rather than treated as reviewed truth | The audited historical floor is read-compatible without migration; future schema changes still require a separately justified explicit migration or supported-floor decision |
| Project graph, index, generated architecture, and snapshots | `project-graph.json`, `project-index.json`, `architecture.md`, and `snapshots/` are generated from current project evidence; missing/stale graph state triggers scan or a blocked current-evidence claim | Rebuild is the fallback for these generated artifacts; a future format change must retain a clear diagnostic and must not be confused with durable-record migration |
| Configuration | `.codex-memory/config.json` stores user/project scan policy and resolver inputs used by current evidence; future versions are rejected before defaults are written | Preserve settings through an explicit validated migration only if a future observed incompatibility requires it; do not discard or silently reset user configuration |
| Reviewed memory and agent instructions | `memory.md`, `decisions.md`, `mistakes.md`, and `agent-instructions.md` are user/reviewer-authored durable state; metadata and source freshness are validated separately | Preserve old records read-only or migrate through validated, atomic, no-overwrite conversion; never invent review provenance |
| Changes, sessions, handoffs, and findings | `.codex-memory/changes/`, `.codex-memory/sessions/`, and `findings.json` retain work evidence, blockers, outcomes, and continuation state; audited historical records remain readable without rewrite | Preserve records or migrate through validated, atomic, no-overwrite conversion if a future observed incompatibility requires it; do not classify them as rebuildable caches |
| Evaluations | `.codex-memory/evaluations/` retains bounded anonymized field records and explicit reviewer/protocol provenance; the audited `v0.9.1` record remains unreviewed | Preserve immutable captured measurements; migrate only through validation and never upgrade provenance |
| Portable provenance | `.codex-memory/portable-provenance.json` records explicit restore/rebind identity and verification provenance; no released predecessor is supported | Preserve or validate the record during migration; do not regenerate it as if it were graph/index cache |
| Portable evidence bundles | Current bundle schema and artifact schemas are verified before reads/writes; mismatch, traversal, symlink, conflict, and digest failure fail closed | Publish supported bundle schema versions and a tested restore/rebind compatibility table; no in-place mutation of the source bundle |
| CLI JSON | Stable top-level success/error shapes; blocked trust-critical commands return nonzero; stdout remains usable for JSON consumers | Treat fields as additive until v1; document deprecations and preserve error codes/details for one supported transition period |
| MCP tools | Safe mode exposes no mutation surface; write-capable tools require `CMI_WRITE_ENABLED=1`; runtime contracts are shared with CLI | Version or deprecate tool/schema changes explicitly; keep read-only default and test direct-call bypass attempts |

This inventory follows the current source contracts: `initProject()` creates durable memory/config/instructions plus the internal `.gitignore`; `scanProject()` regenerates `architecture.md`, `project-index.json`, and `project-graph.json`; `snapshot()` writes under the ignored `snapshots/` directory; change/session/finding/evaluation modules atomically persist their records; and portable restore/rebind persists `portable-provenance.json`. The internal ignore file currently covers only `project-graph.json`, `project-index.json`, and `snapshots/`, so a tracked durable or generated file remains an observable repository change.

Before v1, the project may add fields and diagnostics while preserving the current error envelope and evidence labels. It must not silently reinterpret an old reviewed record, silently overwrite an existing destination, or turn caller-attested evaluation into independent proof. `0.9.2` is the current public line; `v0.10.0` remains unreleased until the tech lead accepts the readiness matrix and hosted checks.

## Self-dogfood record

The acceptance pass used disposable worktrees and temporary files; no CMI state was written to the feature branch’s project directory.

| Scenario | Observation | Disposition |
| --- | --- | --- |
| 1. Uninitialized project | Status/doctor/search/context/prepare/impact did not fabricate project truth; status now points to `cmi init`, and doctor is blocked | Fixed diagnostic actionability and covered with tests |
| 2. Healthy project | Init/scan produced usable status, doctor, search, context, prepare, and impact output | Accepted |
| 3. Source changed after scan | Graph/impact/prepare became blocked and recommended `cmi scan`; human status previously lacked the next action and exit parity | Fixed human status action/exit parity and covered with tests |
| 4. Missing graph | Current graph/impact claims failed closed; advisory generated architecture content was labeled untracked | Accepted; untracked advisory output is not trusted graph evidence |
| 5. Corrupt/unsafe durable evidence | Symlinked memory was blocked; no outside content leaked and no unsafe write occurred | Accepted |
| 6. Portable evidence mismatch | Freeze/inspect worked; source/revision mismatch failed before restore write | Added structured non-mutating review action; covered with tests |
| 7. Portable evidence relocation/rebind | Compatible relocation and explicit rebind paths are covered by Phase 1 tests | Accepted |
| 8. Read-only MCP | Mutation was unavailable/blocked before durable writes | Accepted; preserve gate for new tools |
| 9. Write-enabled MCP | Explicit write mode exposes the intended freeze/rebind mutation surface | Accepted; writes remain explicit |
| 10. Repository baseline | Generated `.codex-memory/` appeared as a false project change in the pre-change brief | Fixed advisor filtering and covered with tests |

## Manual experiment records

These are bounded operational checks, not product-value experiments.

| Experiment | Command/path | Result |
| --- | --- | --- |
| Fresh project recovery | `node src/cli-entry.js status --json`; `doctor --json`; then `init` and `scan` | Uninitialized/blocked state was explicit; initialized state became healthy and usable |
| Portable bundle | `evidence freeze`, `inspect`, then source edit and `restore --json` | Bundle identity and digests verified; mismatch returned structured details and no CMI write |
| Unsafe durable memory | Disposable `memory.md` symlink to an outside temporary file; `status`, `doctor`, `search`, `remember`, `stale` | All trust-sensitive paths blocked; outside content was not imported |
| MCP boundary | Safe and write-enabled session-aware MCP discovery/direct-call tests | Safe mode does not expose mutation; write mode is explicit and parity is retained |

## Phase 3 compatibility experiments

These are bounded engineering checks, not new empirical product-value studies.

| Experiment | Observation | Disposition |
| --- | --- | --- |
| Historical durable project | A disposable `v0.5.0` project was inspected with current config/status/search/init. Config, legacy memory, and authored instructions were not rewritten; legacy memory was not promoted to reviewed-current. | Accepted; fixture and regression test retained |
| Unsupported/future state | Future config, generated formats, durable records, and metadata were rejected, marked invalid, or blocked. Existing bytes remained unchanged. | Accepted; no defaults or downgrade path |
| Generated old state | The obsolete `v0.5.0` graph was detected as non-current; `scan` rebuilt graph/index and left durable memory/review labeling unchanged. | Accepted; generated rebuild only |
| Corrupt durable state | Truncated config returned `CMI_CONFIG_INVALID`; `init` stopped before replacing it. Existing portable future-schema rejection and storage safety tests remain green. | Accepted; no migration backup path exists because no migration was required |

## Empirical record dispositions

Study 001 (Issue #28) remains an incomplete historical study. The preserved issue/preregistration evidence shows the plain condition complete and the CMI condition pending, but no original CMI condition artifact with sufficient provenance was found in the repository-side record. Study 002 or later evaluator commentary is not used to manufacture the missing condition.

Study 003 (Issue #30) has a preserved hosted evaluator record marked analyzable with a documented protocol deviation, including the V1/V2/V3 amendment history and eligible V3 bundle. The repository-side ledger still reports CMI pending, and no repository ledger artifact or transparent correction record was present in this checkout. The discrepancy is therefore left unreconciled rather than rewriting the ledger or removing the deviation. The hosted record remains descriptive-only; no causal, generalization, or productivity claim is added.

No study was restarted, no new measured condition was run, and Study 002 was not modified.

## Security, parser, and performance review

- Security: path traversal, symlink inputs, unsafe durable paths, destination conflicts, digest corruption, and portable-evaluation file races are rejected or blocked. CodeQL remains a required supporting signal, not a substitute for runtime review.
- Parser: JavaScript, Python, Go, Rust, workspace, alias, comment/string, and relative-import cases have targeted coverage. Inference remains labeled best effort and never becomes compiler-grade or complete runtime impact.
- Performance: incremental scanning reuses unchanged nodes, and benchmark smoke remains part of verification. No material regression was observed in the Phase 2 dogfood; no performance claim is made.

## Acceptance gates

Before the draft PR is handed to the tech lead, the branch must have: clean `git diff --check`; full `npm run verify`; benchmark, package, release-check, CLI, and MCP smoke results; no version/tag/release mutation; green Ubuntu/macOS/Windows Node 22/24 CI; green CodeQL; a documented study/issue disposition; and a PR body containing the Phase 3 scope, compatibility matrix, fixture provenance, verification record, known limitations, and explicit no-merge/no-release statement.

Known limitations are deliberate: static analysis is heuristic, portable bundles are not authenticated backups, evaluation provenance is caller-attested, Studies 001 and 003 do not currently support a positive product-value claim, and the compatibility guarantee is limited to the audited historical floor documented in `PERSISTENCE_COMPATIBILITY.md`.

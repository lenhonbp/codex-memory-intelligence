# CMI v1.0 Readiness Audit

Phase 2 operational UX, repository hygiene, and compatibility audit. This document records the state of the repository at the Phase 2 baseline and is not a v1.0 declaration.

Audit date: 2026-08-08 (Asia/Ho_Chi_Minh)
Baseline: `c2732a96a0aa4ea0ae9b0b19a14dfc297fde461a` (`main`)
Public/package version: `0.9.2`
Phase 2 target: `v0.10.0` readiness review; no tag, publish, or release is authorized by this audit.

## Executive disposition

There is no known engineering P0 or P1 blocker within the audited Phase 2 scope. The bounded fixes in this branch make fresh-project diagnostics, blocked status recovery, generated-state baselines, and portable mismatch handling more actionable without weakening fail-closed behavior. The recommendation remains `READY_FOR_TECH_LEAD_REVIEW`, subject to the hosted checks and review gates recorded in the pull request.

This is not a claim of production readiness, v1.0 readiness, statistical sufficiency, or CMI productivity value. Empirical studies remain explicitly classified below, and the incomplete repository-side records are not converted into positive product evidence.

## Readiness matrix

| Area | Status | Evidence at audit | Remaining gate or limitation |
| --- | --- | --- | --- |
| Evidence boundaries and fail-closed behavior | Ready for audited scope | Phase 1 evidence/provenance work at PR #31; targeted corruption, unsafe path, stale graph, blocked memory, and mismatch tests | Preserve no-write behavior for every future recovery path |
| Fresh-project CLI diagnostics | Ready for Phase 2 review | Disposable worktree dogfood; `status`, `doctor`, search/context, prepare, and impact exercised before init/scan | Keep human and JSON exit/action contracts synchronized |
| Generated-state repository hygiene | Ready for Phase 2 review | Baseline dogfood showed `.codex-memory/` as a false dirty change; advisor now filters internal generated paths and has regression coverage | Other tools must continue to treat generated state as local evidence, not project source |
| Portable evidence transport | Ready for audited scope | Freeze/inspect succeeded on a clean disposable worktree; mismatch, corruption, traversal, symlink, destination-conflict, relocation, and rebind paths are covered by tests | SHA-256 is integrity checking, not authentication or source authorship proof |
| Executable provenance | Ready for audited scope | CLI/MCP parity and package-install fixtures are covered by Phase 1 tests | Install ambiguity remains an explicit diagnostic limitation |
| MCP read-only/write gate | Ready for audited scope | Safe tool discovery and direct-call bypass tests; write tools require explicit `CMI_WRITE_ENABLED=1` | Recheck the gate on every newly added mutating tool |
| CLI/MCP contract parity | Ready for Phase 2 review | Shared runtime contracts and existing parity tests; matrix below records the public surface | Add a deprecation policy before promising v1 stability |
| Durable persistence compatibility | Not yet evidenced for v1 | Current versioned memory, session, finding, graph, index, config, and portable schemas are validated in runtime/tests | Complete migration fixtures and compatibility tests before a v1 stability promise |
| Security and parser safety | Ready for audited scope | Symlink/path/TOCTOU and strict JSON regression coverage; CodeQL is a supporting hosted gate | Heuristic parsers remain advisory, not compiler-grade |
| Performance | Non-blocking follow-up | Incremental scan and benchmark smoke paths exist; no material regression observed in this audit | Record a reproducible baseline if performance becomes a v1 claim |
| Release/package hygiene | Ready for current public line | npm latest and package metadata remain `0.9.2`; publish workflow has successful trusted-publish runs for the public line | No `v0.10.0` release is part of Phase 2 |
| Cross-platform hosted verification | Pending hosted checks | CI matrix is Ubuntu/macOS/Windows × Node 22/24; CodeQL is separate | Draft PR checks must pass before final readiness recommendation |
| Empirical product value | Not yet evidenced | Study 002 is descriptive-only and complete; Studies 001 and 003 have incomplete repository-side records | Do not claim productivity impact or v1 readiness from these studies |

Status meanings: `Ready for audited scope` means the current contract has direct evidence and no known in-scope blocker; `Not yet evidenced` means a future v1 gate is still open, not that a failure was found; `Non-blocking follow-up` is useful operational work outside the Phase 2 release gate.

## CLI/MCP contract matrix

The CLI is the primary human and automation interface. MCP exposes the same runtime evidence rules through a session-aware adapter; not every CLI convenience command has a one-to-one MCP name.

| Capability | CLI | MCP | Read/write | Gate | Trust semantics |
| --- | --- | --- | --- | --- | --- |
| Health/status | `cmi status [--json]`, `cmi doctor [--json]` | project health/status resources/tools | Read | None | Uninitialized, stale, unsafe, or blocked domains are labeled; doctor and trust-critical status exit nonzero |
| Source graph | `cmi scan`, `cmi workspaces` | scan/status tools | Scan writes generated cache; inspection reads | Scan mutation requires write mode in MCP | Graph is current only when source/config fingerprints match |
| Search/context | `cmi search`, `cmi context`, `cmi prepare` | search/context/prepare tools | Read | Durable memory and graph health gates | Results carry evidence health; blocked memory is not silently treated as empty truth |
| Impact | `cmi impact` | impact tool | Read | Current graph required | Blocked graph produces structured blocked output and nonzero CLI status |
| Durable memory | `cmi remember`, `cmi memory-state`, `cmi memory-refresh` | memory write tools | Write | Explicit CLI action; `CMI_WRITE_ENABLED=1` for MCP writes | Writes remain reviewable and source-linked; proposals never auto-write |
| Findings/sessions | `cmi finding`, `cmi session` | finding/session tools | Mixed | Mutations are explicit; safe MCP mode is read-only | Persistent blockers and handoffs retain evidence and review provenance |
| Portable provenance | `cmi provenance` | `get_executable_provenance` | Read | None | Reports actual invocation/package candidates; unknown remains unknown |
| Evidence freeze/inspect | `cmi evidence freeze`, `inspect` | `freeze_portable_evidence`, `inspect_portable_evidence` | Freeze writes a bundle; inspect reads | Explicit write action; MCP freeze requires write mode | Bundle digests verify integrity; freeze is not authentication |
| Evidence restore/rebind | `cmi evidence restore`, `rebind` | `restore_portable_evidence`, `rebind_portable_evidence` | Restore/rebind write destination/provenance | Explicit command; MCP write mode | Compatibility is verified before writing; mismatch fails closed and recommends non-mutating review |
| Evaluation records | `cmi evaluate capture/import/export` | evaluation capture/import/export tools | Mixed | Writes require explicit action/write mode | Field records remain classified and caller-attested; they do not prove productivity |

JSON errors use one machine-readable object on stderr. Structured blocked results use the command’s normal payload and a nonzero trust-critical exit code. Human output may add a concise next action, but it cannot upgrade a blocked result to healthy.

## Compatibility and migration policy

The pre-v1 policy is intentionally conservative: versioned durable state is never silently rewritten, generated caches are rebuildable rather than a compatibility promise, and unsupported or unsafe evidence fails closed. A v1 stability promise requires fixtures proving these rules across at least one prior supported format.

| Data class | Current compatibility rule | Required v1 migration rule |
| --- | --- | --- |
| Reviewed memory and metadata | Legacy metadata remains readable; current versioned metadata is validated; invalid versioned metadata is untracked/blocked rather than treated as reviewed truth | Add an explicit schema migration command or documented one-way upgrade with backup/no-overwrite behavior and fixtures for each supported prior version |
| Project index, graph, config, change/session caches | Generated and rebuildable; missing/stale/config-drift state triggers scan or a blocked current-evidence claim | Rebuild is the fallback; if a v1 format changes, accept old state only through a versioned validator or discard/rebuild with a clear diagnostic |
| Findings, sessions, handoffs, evaluations | Runtime contracts and JSON Schemas must agree on versions, IDs, required fields, and enums | Preserve old records read-only or migrate through validated, atomic, no-overwrite conversion; never invent review provenance |
| Portable evidence bundles | Current bundle schema and artifact schemas are verified before reads/writes; mismatch, traversal, symlink, conflict, and digest failure fail closed | Publish supported bundle schema versions and a tested restore/rebind compatibility table; no in-place mutation of the source bundle |
| CLI JSON | Stable top-level success/error shapes; blocked trust-critical commands return nonzero; stdout remains usable for JSON consumers | Treat fields as additive until v1; document deprecations and preserve error codes/details for one supported transition period |
| MCP tools | Safe mode exposes no mutation surface; write-capable tools require `CMI_WRITE_ENABLED=1`; runtime contracts are shared with CLI | Version or deprecate tool/schema changes explicitly; keep read-only default and test direct-call bypass attempts |

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

## Security, parser, and performance review

- Security: path traversal, symlink inputs, unsafe durable paths, destination conflicts, digest corruption, and portable-evaluation file races are rejected or blocked. CodeQL remains a required supporting signal, not a substitute for runtime review.
- Parser: JavaScript, Python, Go, Rust, workspace, alias, comment/string, and relative-import cases have targeted coverage. Inference remains labeled best effort and never becomes compiler-grade or complete runtime impact.
- Performance: incremental scanning reuses unchanged nodes, and benchmark smoke remains part of verification. No material regression was observed in the Phase 2 dogfood; no performance claim is made.

## Acceptance gates

Before the draft PR is handed to the tech lead, the branch must have: clean `git diff --check`; full `npm run verify`; benchmark, package, release-check, CLI, and MCP smoke results; no version/tag/release mutation; green Ubuntu/macOS/Windows Node 22/24 CI; green CodeQL; a documented study/issue disposition; and a PR body containing the Phase 2 scope, behavior matrix, evidence table, verification record, known limitations, and explicit no-merge/no-release statement.

Known limitations are deliberate: static analysis is heuristic, portable bundles are not authenticated backups, evaluation provenance is caller-attested, Studies 001 and 003 do not currently support a positive product-value claim, and v1 backward compatibility is not yet evidenced by migration fixtures.

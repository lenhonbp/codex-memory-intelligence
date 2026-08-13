# Changelog

All notable changes are documented here.

## [Unreleased]

## [0.13.0] - 2026-08-13

Feature release for operational sharing trust and stronger real-repository/product-evidence validation after `v0.12.1`.

### Added

- Added **Operational Trust** as an additive read-only `cmi-trust` binary with `doctor` and `export` gates for Git-sharing policy, bounded credential-like-content scanning, stable diagnostics, cross-platform path canonicalization, and fail-closed share-candidate checks.
- Added a pinned real-repository corpus plus failure-preserving execution/transport infrastructure, dedicated CI, machine-readable evidence, and engineering-validation reports that preserve exact revisions and never execute target-repository tests or application commands.
- Expanded the external empirical-study harness with blinded-review provenance, reviewer assurance/blinding boundaries, externally observed timing support, and stricter `productValueEligible` requirements.
- Added a lightweight Product Value Regression workflow for routine continuation/context/impact feature checks so normal engineering does not require a full claim-grade study.

### Changed

- Product-value and real-corpus evidence now distinguish engineering correctness, protocol eligibility, product-value-review eligibility, paired observations, limitations, and claim boundaries instead of collapsing them into a single success signal.
- Real-repository execution now preserves partial artifacts before failure and supports an exact-revision transport fallback while keeping repository identity and revision pinning auditable.
- Public release/security metadata is advanced to the `v0.13.0` supported line.

### Fixed

- Fixed the CLI large-stdout completion path so successful commands can flush bounded large output before process exit instead of truncating externally consumed results.
- Hardened real-corpus orchestration and transport error handling so failed repositories remain visible as failed evidence rather than disappearing from the aggregate.

### Evidence limits

- The real-repository corpus is engineering validation of CMI behavior on pinned public repositories; it is not a productivity benchmark and does not prove application correctness in those repositories.
- The first controlled product-value pilot remains descriptive-only: answer-quality results were mixed/neutral, and a favorable continuation/handoff wall-clock observation does not establish a causal productivity effect.
- No pair is `productValueEligible` without blinded externally-verified human review; current agent-blinded reviews remain QA evidence only.
- `cmi-trust` is a conservative pre-share guard, not DLP, malware scanning, authentication, or proof that content is safe to disclose.
- This release does not establish proven productivity, universal-agent effectiveness, production Evidence Contract negotiation, or v1 readiness.

## [0.12.1] - 2026-08-13

Maintenance hardening release for CLI/MCP request boundaries and Portable Evidence trust integrity after `v0.12.0`.

### Fixed

- Hardened top-level CLI parsing so unknown short options, duplicate single-value flags, and extra positional arguments on fixed-arity commands fail closed instead of being absorbed or ignored.
- Added dependency-free runtime validation for the JSON-Schema subset advertised by CMI MCP tools, including required fields, enums, numeric bounds, nested conditions, strict object boundaries, and `additionalProperties: false`; malformed known-tool calls now fail with JSON-RPC `-32602` before business logic or durable writes.
- Hardened Portable Evidence restore/rebind artifact addressing against cross-platform case/NFC aliases, Windows reserved names and unsafe path segments, and case-insensitive `portable-provenance.json` collisions.
- Revalidated complete generated rebind provenance before reuse and re-ran project compatibility immediately before staged restore commit so source/repository/policy TOCTOU changes fail with `CMI_PORTABLE_READ_RACE` and do not install partial `.codex-memory` state.
- Moved new Portable Evidence writers to manifest schema v3 and added a separate `integrity.digest` (`manifest-provenance-v1`) that binds manifest provenance metadata which was outside the released v2 core `identity.digest`.
- Prevented unbound v2 `project.location` metadata from promoting restore compatibility to `exact`; v3 origin location may contribute to `exact` only because it is integrity-bound.
- Preserved released v2 read/restore behavior and the bounded relocated-v2 rebind-provenance compatibility path without allowing old unbound-origin `exact` provenance to regain trust.

### Added

- Added negative Evidence Contract compatibility mutation tests that reject protected consumer-semantic breaks at exact evidence addresses while retaining additive-field compatibility.
- Added simulation-only dual-version upgrade, unsupported-version refusal, capability-discovery, and discovery-to-negotiation TOCTOU gates for a possible future Evidence Contract evolution.
- Added an explicit `PRODUCTION_CONTRACT_SURFACE_NO_GO` gate: runtime Evidence Contract discovery/negotiation remains absent while only v1 is runtime-supported and no named production consumer requires negotiation.
- Added regression coverage for the new CLI/MCP malformed-request boundaries, cross-platform Portable Evidence restore/rebind hardening, and Portable Evidence v3 manifest-provenance integrity.

### Compatibility

- Evidence Contract v2 remains simulation-only and is not advertised as runtime support; no production discovery endpoint, negotiation parameter, handshake token, CLI flag, MCP method, or automatic downgrade/upgrade behavior is added by this release.
- Portable Evidence schema v2 remains inspectable/restorable under its released core identity algorithm. New writers emit schema v3 with separate manifest-provenance integrity coverage.
- The deterministic core `identity.digest` is not silently redefined for released v2 bundles; v3 adds integrity coverage rather than reinterpreting old v2 digests.

### Evidence limits

- Portable Evidence digests provide integrity checking, not authentication, signatures, source authorship proof, or backup authenticity; `authenticated` remains false.
- The Evidence Contract versioning/discovery/handshake work in this release is executable simulation, not a production interoperability claim.
- This release does not establish productivity improvement, time savings, universal-agent effectiveness, or v1 readiness.

## [0.12.0] - 2026-08-12

Feature release adding Evidence-Anchored Rule Intelligence so CMI can connect reviewed rules and findings to concrete source locations without promoting source matches into product truth.

### Added

- Added structured evidence anchors that can carry project-relative file paths, line ranges, symbols, features, and commit references.
- Added portable evidence syntax for `source:`, `symbol:`, `feature:`, and `commit:` references, plus bounded extraction from existing finding evidence and related files.
- Added explicit finding verification semantics: `suspected` → `observed` → `established`, while durable `resolved` remains the lifecycle resolution state.
- Ambient Intelligence now tells agents to inspect affected source and capture line/symbol/feature/commit evidence when reviewed project rules are relevant to a task.
- Closing Intelligence now carries and renders evidence anchors and verification state, and `violationEstablished` is tied to established verification rather than reviewed-rule relevance alone.
- Extended the findings registry schema additively with optional `verificationState` and `evidenceAnchors` fields while retaining schema version 1 compatibility.
- Added focused evidence-anchor tests and `docs/EVIDENCE_ANCHORED_RULE_INTELLIGENCE.md` covering the trust boundary and intended lifecycle.

### Evidence limits

- Source or static evidence can establish that code exists at a cited location; it does not by itself prove a runtime-visible, user-visible, design, architecture, or policy violation.
- `established` requires verification appropriate to the rule, such as a test, runtime/browser observation, or explicit human review; reviewed-rule relevance remains advisory until then.
- Line ranges can drift as source changes, so CMI pairs them with symbol/feature/commit context where available; this is not compiler-grade symbol tracking.
- This release does not add an autonomous generic rule scanner and does not hard-code any Project 001-specific rule or detector.
- No productivity, time-savings, universal-agent, or v1-readiness claim is established by this release.

## [0.11.2] - 2026-08-11

Maintenance patch for graph-drift signal quality discovered through repeated real-project Project 001 sessions.

### Fixed

- Kept stale graph evidence fail-closed for graph/impact claims while distinguishing the narrow case where every stale source node is fully explained by the just-completed session's attributed source mutations.
- Downgraded that expected current-session source-only drift from a material Closing warning to a non-blocking refresh reminder; pre-existing, unexplained, missing-node, source-set, resolver/workspace, scan-policy, discovery, and generated-format drift remain material.
- Added bounded stale/missing graph path evidence so session attribution can explain expected cache invalidation without declaring the graph current.
- Updated managed activation guidance to require refresh before relying on stale graph/impact evidence while explicitly forbidding cosmetic scans merely to produce Closing `CLEAN`.
- Added regression coverage for both uncommitted and committed-clean-worktree source changes, including the exact field pattern observed in Project 001.

### Evidence limits

- This patch does not make stale graph evidence healthy and does not auto-run `cmi scan`; graph/impact evidence remains blocked until generated intelligence is refreshed.
- The Project 001 observation establishes a concrete signal-quality defect and regression scenario, not a universal productivity or agent-effectiveness claim.
- Historical `prediction-gap` and other finding semantics are unchanged by this patch.

## [0.11.1] - 2026-08-11

Maintenance release for the public licensing and project-identity cutover. No CMI product-behavior change is claimed by this release.

### Added

- Added `LICENSING.md` documenting the source-available licensing model, the legacy MIT boundary, and the separate commercial-license path.
- Added `NOTICE` and `BRAND_POLICY.md` so official-project provenance, attribution, and fork/brand boundaries travel with the repository and npm package.
- Added a structured real-repository field-feedback issue template focused on useful signals, noisy/misleading behavior, missing behavior, reproducible evidence, and public-data safety.

### Changed

- Repository source after the 2026-08-11 licensing cutover is offered under **PolyForm Perimeter License 1.0.1** rather than MIT.
- `v0.11.0` and all earlier public releases remain under the MIT terms shipped with those versions; this release does not retroactively revoke previously granted MIT rights.
- npm package metadata now uses `SEE LICENSE IN LICENSE` and includes `LICENSING.md`, `NOTICE`, and `BRAND_POLICY.md` in the published package.
- README terminology now describes post-cutover CMI source as **source-available**, documents the licensing boundary, and invites evidence-based field feedback from real repositories.
- Material code contributions require pre-coordination until a formal contributor licensing agreement is available; bug reports, field evidence, documentation suggestions, and design feedback remain welcome.

### Evidence limits

- The licensing/identity changes reduce ambiguity around future competing products and official-project provenance; they do not erase rights attached to prior MIT releases.
- PolyForm Perimeter is a source-available license and this release should not be described as OSI-approved open source.
- No new productivity, effectiveness, compatibility, or universal-agent claim is established by the licensing maintenance release.
- Product field evidence continues to be bounded by the documented v0.11.0 Grok/Codex results unless separately re-evaluated.

## [0.11.0] - 2026-08-11

Feature-complete planned Skill inventory and post-`v0.10.0` agent-integration work. Publication remains separately authorized after this release-preparation commit.

### Added

- Added one-time `cmi activate` integration for Codex plus a bounded generic mode so supported agents can use CMI after project activation without requiring CMI-specific user prompts.
- Added Ambient Agent Intelligence: read-only ambient task routing through `cmi ambient` and MCP `get_ambient_task_brief`, with conservative short-prompt intent classification and evidence-linked context/workflow guidance.
- Added CMI Closing Intelligence: a bounded end-of-work read model and branded `### CMI Intelligence` footer that surfaces up to three evidence-based cross-session, verification, finding, and reviewed-consistency alerts plus a clean fallback.
- Added eight Agent Skills open-format adapters as portable repository/package artifacts:

  - `cmi-ambient-brief`
  - `cmi-continue`
  - `cmi-evidence-health`
  - `cmi-closing`
  - `cmi-memory-review`
  - `cmi-work-session`
  - `cmi-change-loop`
  - `cmi-activate`
- Added npm distribution of the eight Skill artifacts under package `files` → `skills/` with package-smoke coverage for packed identity and no auto-activation on install.
- Added Skill contract tests for all eight adapters plus distribution invariants.

### Fixed

- Preserved intentionally unfinished / partial / paused / review-pending Change Intelligence records as **active** when a work session ends (`session completion != Change completion`). Partial progress remains visible under active Changes and Closing Intelligence surfaces it as a non-blocking reminder; explicit abandonment remains terminal.
- Required durable closed-session evidence for Closing Intelligence rather than synthesizing Closing from health-only state.
- Distinguished missing graph evidence from graph drift and kept read-only session scope separate from mutation evidence.
- Resolved project-local CMI CLI fallback resolution for packaged/local entrypoint usage.

### Changed

- Managed activation instructions now require supported agents to retrieve Closing Intelligence before ending substantial work and append a concise user-visible CMI footer when authoritative Closing exists.
- Session continuation/handoff remains historical evidence that must be re-checked against current baseline, per-ID Change lifecycle, and open findings.
- Skill distribution contract: the npm package ships Skill artifacts; npm installation does not activate or install them into agent runtimes; `cmi activate` does not install Skills; CMI has no native Skill loader.
- Unchanged scans keep tracked `architecture.md` byte-stable by excluding volatile scan timestamps/parser reuse/duration metrics from the human-reviewable architecture summary.
- Active work-session state is stored under ignored transient CMI storage and materializes into durable reviewable `sessions/` evidence only when finalized.
- Repository baselines preserve product-scope compatibility while separately reporting raw Git cleanliness and omitted untracked CMI-internal paths.
- Existing relative CSS/static imports are classified as non-code local dependencies instead of unresolved source imports.
- Generic memory-gap and regression-test suggestions are suppressed when no task-specific files, boundaries, or topic evidence support them.

### Evidence limits

- Final Codex S0–S7 field acceptance on subject `c05098fa82ddf85a4443e3769801baf78e12c200` was **not** completed. Mission 1.8B was blocked before S0 because the available ChatGPT-auth Codex runtime reported model capacity exhaustion, and an API-key-auth fallback was not available in the operator environment. This is recorded as a **runtime limitation**, not evidence that CMI passed or failed those final scenarios.
- Package shipment of Skills does not prove runtime Skill discovery or automatic selection by any agent.
- No universal Codex/Grok Skill installation path is claimed; observed paths remain runtime/version-specific evidence.
- Ambient intent routing is deterministic advisory classification, not autonomous authorization or proof of user intent.
- Agent activation cannot force clients that ignore repository instructions or MCP to follow CMI.
- Reviewed design/architecture/policy relevance in Closing Intelligence is a consistency-check cue, not proof of a violation.
- Static parsing and impact/boundary output remain heuristic/advisory rather than compiler-grade.
- This release does not establish productivity improvement, time savings, general product value, or v1 readiness.

## [0.10.0] - 2026-08-09

This release candidate contains the reviewed Phase 1–3 work after `v0.9.2`. It is prepared for release review; publication remains separately authorized.

### Added

- Added bounded portable project-evidence bundles with deterministic manifests, SHA-256 artifact verification, path-independent identity, exact/relocated/Git-checkout/content-only compatibility outcomes, explicit restore and rebind operations, destination-conflict protection, and recorded rebind provenance.
- Added executable provenance for the actual runtime/script, package root and version, source-checkout revision and cleanliness where available, install kind, observable candidates, and genuine multi-install ambiguity, with CLI/MCP parity.
- Added actionable uninitialized-project recovery and configuration/evidence health diagnostics across status, doctor, search/context, prepare, and impact; human and JSON trust-critical outcomes now share blocked semantics.
- Added persistence compatibility evidence for the audited `v0.5.0` config/memory/index/graph floor, `v0.7.0` changes, `v0.8.0` sessions, `v0.9.0` findings, and `v0.9.1` evaluations, including no-rewrite checks and the exact bounded `v0.8.0` fallback exception.
- Added fail-closed handling for future or corrupt durable/config/generated formats, preserving bytes and refusing ordinary downgrade or overwrite paths.
- Added regression coverage for portable evidence, executable provenance, operational diagnostics, MCP gating, persistence compatibility, future-format protection, and adversarial filesystem cases.
- Added maintainer/evaluator-side empirical study ledger and harness support for reproducible paired plain-vs-CMI study bookkeeping. The harness is not an agent-facing CMI command and does not establish productivity, time-savings, or general product-value evidence.

### Changed

- Repository-baseline summaries now omit only untracked local `.codex-memory/` state; tracked, staged, renamed, and ordinary project changes remain visible.
- Portable evidence now binds the bounded scan, ignore, resolver, and workspace inputs needed to reproduce source boundaries after relocation.
- Durable compatibility is read-only/no-rewrite for the audited historical floor; generated state may be rebuilt only when its format is obsolete and supported, while unsupported state remains blocked.
- The release candidate keeps MCP mutation tools hidden or rejected by default; explicit write mode is required for portable-evidence and durable mutations.

### Compatibility

- The audited historical floor is bounded and representative, not a promise to support every pre-v1 commit or every future schema. No explicit migration command is required for the audited fixtures.
- Future memory metadata, configuration, graph, and index formats fail closed without ordinary scan/refresh mutation or byte overwrite.

### Evidence limits

- Static parsing and impact output remain heuristic/advisory rather than compiler-grade or complete runtime analysis.
- Portable bundles provide integrity checking, not authentication, backup authenticity, or source-authorship proof.
- Executable provenance reports observable runtime/install evidence; it does not prove source authorship and preserves ambiguity when multiple installs are visible.
- Evaluation and empirical records remain observational/caller-attested where documented. This release does not independently prove productivity, time savings, or general product value.
- Study 001 remains incomplete and Study 003 remains unreconciled; no new empirical study was run. This release does not claim v1 readiness.

## [0.9.2] - 2026-08-08

### Fixed

- Enforced the default MCP read-only boundary by removing scan mutation from safe tool discovery and rejecting direct scan calls before generated CMI caches can be written unless write mode is explicitly enabled.
- Made graph freshness cover the complete source candidate set plus resolver, workspace, scan, and ignore inputs so new files and configuration drift block impact analysis instead of returning stale confidence.
- Separated source/project freshness from semantic memory review: source refresh now yields `fresh-source`, while `reviewed-current` requires explicit review provenance that remains current relative to source refresh.
- Made unsafe, unreadable, symlinked, or oversized durable memory fail closed as blocked evidence rather than silently appearing empty; search and refresh cannot use blocked memory as trusted input.
- Made an existing invalid, unsafe, or oversized findings registry fail closed with `CMI_FINDINGS_BLOCKED` so normal finding/session mutations cannot overwrite corrupted evidence.
- Hardened CLI automation contracts: unknown options fail, JSON-mode errors remain machine-readable, and blocked impact exits non-zero while preserving structured output.
- Aligned memory-review JSON Schema conditions with runtime provenance validation.
- Reduced representative heuristic parser errors by ignoring JavaScript import-like text in comments/ordinary strings and resolving reviewed Python relative-import and Rust `crate::` cases.
- Aligned `cmi doctor` with the Unified Evidence Health model so blocked graph, impact, durable-memory, or overall evidence states fail diagnostics instead of being reported as warning/pass states.

### Added

- Regression coverage for safe MCP direct-call bypass attempts, source-set and resolver drift, semantic-review separation, blocked durable memory, corrupt findings no-overwrite behavior, strict CLI contracts, graph/schema freshness, parser edge cases, and blocked doctor diagnostics.
- `docs/INDEPENDENT_REVIEW_REMEDIATION.md` documenting the finding-by-finding remediation contract and the empirical gaps that remain intentionally open.
- `docs/EMPIRICAL_VALIDATION.md` defining a paired controlled comparison protocol for plain Codex/Git/source search versus Codex + CMI without converting synthetic or caller-attested data into productivity claims.

### Evidence limits

- CMI remains heuristic/advisory rather than compiler-grade semantic analysis.
- Evaluation repository/reviewer provenance remains caller-attested unless a stronger external assurance process is used.
- This release improves trust boundaries and testable correctness; it does not claim that CMI productivity value is independently proven across real repositories.

## [0.9.1] - 2026-08-08

- Added longitudinal evaluation outcomes for reconstruction effort, user follow-up need, historical-evidence usefulness, and verification-choice influence with explicit human/agent provenance and applicability checks.
- Added repeated-repository longitudinal aggregation, bounded time/task/version report filters, and structural evidence-gap diagnostics that never claim statistical sufficiency or auto-recalibrate thresholds.
- Added portable, anonymized, bounded evaluation bundle export/import with runtime validation, no-overwrite export, dedupe, and conflict fail-closed semantics for local multi-repository corpus aggregation.

- Fixed large generated graph caches being unreadable through the 1 MB durable-record ceiling; generated project caches now use a separate finite read ceiling.
- Added one-time post-hoc evaluation review so human/agent usefulness can be rated after capture without mutating captured measurements or overwriting reviewer provenance.

- Added controlled real-repository stress evaluation with explicit scenario taxonomy, derived invariant outcomes, separate aggregate stress metrics, and CLI/MCP parity without inflating observational coverage.

### Added

- Real-repository evaluation records under `.codex-memory/evaluations/` with an explicit `external-real`, `self-host`, or `synthetic` source class.
- `cmi evaluate capture|list|show|report` for collecting and aggregating anonymized project/session/change-history measurements without storing repository names, raw remotes, absolute paths, session text, finding text, recommendation text, or source content.
- Runtime + JSON Schema validation for evaluation records and repository quality checks that keep trust-critical evaluation enums/version fields aligned.
- Descriptive corpus coverage states and reviewed usefulness metrics that never count self-host/synthetic runs as independent real-repository evidence or automatically declare production/v1.0 readiness.
- Evaluation subject provenance (CMI version + source revision when available), observational vs controlled-stress protocol classification, and explicit human vs agent review provenance so field coverage and usefulness evidence cannot be silently mixed.
- Session-aware MCP parity for evaluation list/show/report plus write-gated capture and `cmi://project/evaluation-report`, using the same runtime evidence contract as the CLI.

### Fixed

- Hardened portable evaluation bundle imports against path/file TOCTOU races by opening the descriptor first, using `O_NOFOLLOW` when available, validating the opened regular file and bounded size before reading, and using post-open identity checks on fallback platforms.
- Added regression coverage that rejects symlinked portable evaluation bundles before evidence is read.

## [0.9.0] - 2026-08-08

### Added

- Unified Evidence Health Model with explicit healthy/degraded/blocked states, per-domain usability, capability status, reasons, and deterministic recovery actions.
- Git-history continuity evidence for change/session attribution so rebase/reset/history rewrites are detected before committed paths are attributed.
- Runtime durable contracts for versioned memory metadata, session records, findings, recommendations, guardrails, handoffs, and the persistent findings registry.
- `schemas/findings-registry.schema.json` plus CI-enforced schema/runtime identity, required-field, enum, and version parity.

### Changed

- `status --json` and context packs expose the shared evidence-health model; human status output reports graph/impact capability state.
- Change and session intelligence fail closed on automatic committed-path attribution when the recorded baseline HEAD is no longer an ancestor of current HEAD.
- Versioned memory metadata with invalid lifecycle/review/refresh provenance is treated as untracked evidence instead of reviewed current truth.
- Session-record runtime validation now enforces the nested evidence contract rather than validating only the top-level close shape.

## [0.8.1] - 2026-08-08

### Fixed

- Graph truncation now degrades project health instead of reporting a false healthy state.
- Impact and pre-change intelligence fail closed on stale graph fingerprints instead of returning obsolete dependency evidence.
- `.codex-memory` storage rejects symlinked roots and unsafe nested durable directories; Markdown/JSON memory reads use bounded no-follow file-handle validation, and durable appends verify file identity after opening.
- Memory, change, and session writer locks use owner-tagged leases with heartbeat and owner-checked release; handles close before cleanup so an old writer cannot delete a replacement lock and Windows cleanup remains safe.
- Secret guards share broader best-effort credential patterns while remaining explicitly non-DLP.
- `refresh-memory` now refreshes source fingerprints without asserting semantic review metadata; an explicit `memory-state <id> active --reason ...` review records `reviewedAt`, `reviewedBy`, and `reviewReason`.


## [0.8.0] - 2026-08-07

### Added

- Stale-aware durable-memory retrieval with explicit evidence status and `demote`, `include`, and `exclude` policies.
- Source-fingerprint checks that omit stale/missing graph nodes from current graph retrieval and surface graph drift through context health, `status`, and `doctor`.
- Reviewed durable-memory lifecycle states: `active`, `deprecated`, `rejected`, and `superseded`, with reviewer/reason audit metadata and active-replacement validation for supersession.
- `cmi memory-state` and the write-enabled MCP `set_project_memory_state` tool for explicit lifecycle review.
- Explicit historical retrieval of inactive knowledge through CLI/MCP `includeInactive`, while inactive knowledge remains excluded from normal task context.
- Shared local durable-memory write locking across remember, refresh, and lifecycle mutations.
- Versioned durable-memory metadata for new/refreshed entries (`schemaVersion: 1`, active lifecycle state).
- Runtime structural validation, per-record write locking, revision metadata, and stale-lock reclamation for durable change records.
- Verification provenance classes (`reported`, `observed-command`) with bounded command metadata supported consistently by runtime, JSON Schema, and MCP input Schema.
- Sample-sensitive historical co-change support/confidence, explicit `historical-correlation` evidence type, verification pass/evidence rates, and expected-vs-actual path precision/recall/F1 calibration.
- Durable Session Continuation Intelligence for coding, debugging, audit, review, research, verification, and no-code investigation sessions.
- `cmi session start`, `observe`, `status`, `close`, `show`, `list`, and `handoff` workflows with explicit outcome, unresolved findings, recommended next actions, and one highest-priority next action.
- Persistent `.codex-memory/findings.json` project findings with `open`, `resolved`, `accepted`, `dismissed`, and `superseded` lifecycle states so unresolved issues survive AI-session boundaries.
- Deterministic P0–P3 recommendation ordering for blockers, failed/incomplete verification, project-health gaps, active change records, prediction gaps, unexpected impact, open questions, and worktree/session-attribution gaps.
- Bounded session handoffs containing objective, branch/HEAD/worktree state, observed scope, accomplishments, decisions, questions, completed/active changes, open findings, next actions, and review-only knowledge candidates.
- Versioned `schemas/session-record.schema.json` storage contract for durable session/outcome intelligence.
- Session-aware MCP tools for status/report/list/handoff/findings plus write-enabled start/observe/finalize/finding-review workflows while retaining the existing MCP surface.
- MCP resources `cmi://project/session/latest`, `cmi://project/session-handoff/latest`, and `cmi://project/findings`.
- MCP prompts `close_project_session` and `continue_from_session_handoff`, plus initialize instructions telling compliant agents to surface P0/P1 findings and the highest-priority next action before ending substantial work.
- Regression coverage for stale retrieval policy semantics, stale graph health, memory lifecycle, ambiguous ID prefixes, concurrent memory mutation serialization, verification provenance, record validation, calibrated behavioral confidence, Git renames, detached HEAD baselines, no-code sessions, persistent blockers, finding auto-resolution, CLI close-session reporting, and MCP session continuation behavior.

### Changed

- Default memory search/context now preserves stale evidence as clearly labeled, heavily down-ranked evidence instead of silently treating it as current; `exclude` is the opt-in strict-current mode.
- Inactive durable memory remains human-reviewable history but no longer drives normal ranked retrieval or makes project memory unhealthy.
- Reviewed memory mutations require a unique ID/prefix; ambiguous prefixes fail closed.
- Bulk refresh skips intentionally inactive knowledge, and refreshing a single inactive entry requires explicit reactivation first.
- Co-change confidence no longer maps directly from occurrence count; tiny samples cannot receive high confidence merely because support is 100%.
- Change-history calibration now reports path precision, recall, F1, sample count, and sample-sensitive confidence while retaining compatibility aliases for v0.7 metrics.
- Git worktree parsing now uses NUL-delimited porcelain output so rename/copy destination paths and original paths remain distinct instead of becoming `old -> new` pseudo-paths.
- The installed `cmi` entrypoint now adds Session/Finding Intelligence commands while delegating all existing commands to the original CLI implementation.
- The installed `cmi-mcp` entrypoint now exposes a unified existing + session-continuation MCP surface and preserves the existing server as the protocol core.
- MCP documentation/prompts distinguish lifecycle state, stale-evidence policy, historical correlation, supplied command-result provenance, persistent findings, and next-action advice from independently verified truth.
- Session close is designed to surface problems and evidence-based follow-up immediately instead of requiring the user to ask what should happen next.

### Fixed

- Top-level CLI help now exposes the Session and Finding command groups, and `change`, `session`, and `finding` group help exits cleanly.
- `cmi mcp-config` now points to the session-aware `mcp-entry.js`, keeping generated configuration aligned with the installed `cmi-mcp` surface.

### Evidence limits

- Session recommendations do not execute project commands and do not prove business priority.
- Persistent findings can only cover conditions CMI can observe or that a human/agent explicitly records.
- Historical verification suggestions remain correlation, not causal proof that a command is required.
- MCP instructions encourage close-session finalization but cannot force arbitrary clients that ignore MCP guidance to invoke it before disconnecting.
- Session and change learning candidates remain review-only and are never promoted to durable project truth automatically.

## [0.7.0] - 2026-08-07

### Added

- Evidence-driven Change Intelligence Loop with durable BEFORE → DURING → AFTER records under `.codex-memory/changes/`.
- `cmi change start`, `observe`, `complete`, `show`, `list`, and `history` CLI workflows.
- Versioned JSON Schema for change-record storage.
- Prediction-versus-observation comparison with changed-path coverage, predicted-scope touched, and explicit prediction gaps.
- Bounded historical file/boundary co-change evidence and verification patterns derived from completed local change records.
- Review-only learning candidates for prediction gaps, failed verification claims, and unexpected impact.
- MCP read tools for change history and records, plus write-enabled lifecycle tools behind the existing explicit write opt-in.
- `cmi://project/change-history` MCP resource and `run_change_intelligence_loop` prompt.
- Git and non-Git tests covering change attribution, completion evidence, historical correlation, secret rejection, record immutability, bounded record size, and symlink-safe history reads.

### Changed

- `prepare_project_change` now instructs agents to consult relevant completed project-change history before implementation.
- MCP `--write` documentation now covers durable change-record writes as well as durable memory writes.
- CMI-internal `.codex-memory/` paths are excluded from observed product-change scope so change records cannot observe themselves.
- Change-record Git baselines preserve the number of omitted CMI-internal changes while calculating project attribution from non-CMI paths only.
- Historical co-change is explicitly labeled correlation rather than causality, and verification results are explicitly treated as evidence claims rather than commands executed by CMI.
- Change-record reads are bounded to 1 MB per record and use fixed file handles with symlink/race protections before parsing durable history.

## [0.6.0] - 2026-08-07

### Added

- Bounded local Git baseline reporting without absolute-path disclosure.
- Deterministic advisory project-boundary maps derived from workspaces, paths, and import edges.
- Review-only task-specific memory-gap proposals with confidence and evidence.
- Structured pre-change briefs combining baseline, ranked context, impact, boundaries, risks, verification, assumptions, and provenance.
- CLI commands: `baseline`, `boundaries`, `memory-gaps`, and `prepare`.
- MCP tools and resources for repository baseline, boundary maps, memory-gap proposals, and pre-change briefs.
- Versioned JSON Schema for pre-change brief output.
- Cross-platform tests for Git-root and nested-project baseline paths, including non-Git projects.

### Changed

- The `prepare_project_change` MCP prompt now directs agents to use the structured pre-change brief and treat all inferred knowledge as advisory.
- Architecture and security documentation now distinguish observed project evidence from inferred advisory output.
- Git project paths are derived using Git-native relative prefixes for consistent behavior across macOS, Windows, and Linux.
- Only reviewed memory entries with CMI metadata count as durable task-relevant memory; template text and agent guidance are not mistaken for reviewed project facts.

## [0.5.0] - 2026-08-06

### Added

- Incremental graph scanning with parser-versioned node reuse and changed-file invalidation.
- `.cmiignore` parsing with globs, directory rules, negation, configuration patterns, and explanation output.
- npm/pnpm, Cargo, and Go workspace detection.
- Workspace IDs on graph nodes, cross-workspace metrics, affected-workspace impact output, and workspace-scoped retrieval.
- TypeScript path-alias, Python package, Go module, and Rust module-resolution fixtures.
- BM25-inspired local ranking with symbol, title, workspace, decision, risk, and dependent-file boosts.
- MCP resources, prompts, workspace/ignore tools, context-pack tool, stable protocol negotiation, and fallback behavior.
- Reproducible synthetic benchmark and CI benchmark smoke job.
- Project-index and project-graph JSON Schemas.
- Semantic release metadata validation for a future npm Trusted Publishing workflow.

### Changed

- Project index schema is now version 5; project graph schema is version 3; configuration schema is version 4.
- The current stable MCP protocol target is `2025-11-25`, with compatibility back to `2024-11-05`.
- File fingerprints now include size, modification time, and change time for safer incremental invalidation.
- Hidden paths are excluded by default, except root `.github/` and `.cmiignore`.

## [0.4.0] - 2026-08-06

- Added cross-platform CI, CodeQL, symlink-safe paths, package installation smoke tests, conservative MCP mutation defaults, diagnostics, governance, and release documentation.

## [0.3.0] - 2026-08-05

- Added dependency graphing, impact analysis, source-linked memory, stale-memory detection, and expanded MCP tools.

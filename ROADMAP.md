# Roadmap

## v0.5 — Real-world beta

- [x] Incremental scanning and reproducible benchmarks.
- [x] `.cmiignore` and documented ignore semantics.
- [x] Monorepo and workspace awareness.
- [x] Parser fixtures for Python, Go, Rust, and TypeScript aliases.
- [x] MCP protocol negotiation, resources, prompts, and broader interface tests.

## v0.6 — Field validation and precision

- [x] Bounded Git baseline in CLI, MCP tools, resources, and pre-change briefs.
- [x] Deterministic project-boundary inference with confidence and provenance.
- [x] Review-only task-specific memory-gap proposals.
- [x] Structured pre-change briefs combining context, impact, risks, and verification.
- [x] Reproducible npm publishing through Trusted Publishing with signed provenance.

## v0.7 — Change Intelligence Loop

The v0.7 direction is evidence-driven project history rather than a prompt, Skill, or external-document marketplace.

- [x] Durable BEFORE → DURING → AFTER change records with a versioned JSON Schema.
- [x] Capture predicted files, inferred boundaries, risks, and verification guidance before implementation.
- [x] Observe Git-attributed changed paths during implementation with explicit-path fallback for non-Git projects.
- [x] Exclude CMI-internal records from product-change attribution.
- [x] Compare predicted scope with observed changed paths and preserve prediction gaps.
- [x] Capture completion outcome, verification evidence, and unexpected impact without executing project commands inside CMI.
- [x] Derive bounded file/boundary co-change evidence and verification patterns from completed local history.
- [x] Label co-change as correlation rather than causality and changed-path coverage as incomplete impact evidence.
- [x] Produce review-only learning candidates without automatically converting them into project memory.
- [x] Expose the loop through CLI, MCP tools, a project history resource, and an agent prompt while keeping durable writes opt-in.

## v0.8 — Behavioral Change Intelligence, trust, and continuation

The v0.8 foundation strengthens evidence quality and makes project continuity explicit: CMI should preserve unresolved project state and make the best-supported next action visible without requiring the user to ask what comes next.

### Trust hardening

- [x] Integrate source-linked stale state into retrieval instead of treating stale memory as ordinary current knowledge.
- [x] Label retrieval evidence and support conservative `demote`, `include`, and `exclude` stale policies.
- [x] Detect stale/missing graph nodes from stored fingerprints before returning graph context.
- [x] Surface graph drift through context health, `status`, and `doctor`.
- [x] Add reviewed memory lifecycle states (`active`, `deprecated`, `rejected`, `superseded`) with reason/reviewer audit metadata and active-replacement validation for supersession.
- [x] Exclude inactive knowledge from trusted retrieval by default while preserving explicit historical inspection.
- [x] Reject ambiguous memory-ID prefixes for reviewed mutations instead of mutating multiple entries.
- [x] Serialize durable-memory append, refresh, and lifecycle mutation through one local writer lock.
- [x] Version new/refreshed durable-memory metadata while preserving backward-compatible reads.
- [x] Runtime-validate durable change records on write and read instead of relying on a documentation-only JSON Schema.
- [x] Add atomic per-record write locking and revision metadata for local concurrent-writer safety.
- [x] Distinguish reported verification claims from supplied observed-command metadata without executing commands inside CMI.
- [x] Keep CLI, MCP schemas, and runtime verification provenance aligned.
- [x] Parse Git rename/copy worktree status as destination/original paths instead of arrow pseudo-paths, with detached-HEAD regression coverage.

### Behavioral Change Intelligence

- [x] Calibrate file/boundary co-change confidence using local sample size and support rather than raw occurrence count alone.
- [x] Expose historical correlation as an explicit evidence type rather than causal dependency.
- [x] Track verification pass rates and observed-command evidence rates across relevant completed changes.
- [x] Add expected-vs-actual path recall, precision, F1, and sample-count confidence while retaining compatibility aliases.
- [x] Keep learning candidates review-only and preserve the observed/reviewed/inferred distinction.

### Session / Continuation Intelligence

- [x] Add durable work sessions that cover coding, debugging, audit, review, research, verification, and no-code investigation.
- [x] Capture session goals, repository/project health, relevant context/history, explicit accomplishments, blockers, decisions, questions, and observed paths.
- [x] Derive conservative session outcomes (`succeeded`, `partial`, `blocked`, `investigated`, `abandoned`, `unknown`).
- [x] Persist project findings across AI sessions so unresolved blockers, verification gaps, prediction gaps, and health issues do not disappear with chat context.
- [x] Add reviewed finding lifecycle (`open`, `resolved`, `accepted`, `dismissed`, `superseded`) and repeat-occurrence/session tracking.
- [x] Auto-resolve only deterministic health findings when their measured condition disappears; keep human/project blockers review-controlled.
- [x] Produce deterministic P0–P3 next-action priorities from finding classes and evidence.
- [x] Add historical verification recommendations only as explicitly labeled `historical-correlation` evidence.
- [x] Produce a bounded session handoff with objective, outcome, current repository state, open findings, decisions/questions, completed/active changes, knowledge candidates, and one explicit `nextAction`.
- [x] Make CLI session close/status output surface unresolved problems and next actions without requiring a follow-up user question.
- [x] Expose session/findings read and write workflows through a unified session-aware MCP endpoint while retaining the existing MCP tool surface.
- [x] Add MCP resources for latest session, latest handoff, and open findings plus prompts for close-session reporting and continuation.
- [x] Extend MCP server instructions so compliant agents are told to finalize substantial work and surface P0/P1 findings plus the highest-priority next action before ending.
- [x] Version the session-record storage contract and keep session/finding text bounded, secret-guarded, local, atomic, and reviewable.

### v0.8 field-validation work

These items require real evidence from multiple repositories or longer-lived histories. They must not be marked complete from synthetic fixtures alone.

- [ ] Build a real-repository fixture corpus with anonymized expected graphs, change records, session records, findings, and advisory outputs.
- [ ] Stress incremental correctness for renames after scan, clock skew, rebases, dirty worktrees, and large monorepos beyond deterministic fixtures already covered.
- [ ] Validate change-history and session-handoff usefulness across unrelated repository types instead of tuning examples around one product domain.
- [ ] Recalibrate behavioral confidence and recommendation-priority thresholds from enough real completed tasks to replace provisional thresholds with empirical ones.
- [ ] Measure whether historical verification patterns improve agent verification choices on repeated project work.
- [ ] Measure whether session handoffs reduce context reconstruction and whether next-action intelligence reduces user follow-up questions.
- [ ] Add retention/export/import policy only after real repositories demonstrate a need; do not introduce a database or cloud service by default.

## v0.9 — Evidence Integrity

The v0.9 line unifies trust state across evidence classes and closes repository-internal contract/attribution gaps that can be verified without pretending synthetic fixtures are real-world calibration.

- [x] Add one Evidence Health Model with explicit healthy/degraded/blocked state, per-domain usability, capability status, reasons, and recovery actions.
- [x] Expose shared evidence health through `status`, `doctor`, CLI status text, and context packs.
- [x] Detect Git ancestry continuity before using start-to-current committed-path diffs for change/session attribution.
- [x] Fail closed after rebase/reset/unrelated-history transitions and preserve explicit Git-continuity evidence in change/session records.
- [x] Add runtime durable contracts for memory metadata, nested session evidence, findings, recommendations, guardrails, handoffs, and the findings registry.
- [x] Bring memory lifecycle/source-refresh JSON Schema in line with current runtime semantics and add a persistent findings-registry Schema.
- [x] Make critical schema/runtime version and enum drift fail repository quality checks.
- [x] Add adversarial regression coverage for rewritten Git history, invalid nested session evidence, invalid memory lifecycle metadata, and evidence-health state transitions.

The existing real-repository field-validation items remain open until enough independent repository/task evidence exists. v0.9 does not convert those empirical questions into synthetic completion claims.

## Precision and interoperability track

- [ ] Optional compiler/language-server adapters behind capability detection.
- [ ] More precise package-level Go and Rust dependency models.
- [ ] MCP compatibility matrix for Codex, Claude Desktop, VS Code, Cursor, and other clients.
- [ ] Structured in-place memory editing and contradiction-detection workflows without weakening human review.
- [ ] Calibrated confidence evaluation for boundary and task-topic inference across unrelated project types.
- [ ] Client-specific lifecycle adapters where a client exposes a reliable session-end hook; do not claim universal forced finalization from MCP alone.

## v1.0 criteria

- [ ] Stable storage migrations and documented rollback behavior for durable memory, change records, session records, and findings.
- [ ] Demonstrated use across multiple real repositories, languages, architectures, project types, and operating systems.
- [x] Reproducible npm publishing with provenance.
- [ ] Documented performance envelopes and parser/advisor/change/session-intelligence accuracy limits.
- [ ] Historical evidence shown to improve agent preparation or verification on real repeated project work, not only synthetic fixtures.
- [ ] Session continuation evidence shown to improve handoff quality or reduce repeated project-state reconstruction on real repeated work.
- [ ] External user feedback incorporated into the public CLI, MCP, storage, advisory, and continuation APIs.
- [ ] No known high-severity path, release, durable-memory, change-record, session-record, finding, or advisory-integrity issues.

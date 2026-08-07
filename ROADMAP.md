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

## v0.8 — Behavioral Change Intelligence and trust hardening

The v0.8 foundation strengthens evidence quality before expanding intelligence surface area.

- [x] Integrate source-linked stale state into retrieval instead of treating stale memory as ordinary current knowledge.
- [x] Label retrieval evidence and support conservative `demote`, `include`, and `exclude` stale policies.
- [x] Detect stale/missing graph nodes from stored fingerprints before returning graph context.
- [x] Surface graph drift through context health, `status`, and `doctor`.
- [x] Runtime-validate durable change records on write and read instead of relying on a documentation-only JSON Schema.
- [x] Add atomic per-record write locking and revision metadata for local concurrent-writer safety.
- [x] Distinguish reported verification claims from supplied observed-command metadata without executing commands inside CMI.
- [x] Calibrate file/boundary co-change confidence using local sample size and support rather than raw occurrence count alone.
- [x] Expose historical correlation as an explicit evidence type rather than causal dependency.
- [x] Track verification pass rates and observed-command evidence rates across relevant completed changes.
- [x] Add expected-vs-actual path recall, precision, F1, and sample-count confidence while retaining compatibility aliases.
- [x] Keep learning candidates review-only and preserve the observed/reviewed/inferred distinction.

### v0.8 field-validation work

These items require real evidence from multiple repositories or longer-lived histories. They must not be marked complete from synthetic fixtures alone.

- [ ] Build a real-repository fixture corpus with anonymized expected graphs, change records, and advisory outputs.
- [ ] Stress incremental correctness for renames, clock skew, rebases, detached HEADs, dirty worktrees, and large monorepos.
- [ ] Validate change-history usefulness across unrelated repository types instead of tuning examples around one product domain.
- [ ] Recalibrate behavioral confidence thresholds from enough real completed tasks to replace provisional thresholds with empirical ones.
- [ ] Measure whether historical verification patterns improve agent verification choices on repeated project work.
- [ ] Add retention/export/import policy only after real repositories demonstrate a need; do not introduce a database or cloud service by default.

## Precision and interoperability track

- [ ] Optional compiler/language-server adapters behind capability detection.
- [ ] More precise package-level Go and Rust dependency models.
- [ ] MCP compatibility matrix for Codex, Claude Desktop, VS Code, Cursor, and other clients.
- [ ] Structured memory editing, rejection, supersession, contradiction, and deprecation workflows without weakening human review.
- [ ] Calibrated confidence evaluation for boundary and task-topic inference across unrelated project types.

## v1.0 criteria

- [ ] Stable storage migrations and documented rollback behavior for durable memory and change records.
- [ ] Demonstrated use across multiple real repositories, languages, architectures, project types, and operating systems.
- [x] Reproducible npm publishing with provenance.
- [ ] Documented performance envelopes and parser/advisor/change-intelligence accuracy limits.
- [ ] Historical evidence shown to improve agent preparation or verification on real repeated project work, not only synthetic fixtures.
- [ ] External user feedback incorporated into the public CLI, MCP, storage, and advisory APIs.
- [ ] No known high-severity path, release, durable-memory, change-record, or advisory-integrity issues.

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

### v0.7 field-validation work

- Real-repository fixture corpus with anonymized expected graphs, change records, and advisory outputs.
- Incremental correctness stress tests for renames, clock skew, rebases, detached HEADs, dirty worktrees, and large monorepos.
- Validate change-history usefulness across unrelated repository types instead of tuning examples around one product domain.
- Measure changed-path prediction calibration over enough real completed tasks to make confidence thresholds evidence-based.
- Add retention/export/import policy only after real repositories demonstrate a need; do not introduce a database or cloud service by default.
- Evaluate concurrency protection for multiple local agents updating the same active change record.

## Precision and interoperability track

- Optional compiler/language-server adapters behind capability detection.
- More precise package-level Go and Rust dependency models.
- MCP compatibility matrix for Codex, Claude Desktop, VS Code, Cursor, and other clients.
- Structured memory editing, rejection, supersession, and deprecation workflows without weakening human review.
- Calibrated confidence evaluation for boundary and task-topic inference across unrelated project types.

## v1.0 criteria

- Stable storage migrations and documented rollback behavior for durable memory and change records.
- Demonstrated use across multiple real repositories, languages, architectures, project types, and operating systems.
- Reproducible npm publishing with provenance.
- Documented performance envelopes and parser/advisor/change-intelligence accuracy limits.
- Historical evidence shown to improve agent preparation or verification on real repeated project work, not only synthetic fixtures.
- External user feedback incorporated into the public CLI, MCP, storage, and advisory APIs.
- No known high-severity path, release, durable-memory, change-record, or advisory-integrity issues.

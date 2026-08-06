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
- Real-repository fixture corpus with anonymized expected graphs and advisory outputs.
- Incremental correctness stress tests for renames, clock skew, and large monorepos.
- Optional compiler/language-server adapters behind capability detection.
- More precise package-level Go and Rust dependency models.
- MCP compatibility matrix for Codex, Claude Desktop, VS Code, Cursor, and other clients.
- Structured memory editing, rejection, supersession, and deprecation workflows without weakening human review.
- Calibrated confidence evaluation for boundary and task-topic inference across unrelated project types.

## v1.0 criteria

- Stable storage migrations and documented rollback behavior.
- Demonstrated use across multiple real repositories, languages, architectures, and operating systems.
- Reproducible npm publishing with provenance.
- Documented performance envelopes and parser/advisor accuracy limits.
- External user feedback incorporated into the public CLI, MCP, storage, and advisory APIs.
- No known high-severity path, release, durable-memory, or advisory-integrity issues.

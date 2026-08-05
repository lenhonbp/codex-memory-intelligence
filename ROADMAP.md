# Roadmap

## v0.5 — Real-world beta

- [x] Incremental scanning and reproducible benchmarks.
- [x] `.cmiignore` and documented ignore semantics.
- [x] Monorepo and workspace awareness.
- [x] Parser fixtures for Python, Go, Rust, and TypeScript aliases.
- [x] MCP protocol negotiation, resources, prompts, and broader interface tests.

## v0.6 — Field validation and precision

- Real-repository fixture corpus with anonymized expected graphs.
- Incremental correctness stress tests for renames, clock skew, and large monorepos.
- Optional compiler/language-server adapters behind capability detection.
- More precise package-level Go and Rust dependency models.
- MCP compatibility matrix for Codex, Claude Desktop, VS Code, Cursor, and other clients.
- Structured memory editing and deprecation workflows without weakening human review.

## v1.0 criteria

- Stable storage migrations and documented rollback behavior.
- Demonstrated use across multiple real repositories and operating systems.
- Reproducible npm publishing with provenance.
- Documented performance envelopes and parser accuracy limits.
- External user feedback incorporated into the public CLI, MCP, and storage APIs.
- No known high-severity path, release, or durable-memory integrity issues.

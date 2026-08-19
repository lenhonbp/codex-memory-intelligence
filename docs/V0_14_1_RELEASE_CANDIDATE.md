# CMI v0.14.1 Release Candidate

Status: **RELEASE CANDIDATE — PUBLICATION PENDING**.

Prepared: 2026-08-19.

Preparation base: `main@dde6c85a9f4af40b25bd289475c79cbc4d135add`.

## Purpose

v0.14.1 is a focused maintenance hotfix after v0.14.0 for two field-reproduced Codex activation failures: registry fallback bootstrap and project-root binding.

## Included fix

- Registry fallback uses non-interactive exact-version npm execution (`--yes`, `codex-memory-intelligence@<VERSION>`) instead of `--no`.
- Generated Codex MCP config binds both `cwd` and `CMI_PROJECT_ROOT` to the activated repository root.
- Exact-local CMI package behavior remains preferred and preserved when a valid local package exists.
- Moving or cloning a project requires rerunning activation so the managed root-bound MCP block is regenerated for the new location.

## Evidence

- Real consumer reproduction first showed MCP bootstrap failure when the package was absent.
- After bootstrap correction, lifecycle tools appeared but durable Session start failed because the server resolved the project root as `/`.
- Explicit project-root binding then allowed Ambient brief, Session start, observation, finalization, and Closing Intelligence to complete with durable evidence under the consumer project.
- PR #111 added regression coverage for registry fallback, exact-local behavior, project-root binding, write opt-in, and activation idempotence.
- The final PR #111 head passed hosted CI on Ubuntu, macOS, and Windows with Node.js 22 and 24, the coverage gate, benchmark/release-metadata checks, package smoke, and CodeQL.

## Release gate

Publication remains separately authorized only after:

1. package, source, changelog, README, and security metadata align on `0.14.1`;
2. the release-preparation PR passes required hosted CI and CodeQL on its exact head and is merged to `main`;
3. the guarded publish workflow passes `release:check -- v0.14.1`, full repository verification, benchmark smoke, and packed-install smoke;
4. an explicitly authorized release action creates the `v0.14.1` tag, publishes `codex-memory-intelligence@0.14.1`, verifies registry visibility, creates the GitHub Release, and records post-publication identifiers.

This candidate does not tag, publish npm, create a GitHub Release, or declare v1 readiness.

## Compatibility and operational boundary

- Node.js support remains `>=22`.
- Existing `cmi`, `cmi-mcp`, and `cmi-trust` entrypoints remain supported.
- The exact-local package path remains preferred when valid local package evidence exists; the registry fallback is used only when no valid local package candidate exists.
- The generated absolute project-root values are CMI-managed integration state, not portable durable project truth. Rerun activation after moving or cloning a repository.
- Evidence Contract v2 remains simulation-only and unexposed as a production negotiation/discovery surface.

## Claim boundary

This patch establishes bounded fixes for the reproduced activation paths and associated regression coverage. It does not establish universal Codex compatibility, productivity improvement, complete runtime portability across all clients, complete security certification, or v1 readiness.

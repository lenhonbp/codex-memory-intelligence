# CMI v0.14.1 Public Release

Status: **PUBLIC RELEASE**.

Released: 2026-08-19.

## Release identity

- Release: `v0.14.1`
- npm package: `codex-memory-intelligence@0.14.1`
- Release commit/tag target: `c08163281df7990a2bcb4d7ecdcd4f5857b09c0b`
- Preparation PR: `#112` — `chore: prepare v0.14.1 release candidate`
- Included product-fix PR: `#111` — `fix: make Codex MCP activation bootstrapable and root-bound`
- Temporary `release/v0.14.1` branch: removed after successful guarded publication
- GitHub Release: `CMI v0.14.1`
- Public-source license: PolyForm Perimeter License 1.0.1

The `v0.14.1` tag resolves exactly to the release target above.

The guarded publish workflow removes the temporary release branch only after release-target validation, release metadata verification, full repository verification, benchmark smoke, packed-install smoke, npm publication-state verification, npm registry visibility verification, release-note preparation, and GitHub Release creation have succeeded. The branch was observed removed after publication. The connector session did not expose the publication workflow run id or GitHub Release numeric id, so this record does not invent either identifier.

## Purpose

v0.14.1 is a focused maintenance hotfix over v0.14.0 for two field-reproduced Codex consumer-activation failures.

### Registry bootstrap

The previous generated fallback used `npx --no --package=codex-memory-intelligence cmi-mcp`. On a consumer repository without a local or cached package, npm refused to bootstrap the package.

The v0.14.1 path uses non-interactive exact-version execution:

```text
npx --yes --package=codex-memory-intelligence@<CMI_VERSION> cmi-mcp
```

### Project-root binding

The previous generated MCP block used a relative working directory without an explicit project-root environment binding. In the reproduced Codex Desktop path, the MCP process could resolve the project as `/`, causing durable writes to target `/.codex-memory` and fail.

v0.14.1 binds both the managed MCP working directory and `CMI_PROJECT_ROOT` to the resolved activated repository root. If the repository moves or is cloned to another path, activation must be rerun to regenerate the managed root-bound block.

## Evidence

Field reproduction on one real consumer project established this sequence:

1. registry fallback initially failed to bootstrap the package;
2. after bootstrap correction, the requested lifecycle tools became visible;
3. Session start then failed because the project root resolved to `/`;
4. explicit project-root binding allowed Ambient brief, Session start, observation, finalization, durable project-local evidence, and Closing Intelligence to complete.

PR #111 added regression coverage for registry fallback arguments, project-root binding, exact-local behavior, write opt-in, and activation idempotence. Its final head passed hosted CI across Ubuntu, macOS, and Windows on Node.js 22 and 24 plus CodeQL.

PR #112 aligned package/runtime/changelog/README/security metadata to `0.14.1`; its exact head passed CI, CodeQL, Operational Trust, coverage, benchmark/release-metadata checks, and package smoke before merge.

## Canonical installation and activation

The supported setup is documented in the repository README. The important activation invariant is:

```bash
cd /absolute/path/to/your-project
cmi activate
cmi doctor
```

`cmi activate` uses the current working directory as the activation root and does not accept a project-path positional argument. One-off npm execution must identify the package explicitly, for example:

```bash
npx --yes --package=codex-memory-intelligence@0.14.1 cmi activate
```

Bare `npx cmi` is not the canonical CMI installation/activation instruction because `codex-memory-intelligence` is the npm package name and `cmi` is one of its binary names.

## Compatibility and claim boundary

- Node.js support remains `>=22`.
- Existing `cmi`, `cmi-mcp`, and `cmi-trust` entrypoints remain supported.
- Exact-local package binding remains preferred when a valid local CMI package exists.
- Registry fallback remains bounded to the activating CMI version.
- Absolute project-root values are managed integration state, not portable durable project truth.
- Evidence Contract v2 remains simulation-only and is not exposed as a production negotiation/discovery surface.
- The reproduced field path is concrete compatibility evidence for the bounded defect and fix; it is not universal Codex compatibility proof.
- Publication, CI, CodeQL, and field evidence do not establish productivity improvement, complete security certification, or v1 readiness.

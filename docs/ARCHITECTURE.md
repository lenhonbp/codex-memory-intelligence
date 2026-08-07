# Architecture

CMI is intentionally local-first, dependency-free at runtime, bounded, and explainable.

## Data flow

```text
project files
    │
    ├── ignore matcher (.cmiignore + config + locked built-ins)
    │       └── safe regular-file inventory
    │
    ├── workspace detector
    │       └── npm/pnpm, Cargo, and Go workspace inventory
    │
    └── incremental graph parser
            ├── reuse unchanged parser-versioned nodes
            ├── reparse changed nodes
            ├── re-resolve every import against current repository shape
            └── project-graph.json

memory.md / decisions.md / mistakes.md
    │
    ├── ranked retrieval and context packs
    ├── source fingerprints
    └── stale-memory checks

local Git metadata + graph + ranked context
    │
    └── advisor
            ├── bounded repository baseline
            ├── advisory boundary map
            ├── exact or context-seeded impact
            ├── review-only memory-gap proposals
            └── structured pre-change brief

CLI and MCP expose the same core operations.
```

## Modules

- `src/paths.js` — real-path project-boundary enforcement.
- `src/ignore.js` — built-in exclusions, `.cmiignore`, configuration patterns, negation, and explanations.
- `src/workspaces.js` — workspace-manifest detection and file-to-workspace assignment.
- `src/core.js` — initialization, configuration migration, safe traversal, scanning, memory writes, snapshots, status, and diagnostics.
- `src/graph.js` — language parsing, alias/module resolution, incremental node reuse, reverse dependencies, and impact analysis.
- `src/search.js` — accent-insensitive ranked retrieval and workspace-scoped context packs.
- `src/stale.js` — metadata parsing, source fingerprints, health classification, and reviewed refresh.
- `src/advisor.js` — bounded Git baseline, deterministic boundary inference, memory-gap proposals, risk/verification heuristics, and pre-change briefs.
- `src/cli.js` — human-facing command-line interface.
- `src/mcp.js` — MCP JSON-RPC stdio server exposing tools, resources, and prompts.

## Sources of truth

Durable human knowledge lives in Markdown. `project-index.json` and `project-graph.json` are generated caches and may be deleted and rebuilt with `cmi scan --full`.

Memory metadata is embedded in HTML comments immediately below each timestamp heading. It records a stable ID, type, creation date, optional source paths and hashes, project-structure hash, and most recent review information.

Git baseline data, inferred boundaries, risks, verification suggestions, and memory-gap proposals are transient advisory outputs. They are not stored as durable truth by default.

## Incremental model

Each source node stores a parser version and a filesystem fingerprint composed of file size, modification time, and change time. A subsequent scan reuses symbols and raw import specifiers when the fingerprint and parser version match. Import resolution is still recomputed for every node so new files, deleted files, workspace changes, and TypeScript alias changes can alter edges without forcing every source file to be reread.

`cmi scan --full` disables reuse. Incremental fingerprints are an optimization, not cryptographic content identity; adversarial preservation of all fingerprint fields is outside the intended threat model.

## Ignore model

Locked built-ins exclude dependency folders, common generated outputs, `.git`, `.codex-memory`, and symbolic links. `.cmiignore` and `ignorePatterns` are evaluated in order and support negation. Custom rules cannot re-include locked safety boundaries.

## Workspace model

Detected workspaces have a stable ID in the form `ecosystem:path`. A file belongs to the deepest matching workspace path. Root manifests may produce a root workspace (`ecosystem:.`). Cross-workspace import edges are counted and impact results include all affected workspace IDs.

## Graph model

Each indexed source file is a node containing language, fingerprint, workspace, imports, and symbols. Resolved local imports create directed edges; reverse edges support impact analysis.

Resolution is deliberately bounded:

- JavaScript/TypeScript relative imports and `compilerOptions.paths` aliases.
- Python relative and common absolute package layouts.
- Go module imports mapped to a deterministic non-test file in the target package.
- Rust `mod`, `crate::`, `self::`, and `super::` module paths.

The graph does not replace a compiler, language server, or build system.

## Advisory model

The advisor follows four rules:

1. **Observed evidence and inference remain separate.** Git metadata, durable memory, file paths, workspaces, symbols, and import edges are evidence. Boundary names, topic classifications, risk levels, and verification suggestions are inferences.
2. **Inference is deterministic and bounded.** It uses fixed path, workspace, graph, and task heuristics; it does not access the network or execute project code.
3. **Confidence and provenance are explicit.** Inferred boundaries include confidence, and change briefs state how baseline, context, impact, boundaries, and memory suggestions were derived.
4. **Suggestions are never durable truth.** Memory gaps are review prompts. Only explicit write-enabled operations may persist reviewed knowledge.

Boundary inference groups files by workspace-relative directory structure and then summarizes cross-boundary import edges. Flat repositories may produce a low-confidence `Root source` boundary rather than fabricated domain names.

Impact analysis first attempts an exact file or symbol match. When that fails, a change brief may use a bounded set of ranked context files as seed nodes. This fallback is labeled as inferred and carries lower confidence.

## Git baseline model

Baseline collection invokes Git through fixed argument arrays, a bounded timeout, and a bounded output buffer. It reports branch, commit, clean/dirty state, bounded changed paths, upstream, and ahead/behind counts when available. It does not interpolate user input into shell commands and does not return the absolute repository path.

Projects outside a Git worktree remain supported; the baseline is reported as unavailable without blocking graph, memory, or context operations.

## MCP compatibility

The stdio server uses newline-delimited UTF-8 JSON-RPC messages and supports stable MCP protocol versions `2024-11-05`, `2025-03-26`, `2025-06-18`, and `2025-11-25`. It exposes tools, resources, and prompts after the initialize/initialized lifecycle. Durable-memory mutation tools are fixed at process startup through environment configuration.

The 2026-07-28 MCP release candidate is intentionally not advertised as stable support until the specification is finalized and client behavior is validated.

## Compatibility

- Node.js 22+
- Existing `.codex-memory/` directories migrate in place.
- Runtime dependencies remain at zero.
- Generated schema versions: config 4, project index 5, project graph 3.
- Pre-change brief schema version: 1.

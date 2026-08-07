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

pre-change brief + local Git evidence + completed change history
    │
    └── change intelligence
            ├── BEFORE predicted scope and historical evidence
            ├── DURING observed changed paths and prediction gaps
            ├── AFTER outcome, verification claims, and unexpected impact
            ├── bounded historical co-change evidence
            └── review-only learning candidates

CLI and MCP expose the same core operations, with durable MCP writes requiring explicit opt-in.
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
- `src/change-intelligence.js` — durable change records, Git-based observation, prediction comparison, historical co-change evidence, verification patterns, and review-only learning candidates.
- `src/cli.js` — human-facing command-line interface.
- `src/mcp.js` — MCP JSON-RPC stdio server exposing tools, resources, and prompts.

## Sources of truth

CMI deliberately separates three categories of project data.

### Durable reviewed knowledge

Human-reviewed project facts, decisions, and mistakes live in Markdown. Memory metadata is embedded in HTML comments immediately below each timestamp heading and records a stable ID, type, creation date, optional source paths and hashes, project-structure hash, and most recent review information.

These files can describe project truth, but they still require human or explicitly reviewed agent judgment.

### Durable change evidence

`.codex-memory/changes/<uuid>.json` stores bounded evidence about completed or active work. A change record can contain the original goal, pre-change baseline, predicted scope, observed changed project paths, verification claims, outcome, unexpected impact, and learning candidates.

Change records are history, not automatically project truth. CMI never converts a change record, a failed check, a co-change edge, or a prediction gap directly into durable Markdown memory.

Change records are intentionally commit-friendly. CMI excludes all `.codex-memory/` paths from observed product-change scope so a record cannot observe its own writes as application changes.

### Rebuildable and transient intelligence

`project-index.json` and `project-graph.json` are generated caches and may be deleted and rebuilt with `cmi scan --full`.

Git baseline data, inferred boundaries, risks, verification suggestions, memory-gap proposals, historical ranking, and co-change summaries are derived or transient intelligence. They are not durable truth by themselves.

## Incremental model

Each source node stores a parser version and a filesystem fingerprint composed of file size, modification time, and change time. A subsequent scan reuses symbols and raw import specifiers when the fingerprint and parser version match. Import resolution is still recomputed for every node so new files, deleted files, workspace changes, and TypeScript alias changes can alter edges without forcing every source file to be reread.

`cmi scan --full` disables reuse. Incremental fingerprints are an optimization, not cryptographic content identity; adversarial preservation of all fingerprint fields is outside the intended threat model.

## Ignore model

Locked built-ins exclude dependency folders, common generated outputs, `.git`, `.codex-memory`, and symbolic links from source scanning. `.cmiignore` and `ignorePatterns` are evaluated in order and support negation. Custom rules cannot re-include locked safety boundaries.

The `.codex-memory` exclusion applies to source intelligence. Durable memory and change records are read through their dedicated storage paths rather than through the source scanner.

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

1. **Observed evidence and inference remain separate.** Git metadata, reviewed memory, file paths, workspaces, symbols, and import edges are evidence. Boundary names, topic classifications, risk levels, and verification suggestions are inferences.
2. **Inference is deterministic and bounded.** It uses fixed path, workspace, graph, and task heuristics; it does not access the network or execute project code.
3. **Confidence and provenance are explicit.** Inferred boundaries include confidence, and change briefs state how baseline, context, impact, boundaries, and memory suggestions were derived.
4. **Suggestions are never durable truth.** Memory gaps are review prompts. Only explicit write-enabled operations may persist reviewed knowledge.

Boundary inference groups files by workspace-relative directory structure and then summarizes cross-boundary import edges. Flat repositories may produce a low-confidence `Root source` boundary rather than fabricated domain names.

Impact analysis first attempts an exact file or symbol match. When that fails, a change brief may use a bounded set of ranked context files as seed nodes. This fallback is labeled as inferred and carries lower confidence.

## Change Intelligence model

The change-intelligence layer adds project history without adding a remote AI model or hidden learning process.

### BEFORE

`startChangeRecord` builds the existing pre-change brief and stores a bounded prediction snapshot:

- project-relative predicted files;
- inferred relevant boundaries;
- advisory risks and verification guidance;
- bounded Git baseline;
- relevant completed change records available at that moment;
- historical co-change and verification patterns available at that moment.

This preserves what the system knew before implementation rather than recomputing a favorable prediction afterward.

### DURING

`observeChangeRecord` compares the recorded BEFORE state with current evidence. When Git is available it observes:

- commits after the recorded starting HEAD;
- current worktree paths attributable to the task;
- pre-existing dirty paths separately when attribution is ambiguous.

Explicit project-relative paths can be supplied for non-Git projects or evidence Git cannot represent. Explicit paths inside `.codex-memory/` are rejected.

Attribution is labeled:

- `strong` — the task started from a clean project worktree;
- `limited-preexisting-worktree` — project paths were already dirty and may be ambiguous;
- `explicit-files-only` — no usable Git baseline exists.

### AFTER

Completion stores an outcome plus verification evidence supplied by the human or agent. CMI does not execute the verification command and does not independently certify the reported result.

Prediction comparison records:

- overlap between predicted and directly changed paths;
- changed paths missed by the prediction;
- predicted paths not directly changed;
- `changedPathCoverage`;
- `predictedScopeTouched`.

These metrics describe path-set overlap only. They are not compiler precision/recall, proof of runtime impact, or proof that an unchanged dependency was irrelevant.

### Historical behavioral evidence

Completed records can be ranked for a later task using deterministic token overlap. CMI derives bounded file-pair and boundary-pair co-change frequencies and verification-name patterns from those matching records.

A co-change edge means only that two items occurred in the same stored change records. It does not mean import dependency, ownership, causation, or required coupling. Confidence labels on co-change edges currently reflect repeat count, not a statistical causal model.

### Learning boundary

Prediction gaps, failed verification claims, and unexpected impact can become `proposal` learning candidates. They require review before any fact, decision, or mistake is persisted through the durable-memory interface.

This produces a controlled loop:

```text
observed history
→ review candidate
→ confirmed project knowledge only when justified
```

## Git baseline model

Baseline collection invokes Git through fixed argument arrays, a bounded timeout, and a bounded output buffer. It reports branch, commit, clean/dirty state, bounded changed paths, upstream, and ahead/behind counts when available. It does not interpolate user input into shell commands and does not return the absolute repository path.

Change intelligence sanitizes its baseline further by excluding CMI-internal paths from product-change attribution while recording how many internal changes were omitted.

Projects outside a Git worktree remain supported; baseline intelligence is reported unavailable and change observation falls back to explicitly supplied project-relative paths.

## MCP compatibility

The stdio server uses newline-delimited UTF-8 JSON-RPC messages and supports stable MCP protocol versions `2024-11-05`, `2025-03-26`, `2025-06-18`, and `2025-11-25`. It exposes tools, resources, and prompts after the initialize/initialized lifecycle.

Read-only history queries are available by default. Durable memory writes and change-record lifecycle writes are fixed at process startup through `CMI_WRITE_ENABLED=1`. Bulk memory refresh still requires its separate opt-in.

The 2026-07-28 MCP release candidate is intentionally not advertised as stable support until the specification is finalized and client behavior is validated.

## Compatibility

- Node.js 22+
- Existing `.codex-memory/` directories migrate in place.
- Runtime dependencies remain at zero.
- Generated schema versions: config 4, project index 5, project graph 3.
- Pre-change brief schema version: 1.
- Change-record schema version: 1.

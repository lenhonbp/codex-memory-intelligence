# Ambient Agent Intelligence

Ambient Agent Intelligence is the integration layer that lets a user activate CMI once and then talk to a supported coding agent normally, including with short natural-language prompts.

## One-time activation

```bash
npx cmi activate
```

For the Codex adapter, activation safely manages a bounded block in root `AGENTS.md` and a project-scoped `.codex/config.toml` MCP entry. Existing user content is preserved. Unmanaged conflicting CMI MCP configuration is rejected instead of overwritten.

Activation initializes CMI when needed, refreshes project intelligence, and configures the supported agent integration. It does not create facts/decisions/mistakes from inference.

Codex builds project instructions when a run/session starts, so start a new Codex run/session after first activation. Project-scoped Codex configuration also depends on the client trusting that project.

## Natural task routing

`cmi ambient "<user request>"` and the MCP tool `get_ambient_task_brief` provide a read-only task brief containing current evidence health, raw/product Git state, relevant project context when available, optional pre-change preparation for mutation requests, continuation handoff, and conservative workflow hints. The brief is not a session and cannot support a Closing Intelligence footer by itself.

For every substantive task, the supported Codex integration starts or resumes a durable work session, including for read-only investigation, review, and verification. When MCP is unavailable, invoke the exact project-local package entrypoint from the project root; do not depend on `node_modules/.bin` being on `PATH`:

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" ambient "<user request>" --json
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" session start "<goal>" --json
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" session observe <id|latest> --accomplished "..." --file path/to/checked-file --json
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" session close <id|latest> --outcome investigated --json
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" session closing <id|latest> --json
```

The path above is a bounded local resolution: it identifies the installed `codex-memory-intelligence` package and runs its shipped CLI entrypoint with Node. A failed bare `cmi` command must not terminate this sequence. Do not replace it with `npx cmi` for lifecycle work: npm execution can select a cached or registry package rather than the activated project's exact dependency. If the exact local entrypoint is absent or unusable and MCP is unavailable, the lifecycle is unavailable and that limitation must be reported honestly.

`cmi status`, `cmi doctor`, and the ambient brief remain useful health/context evidence, but they are not substitutes for session start/observe/close. A `### CMI Intelligence` footer may say `CLEAN` only when `cmi session closing` or the equivalent MCP Closing Intelligence surface returned a real closed-session result with no material alerts. If lifecycle writes are unavailable or closing fails, report project/evidence health separately and say that Closing Intelligence was not finalized; do not synthesize a Closing-style footer from healthy status data.

Intent routing is deterministic and deliberately bounded to `continue`, `mutate`, `review`, `investigate`, or `unknown`. Unknown is a valid outcome. Classification does not authorize edits or broaden scope.

## Trust boundaries

- CMI remains agent-independent at the core; agent adapters only configure supported instruction/tool surfaces.
- CMI cannot force an arbitrary client that ignores project instructions or MCP to use it.
- Automatic retrieval and work tracking do not imply automatic promotion of inferred knowledge into durable project truth.
- Tests/builds/migrations/deployments remain commands the connected agent executes through its normal environment; CMI records bounded evidence but does not pretend to have executed them.
- Short prompts are sufficient for supported integrations, but user intent remains authoritative over CMI recommendations.

## Field UX remediation

This development line also makes unchanged architecture scans byte-stable, stores active sessions under ignored transient state until finalization, reports raw Git cleanliness separately from product-scope cleanliness, classifies existing relative CSS/static imports as non-code local dependencies rather than unresolved source imports, suppresses generic memory/test advice when there is no task-specific evidence, and preserves intentionally partial Change Intelligence records as active cross-session work.

Session completion is independent from Change completion. When a user requests a pause, review checkpoint, or partial implementation, observe the actual progress and verification, keep the related Change active, and close only the session so the handoff exposes it under `activeChanges`. Complete the Change only after the requested work is actually finished; explicit abandonment remains a separate terminal outcome.

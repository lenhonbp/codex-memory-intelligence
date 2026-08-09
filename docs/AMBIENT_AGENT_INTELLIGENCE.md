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

`cmi ambient "<user request>"` and the MCP tool `get_ambient_task_brief` provide a read-only task brief containing current evidence health, raw/product Git state, relevant project context when available, optional pre-change preparation for mutation requests, continuation handoff, and conservative workflow hints.

Intent routing is deterministic and deliberately bounded to `continue`, `mutate`, `review`, `investigate`, or `unknown`. Unknown is a valid outcome. Classification does not authorize edits or broaden scope.

## Trust boundaries

- CMI remains agent-independent at the core; agent adapters only configure supported instruction/tool surfaces.
- CMI cannot force an arbitrary client that ignores project instructions or MCP to use it.
- Automatic retrieval and work tracking do not imply automatic promotion of inferred knowledge into durable project truth.
- Tests/builds/migrations/deployments remain commands the connected agent executes through its normal environment; CMI records bounded evidence but does not pretend to have executed them.
- Short prompts are sufficient for supported integrations, but user intent remains authoritative over CMI recommendations.

## Field UX remediation

This development line also makes unchanged architecture scans byte-stable, stores active sessions under ignored transient state until finalization, reports raw Git cleanliness separately from product-scope cleanliness, classifies existing relative CSS/static imports as non-code local dependencies rather than unresolved source imports, and suppresses generic memory/test advice when there is no task-specific evidence.

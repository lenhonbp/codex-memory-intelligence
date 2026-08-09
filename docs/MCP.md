# MCP integration

CMI exposes local project, change, session-continuation, and real-repository evaluation intelligence over MCP stdio.

## Configuration

Safe default:

```bash
cmi mcp-config
```

This keeps **all durable project writes disabled**, including generated scan/index/graph cache writes. Read-only durable history, existing memory search, existing graph intelligence, advisory pre-change analysis, change history, session reports, handoffs, persistent findings, and evaluation reports remain available when their underlying evidence already exists.

`scan_project_intelligence` is deliberately absent from safe/default `tools/list`. A client that attempts to call it directly by name is rejected before `scanProject()` executes, so safe MCP cannot create `.codex-memory` as a side effect of a scan.

Enable durable project writes explicitly when a connected agent should scan/update generated caches, create project memory, review memory/finding lifecycle, create BEFORE/DURING/AFTER change records, track/finalize work sessions, or capture a reviewed/anonymized evaluation record:

```bash
cmi mcp-config --write
```

Bulk source-fingerprint refresh requires another opt-in:

```bash
cmi mcp-config --write --bulk-refresh
```

`--write` does not grant CMI permission to execute arbitrary project commands. The connected agent/user remains responsible for tests, builds, migrations, profilers, deployment tools, and other verification. CMI only stores bounded evidence submitted to its interfaces or directly observable repository metadata.

## Protocol compatibility

Supported stable protocol versions:

- `2024-11-05`
- `2025-03-26`
- `2025-06-18`
- `2025-11-25`

The server echoes a supported requested version and otherwise responds with `2025-11-25`. It requires `initialize`, then `notifications/initialized`, before normal operations. Ping is allowed during initialization.

The transport is newline-delimited UTF-8 JSON-RPC over stdin/stdout. Logs are written only to stderr.

The installed `cmi-mcp` entrypoint is session-aware and evaluation-aware: it preserves the existing MCP server as the core protocol surface and augments it with continuation/evaluation tools, resources, prompts, and server instructions.

## Read/default tools

Existing read/default tools include:

- `search_project_memory` — search active durable memory and indexed project context;
- `build_project_context` — build a ranked task context pack;
- `get_repository_baseline` — bounded Git baseline without absolute local paths;
- `map_project_boundaries` — inferred boundary map with confidence and provenance;
- `suggest_project_memory` — review-only memory-gap proposals;
- `prepare_change_brief` — structured pre-change brief;
- `get_change_insights` — relevant completed changes, co-change evidence, verification patterns, and path-overlap calibration;
- `get_change_record` — read one durable change record;
- `list_change_records` — list bounded active/completed record summaries;
- `get_project_memory_status` — memory/index/graph/workspace health;
- `list_project_workspaces` — detected workspaces;
- `explain_project_ignore` — explain ignore behavior;
- `get_project_graph` — compact graph statistics;
- `analyze_project_impact` — reverse-dependency impact analysis that returns blocked when graph freshness cannot be established;
- `check_stale_memory` — active-memory stale/review audit, blocked-file diagnostics, and inactive lifecycle inventory.
- `get_executable_provenance` — actual runtime/script, resolved package root/version, source-checkout revision, install kind, candidates, ambiguity, and limitations.
- `inspect_portable_evidence` — validate a frozen evidence bundle's manifest, bounded artifact inventory, safe paths, and digests without writing project state.

Evaluation read tools add:

- `list_project_evaluations` — list bounded anonymized records with source/protocol/review provenance;
- `get_project_evaluation` — read one evaluation record by ID/prefix;
- `get_project_evaluation_report` — aggregate corpus coverage and reviewed usefulness while keeping evidence classes separate.

Session-continuation read tools add:

- `get_work_session_status` — assess the latest/selected active session now, including current findings and prioritized next actions;
- `get_work_session_report` — read an active or closed durable session record;
- `list_work_sessions` — list bounded session summaries and recorded next actions;
- `get_session_handoff` — read a closed-session continuation pack;
- `list_project_findings` — list findings that persist across session boundaries;
- `get_project_finding` — inspect one persistent finding and its evidence/lifecycle.

`search_project_memory` and `build_project_context` accept two evidence-policy controls:

- `stalePolicy: demote | include | exclude` — `demote` is the default and keeps stale/review evidence visible but down-ranked; `include` reduces that penalty for explicit inspection; `exclude` filters stale/review/untracked knowledge while result metadata still distinguishes source-current `fresh-source` from semantically `reviewed-current` knowledge;
- `includeInactive: true` — explicit historical-inspection mode for `deprecated`, `rejected`, or `superseded` memory. Inactive memory is excluded by default.

Safe/default MCP never creates or refreshes generated caches. If the graph/index is missing or stale, the read tool reports that limitation and instructs the caller to use a write-enabled scan rather than silently mutating the project.

## Write-enabled tools

When the server starts with `CMI_WRITE_ENABLED=1`, existing write tools include:

- `freeze_portable_evidence` — create a bounded digest-verified evidence bundle outside the project;
- `restore_portable_evidence` — restore only after source-content, frozen policy, repository/revision, and relevant cleanliness compatibility checks;
- `rebind_portable_evidence` — perform the same verified restore as an explicit relocation request and always create or validate rebind provenance, including when identical evidence is already present;

- `scan_project_intelligence` — incrementally/full scans the repository and writes generated project index/graph/architecture caches;
- `start_change_record`;
- `observe_change_record`;
- `complete_change_record`;
- `remember_project_knowledge`;
- `refresh_project_memory` — refreshes source fingerprints only and does not attest semantic review;
- `set_project_memory_state`.

Evaluation write tools add:

- `capture_project_evaluation` — persist one bounded evaluation record with explicit source kind, protocol, task/repository class, optional closed-session association, and review provenance. It is absent unless `CMI_WRITE_ENABLED=1`;
- one-time `review_project_evaluation` when write mode is enabled.

Session-continuation write tools add:

- `start_work_session` — start durable tracking for implementation, debugging, audit, review, research, verification, or no-code investigation;
- `observe_work_session` — record accomplishments, files, blockers, decisions, questions, and notes that repository evidence cannot infer reliably;
- `finalize_work_session` — close the session and return outcome, current/open findings, prioritized next actions, knowledge candidates, and handoff;
- `set_project_finding_state` — explicitly resolve, accept, dismiss, reopen, or supersede one persistent finding with a reason.

Memory/finding ID prefixes used for reviewed mutations must resolve uniquely. CMI rejects ambiguous prefixes rather than mutating multiple entries.

Completed change records are immutable through the public change-record API. Closed session records are durable outcome/history rather than an editable scratchpad; continued work should start another session/change record.

## Close-session integration contract

CMI's session-aware MCP `initialize` response explicitly tells the connected agent:

- use session tracking for substantial work when durable writes are enabled;
- before ending substantial work, call `finalize_work_session`;
- surface unresolved P0/P1 findings to the user;
- surface the highest-priority next action without waiting for the user to ask what to do next.

The `close_project_session` prompt repeats that contract. `continue_from_session_handoff` tells the next agent to read the latest handoff, re-check current repository evidence, and address P0/P1 work before unrelated tasks unless the user changes priority.

This is an **agent integration contract**, not a universal lifecycle hook. MCP cannot force an arbitrary client that ignores server instructions/prompts to call `finalize_work_session` before it disconnects.

## Verification provenance

`complete_change_record.verifications[]` distinguishes two provenance classes:

- `reported` — a human or agent reports a named status;
- `observed-command` — the caller supplies bounded command-result metadata: `command`, integer `exitCode`, `observedAt`, and optional `outputDigest`.

`observed-command` does **not** mean CMI executed or independently attested the command. It means command-result metadata was supplied through the interface. CMI still never runs arbitrary project verification commands itself.

The MCP input schema enforces required command metadata whenever `provenance` is `observed-command`, and runtime validation enforces the same durable record shape.

## Session / finding evidence semantics

Session intelligence combines:

- current Git/project/memory health;
- completed/active Change Intelligence records;
- explicit session observations;
- persistent unresolved findings;
- relevant historical verification patterns.

Recommendations carry priority, reason, evidence type, evidence references, and confidence. Known issue classes have deterministic priority ordering; historical suggestions remain explicitly `historical-correlation`.

Persistent findings do not disappear when one AI session ends. Deterministic health findings may auto-resolve when the measured condition disappears; explicit blockers/questions remain review-controlled.

A missing `findings.json` is a valid empty registry. A registry that **exists but is malformed, oversized, symlinked, non-regular, or otherwise unsafe to read is not empty evidence**: finding reads/mutations fail closed with a blocked-registry diagnostic. CMI will not overwrite that corrupt registry through a normal finding mutation.

No recommendation proves business priority or authorizes a project command to run automatically.

## Advisory and historical boundaries

`map_project_boundaries`, `suggest_project_memory`, `prepare_change_brief`, `get_change_insights`, session findings, and next-action intelligence expose evidence-labeled output. They do not declare architecture, causality, production correctness, or business truth.

The output distinguishes:

- directly observed Git/path/project health;
- source-current durable memory (`fresh-source`);
- semantically reviewed current durable memory (`reviewed-current`);
- explicit agent/human session observations;
- deterministic inference;
- historical correlation;
- sample-sensitive confidence/support;
- review proposals requiring explicit approval before durable project knowledge is written.

In particular:

- a source fingerprint that still matches is not evidence that a reviewer has re-validated the meaning of a memory entry;
- a co-change edge means two paths/boundaries appeared in the same stored change records, not that one causes or depends on the other;
- a changed path is direct edit evidence, not proof of complete runtime impact;
- a verification `passed` value remains stored evidence with explicit provenance, not a command independently executed by CMI;
- inactive memory is preserved as project history but is not trusted retrieval input unless explicitly requested;
- a P0/P1 recommendation indicates CMI's deterministic project-risk ordering, not organizational/business priority.

## Resources

Existing resources:

- `cmi://project/memory`
- `cmi://project/decisions`
- `cmi://project/mistakes`
- `cmi://project/architecture`
- `cmi://project/workspaces`
- `cmi://project/graph-summary`
- `cmi://project/baseline`
- `cmi://project/boundaries`
- `cmi://project/change-history`
- `cmi://project/provenance`

Evaluation resources:

- `cmi://project/evaluation-report`

Session-continuation resources:

- `cmi://project/session/latest`
- `cmi://project/session-handoff/latest`
- `cmi://project/findings`

The baseline resource does not expose absolute local repository paths. Change/session history is bounded and does not automatically store source diffs. Raw memory remains reviewable Markdown and may contain inactive lifecycle history; ranked memory search excludes inactive knowledge by default.

`cmi://project/provenance` is intentionally diagnostic and may contain absolute executable/package paths because distinguishing multiple installations is its purpose. Portable evidence reports are digest-verified but not authenticated.

## Prompts

- `prepare_project_change` — inspect completed history and build a structured pre-change brief;
- `run_change_intelligence_loop` — guide BEFORE → DURING → AFTER evidence recording;
- `review_stale_memory` — guide explicit health/lifecycle review;
- `close_project_session` — finalize substantial work and surface P0/P1 + highest-priority next action;
- `continue_from_session_handoff` — resume from the latest durable continuation pack instead of reconstructing known state from scratch.

Prompts do not bypass tool permissions. A prompt can recommend a write tool, but write tools are absent when MCP write mode is disabled.

## Change-record trust model

Change records live under `.codex-memory/changes/`. They are local durable evidence and intentionally reviewable/commit-friendly.

CMI excludes `.codex-memory/` paths from observed product-change scope. This prevents record maintenance from becoming false application-code change evidence.

For clean Git worktrees, new project changes can receive `strong` attribution. Pre-existing project changes produce `limited-preexisting-worktree` attribution. Non-Git projects use `explicit-files-only` attribution.

See [Change Intelligence](CHANGE_INTELLIGENCE.md).

## Session-record / finding trust model

Session records live under `.codex-memory/sessions/`; findings live in `.codex-memory/findings.json`.

They are bounded, local, human-reviewable evidence. Explicit paths must be project-relative and cannot point into `.codex-memory/`. Supplied session text receives the same style of obvious-secret guard as other durable text, but CMI is not a complete secret scanner.

Session records do not prove that every meaningful action in an external agent environment was captured. CMI combines observable repository state with explicit session observations and says when evidence is incomplete.

Finding registry corruption is treated as a trust failure, not as zero findings. Recovery is intentionally explicit so a later write cannot silently erase corrupted-but-potentially-recoverable bytes.

See [Session Continuation Intelligence](SESSION_INTELLIGENCE.md).

## Evaluation trust model

Evaluation records live under `.codex-memory/evaluations/`. Read/list/report are available in safe MCP mode; durable capture is write-gated. MCP uses the same runtime contract as the CLI, including explicit `external-real|self-host|synthetic` source class, `observational|controlled-stress` protocol, CMI version/source revision, and `human|agent|unreviewed` review provenance.

Those identity/classification fields are **caller-attested provenance**, not externally authenticated identities. CMI validates shape and keeps evidence classes separate; it does not independently prove that a repository is external, that a declared reviewer is human, or that a caller actually executed a controlled-stress scenario. Controlled-stress outcomes are derived from supplied invariant counts, which prevents a caller from overriding counts with a more favorable outcome but does not turn supplied counts into independently witnessed measurements.

The evaluation report never promotes self-host/synthetic runs into independent repository evidence, never lets controlled-stress inflate ordinary observational coverage, and never combines agent-reviewed usefulness with human-reviewed usefulness. MCP does not make an evaluation judgment merely because an agent calls the report tool.

See [Real-Repository Evaluation](EVALUATION.md).

## Durable mutation boundary

Durable memory mutations share a local write lock so `remember`, source-fingerprint refresh, and lifecycle mutation do not overwrite each other when multiple local writers operate concurrently. Change records and session/finding storage use their own local locking/atomic-write boundaries.

New durable memory entries carry `schemaVersion: 1` and start with `lifecycle.state: active`. Valid existing metadata without a schema version remains readable for compatibility and is upgraded when explicitly refreshed or lifecycle-mutated. Invalid or future-version metadata blocks retrieval and all normal memory mutations; MCP write enablement does not override this compatibility boundary.

Memory-gap suggestions, session knowledge candidates, and change learning candidates never bypass the write boundary and never become durable project truth automatically.

The safe intended flow is:

```text
read evidence
→ agent/human reasoning
→ explicit scan/cache write or change/session/finding/reviewed-memory write
→ later review/refresh/resolve/deprecate/reject/supersede when evidence changes
```

Bulk memory refresh remains separately guarded even in a write-enabled process.

Portable evidence mutations are also write-gated. The read-only MCP surface exposes provenance and bundle inspection only; direct calls to hidden freeze/restore/rebind operations still fail before any filesystem mutation. Restore/rebind validate the frozen bounded identity policy, all bundle paths and digests, repository/revision/clean-worktree evidence where available, reject symlink/traversal/oversized/corrupt input, refuse blocked evidence and conflicting destinations, and do not promote stale or source-current memory into semantic `reviewed-current` knowledge.

## Longitudinal evaluation

The session-aware MCP evaluation surface exposes explicit reconstruction, follow-up, history-usefulness, and verification-choice review fields plus bounded task/version/time filters on evaluation reads/reports. Human and agent provenance remains separate. Portable evaluation bundle file I/O is CLI-only to avoid granting arbitrary host-file import/export authority through MCP durable-write opt-in.

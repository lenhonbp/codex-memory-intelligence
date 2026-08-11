---
name: cmi-change-loop
description: Orchestrate the evidence-driven CMI Change Intelligence lifecycle (BEFORE start, DURING observe, AFTER complete/progress) for real implementation, refactor, or fix work. Use when the user asks to track a change with CMI, record changed files, finish or pause a Change with verification, or keep partial work active (including Vietnamese change-tracking requests). Write-aware thin adapter; partial keeps the Change active; does not auto-remember learning candidates. External tooling may select it. CMI activation does not auto-apply Skills. npm may deliver this Skill artifact as package content, but npm installation does not activate or install it into an agent runtime.
---

# Skill: cmi-change-loop

## 1. Purpose

Orchestrate the existing evidence-driven Change Intelligence lifecycle:

```text
BEFORE → DURING → AFTER
```

for **actual** implementation, refactor, or fix work.

This Skill is a thin orchestration adapter over existing Change MCP/CLI surfaces. It does **not** reimplement change prediction, lifecycle rules, verification provenance logic, or impact causality.

Do not create a Change merely for read-only investigation. Prefer `cmi-work-session` alone for substantive no-code investigation/review/research unless actual edits begin.

## 2. Appropriate trigger

Examples:

- Track this implementation with Change Intelligence
- Start the CMI change loop for this fix
- Record the actual changed files
- Finish the Change and record verification
- Pause this Change for review but keep it active
- “Theo dõi thay đổi này bằng CMI.” / “Tạm dừng Change này để review, đừng đánh dấu hoàn thành.”

## 3. Non-triggers

- Simple explanation or repository read
- Session-only investigation without code changes (`cmi-work-session`)
- Continuation from handoff (`cmi-continue`)
- Read-only Closing (`cmi-closing`)
- Activation (`cmi-activate`)

## 4. Mutation trust model

This Skill orchestrates **CMI durable Change mutations**.

```text
CMI durable-state permission
!= project source-edit permission
!= permission to execute tests/builds/deploys
!= business-priority authorization
```

CMI write permission does **not** itself authorize project verification commands. Only run tests/builds when already appropriate under the user’s task and normal agent permissions. Record only evidence actually observed.

## 5. MCP write-mode rule (critical)

When MCP is available, use MCP. Required mutation tools:

- `start_change_record`
- `observe_change_record`
- `complete_change_record`

If MCP is available but these write tools are **absent**:

```text
CMI_WRITE_MODE_REQUIRED
```

**Do NOT** silently fall back to CLI. That would bypass MCP write permission. Do not auto-enable write mode or rewrite MCP config.

Optional **read** orientation tool `get_change_insights` may be used when historical evidence is useful and available (read-only; does not require write tools).

## 6. CLI fallback rule

CLI mutation fallback only when **MCP itself is unavailable** and the user intentionally invoked this Skill.

Exact project-local entrypoint only:

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" ...
```

No registry `npx`. Bare `cmi` PATH failure ≠ absence. Missing local entrypoint → `CMI_LOCAL_INTERFACE_UNAVAILABLE`.

## 7. BEFORE

### MCP

Optional read:

- Tool name: `get_change_insights`
- Input schema (authoritative; do not invent fields):

```json
{
  "query": "string",
  "limit": 20
}
```

`query` and `limit` are optional. Use only when historical orientation helps.

Then mutation:

- Tool name: `start_change_record`
- Input schema:

```json
{
  "goal": "string",
  "limit": 12,
  "depth": 3,
  "workspace": "optional"
}
```

Only `goal` is required. Use existing allowed bounds for `limit`/`depth`. Do not invent arguments. The started record contains authoritative BEFORE evidence — do not recreate prediction logic in the Skill.

### CLI (MCP unavailable only)

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" change start "<goal>" [--limit N] [--depth N] [--workspace name-or-path] --json
```

## 8. DURING

### MCP

- Tool name: `observe_change_record`
- Input schema:

```json
{
  "id": "required-change-id-or-prefix",
  "files": ["optional/project-relative/path"]
}
```

`id` is required. `files` are optional explicit evidence only when needed. Prefer CMI/Git observable state. Do not invent changed paths. Do not store source diffs.

### CLI (MCP unavailable only)

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" change observe <id-or-prefix> [--file project-relative-path ...] --json
```

## 9. AFTER / progress

### MCP

- Tool name: `complete_change_record`
- Input schema:

```json
{
  "id": "required",
  "outcome": "optional",
  "files": [],
  "verifications": [],
  "unexpectedImpact": [],
  "notes": []
}
```

Supported outcomes only:

```text
succeeded
failed
partial
abandoned
unknown
```

**CRITICAL:** `outcome = partial` records progress but preserves the Change as **ACTIVE**. Do not reinterpret the method name `complete_change_record` as meaning every call is terminal. Core lifecycle is authoritative.

### CLI (MCP unavailable only)

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" change complete <id-or-prefix> [--outcome succeeded|failed|partial|abandoned|unknown] [--file path ...] [--verify "name=status" ...] [--unexpected "text" ...] [--note "text" ...] --json
```

CLI `--verify name=status` is **reported** evidence. Do not relabel it as independently witnessed CMI command execution.

## 10. Verification provenance

For MCP verification objects preserve the two provenance classes:

```text
reported
observed-command
```

Minimum:

```json
{
  "name": "string",
  "status": "passed|failed|skipped|unknown"
}
```

When `provenance = observed-command`, supply real observed evidence:

```json
{
  "command": "actual command",
  "exitCode": 0,
  "observedAt": "actual date-time"
}
```

Optional: `outputDigest`. Never label verification `observed-command` unless command/result metadata was actually observed. CMI itself does not execute those commands.

## 11. Partial / pause / review checkpoint (critical)

When work is intentionally partial, paused, awaiting review, checkpointed, or not finished:

1. Record progress with `outcome = partial` when useful.
2. Leave the Change **ACTIVE**.

If a work session is also ending: **close only the session** (`cmi-work-session`). The Change must remain unfinished/current per core evidence.

Do **NOT** convert `partial` into a tidy terminal “completed/partial” story. Do not use a terminal outcome to make the record look tidy.

## 12. Terminal Change boundary

Use a terminal outcome only per existing core semantics. `abandoned` is the explicit terminal path for intentionally canceled work.

Do **not** terminalize a Change solely because:

- the session ended
- the chat ended
- the agent reached a checkpoint
- review is pending
- another task is starting

## 13. Learning-candidate boundary

Learning candidates from change progress remain **proposals**.

**NEVER** automatically call:

- `remember_project_knowledge`
- `cmi remember` / project-local `remember`

Do not promote prediction gaps, failed verification, or unexpected impact into durable fact/decision/mistake without explicit human/authorized review.

## 14. Forbidden

Do not:

- auto-remember learning candidates
- infer causal impact from co-change
- treat predicted scope as complete runtime impact
- claim changed paths prove all affected behavior
- terminalize partial work
- complete a session automatically unless `cmi-work-session` is actually in scope
- resolve findings automatically
- execute arbitrary project commands merely because CMI recommended them
- silently CLI-bypass when MCP is present without write tools
- use registry `npx`

## 15. Failure behavior

| Condition | Required behavior |
|-----------|-------------------|
| MCP + write tools | Use documented Change MCP tools. |
| MCP without write tools | `CMI_WRITE_MODE_REQUIRED` — no CLI bypass. |
| MCP unavailable | Project-local Change CLI only. |
| Local entrypoint missing | `CMI_LOCAL_INTERFACE_UNAVAILABLE`. |
| Partial checkpoint | Keep Change active. |

## 16. Relationship to other Skills

| Concern | Skill |
|---------|--------|
| Active session lifecycle | `cmi-work-session` |
| Session ≠ Change independence | both Skills respect core; this Skill never terminalizes on session end alone |
| Continuation | `cmi-continue` |
| Activation | `cmi-activate` |

This Skill does not change CMI core contracts.

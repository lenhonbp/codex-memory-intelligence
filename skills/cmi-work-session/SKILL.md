---
name: cmi-work-session
description: Orchestrate the durable CMI work-session lifecycle (start, observe meaningful progress, finalize) and surface authoritative Closing Intelligence/handoff. Use when the user asks to track work as a CMI session, record blockers/decisions/progress, or finalize/close the current session (including Vietnamese session-tracking requests). Write-aware thin adapter over existing session surfaces; does not terminalize Changes or install Skills. External tooling may select it. CMI activation does not auto-apply Skills, and npm install does not deliver or activate them.
---

# Skill: cmi-work-session

## 1. Purpose

Orchestrate the existing durable CMI **active work-session** lifecycle:

```text
START → OBSERVE meaningful progress → FINALIZE session → authoritative Closing Intelligence / handoff
```

This Skill is a thin orchestration adapter over existing session MCP/CLI surfaces. It does **not** reimplement session outcome derivation, finding generation, Closing alert ranking, or Change lifecycle.

**Distinct from:**

| Skill | Role |
|-------|------|
| `cmi-closing` | Read-only Closing Intelligence for an **already-closed** session |
| `cmi-continue` | Resume from historical handoff + current evidence |
| `cmi-change-loop` | BEFORE/DURING/AFTER Change Intelligence for real code changes |

This Skill is a repository-only reusable workflow artifact. It is not a Skill loader and is not auto-applied by activation. External agent tooling may select it; CMI does not load Skills.

## 2. Appropriate trigger

Select this Skill when the user or an already-authorized workflow asks to:

- start/track a CMI work session
- record meaningful progress, blockers, questions, or decisions
- finalize/close the current CMI session
- track a substantial investigation/review/verification session

Examples: “Track this work as a CMI session.” / “Record this blocker in the current session.” / “Finalize the CMI session.” / “Theo dõi công việc này bằng CMI session.” / “Kết thúc phiên CMI và giữ handoff.”

## 3. Non-triggers

Do **not** select this Skill for:

- trivial repository questions
- read-only Closing of a past session (`cmi-closing`)
- continuation from last handoff alone (`cmi-continue`)
- starting a Change loop for implementation (`cmi-change-loop`)
- CMI activation/integration setup (`cmi-activate`)

## 4. Mutation trust model

This Skill intentionally orchestrates **CMI durable-state mutations** for sessions.

```text
CMI durable-state permission
!= project source-edit permission
!= permission to execute tests/builds/deploys
!= business-priority authorization
```

Write-enabled CMI does **not** authorize arbitrary project commands, source edits, or priority changes. User intent remains authoritative.

## 5. MCP write-mode rule (critical)

When MCP is available:

1. Prefer MCP session tools.
2. Required mutation tools (`start_work_session`, `observe_work_session`, `finalize_work_session`) must be **exposed** by the connected server.
3. If MCP is available but required write tools are **absent** (safe/read-only MCP mode):

```text
CMI_WRITE_MODE_REQUIRED
```

Explain that an explicitly write-enabled CMI MCP configuration is required.

**Do NOT** silently fall back to CLI when MCP is available but write tools are missing — that would bypass the MCP write permission boundary.

Do not automatically enable write mode or rewrite MCP configuration.

## 6. CLI fallback rule

CLI mutation fallback is allowed **only when MCP itself is unavailable** and the user intentionally invoked this Skill.

Use the exact project-local entrypoint:

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" ...
```

Do **not** use registry `npx` (or any registry-resolved package invocation) as a session fallback. A bare `cmi` PATH failure is not absence proof. If the exact local entrypoint is unavailable: `CMI_LOCAL_INTERFACE_UNAVAILABLE`. Do not install automatically.

## 7. Primary workflow

### 7.1 START

**MCP** (write tool):

- Tool name: `start_work_session`
- Input schema (authoritative; do not invent fields):

```json
{
  "goal": "string",
  "files": ["project/relative/path"],
  "notes": ["text"],
  "accomplished": ["text"],
  "blockers": ["text"],
  "decisions": ["text"],
  "questions": ["text"]
}
```

Rules:

- `goal` is **required**.
- Optional observation arrays only when meaningful evidence exists.
- Requires MCP write opt-in.

**CLI** (MCP unavailable only):

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" session start "<goal>" --json
```

Optional repeatable flags when relevant: `--file`, `--note`, `--accomplished`, `--blocker`, `--decision`, `--question`.

### 7.2 OBSERVE

Only submit meaningful evidence. Do not spam observations. Do not fabricate accomplishments/blockers/decisions/questions.

**MCP:**

- Tool name: `observe_work_session`
- Input schema:

```json
{
  "id": "optional-session-id-or-prefix",
  "files": [],
  "notes": [],
  "accomplished": [],
  "blockers": [],
  "decisions": [],
  "questions": []
}
```

`id` is optional; core defaults to latest active session.

**CLI** (MCP unavailable only):

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" session observe <id-or-latest> [--file path] [--note text] [--accomplished text] [--blocker text] [--decision text] [--question text] --json
```

### 7.3 FINALIZE

**MCP:**

- Tool name: `finalize_work_session`
- Input schema:

```json
{
  "id": "optional-session-id-or-prefix",
  "outcome": "optional",
  "files": [],
  "notes": [],
  "accomplished": [],
  "blockers": [],
  "decisions": [],
  "questions": []
}
```

Supported `outcome` values only:

```text
succeeded
partial
blocked
investigated
abandoned
unknown
```

Do not invent other outcomes. If outcome is omitted, allow core to derive a conservative outcome. Do **not** choose `succeeded` merely because the user wants to end the chat.

`finalize_work_session` returns the closed session plus authoritative `closingIntelligence` when available. Surface Closing Intelligence faithfully; preserve alert order/severity; do not recompute.

**CLI** (MCP unavailable only):

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" session close <id-or-latest> [--outcome succeeded|partial|blocked|investigated|abandoned|unknown] [observation flags...] --json
```

Then, because JSON close output is not the Closing presentation by itself, retrieve:

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" session closing <closed-id-or-latest> --json
```

Both `session close` and `session closing` must succeed before presenting a Closing-style result. Never fabricate Closing from the close record alone if Closing retrieval failed. `CLEAN` only from a real Closing Intelligence result.

## 8. Session completion ≠ Change completion (critical)

```text
session completion != Change completion
```

Finalizing a work session must **NEVER** automatically terminalize an unfinished Change.

If a Change remains partial, paused, review-pending, or unfinished, the session may close while the Change remains **active**.

This Skill must **not** call `complete_change_record` solely because the session is ending. Historical handoff must preserve active unfinished Changes per core semantics.

## 9. Forbidden automatic actions

This Skill must not automatically:

- start/observe/complete Change records
- resolve/dismiss/accept findings
- remember project knowledge / refresh memory
- scan merely to make the session look healthy
- run tests/builds/deploys
- edit project source
- change user priority
- install or discover Skills

It may record evidence about work the agent actually performed elsewhere under normal user authorization.

## 10. Evidence / provenance

Preserve:

- observed evidence ≠ inference
- inference ≠ reviewed durable knowledge
- reported verification ≠ independently executed verification
- historical handoff ≠ automatic current truth for Changes

Do not fabricate accomplishments, blockers, CLEAN, or Closing alerts.

## 11. Failure behavior

| Condition | Required behavior |
|-----------|-------------------|
| MCP available; write tools present | Use documented MCP tools only. |
| MCP available; write tools absent | `CMI_WRITE_MODE_REQUIRED` — **no** CLI bypass. |
| MCP unavailable; local entrypoint present | Use exact project-local session CLI only. |
| MCP unavailable; local entrypoint missing | `CMI_LOCAL_INTERFACE_UNAVAILABLE`. |
| Closing retrieval failed after CLI close | Do not fabricate Closing/CLEAN. |
| Partial unfinished Change at session end | Leave Change active; do not complete Change. |

## 12. What it must never do

- Invent MCP fields or outcomes
- Silently CLI-fallback when MCP is present without write tools
- Terminalize Changes because the session closed
- Use registry `npx` fallback
- Claim npm install delivers Skills or validates runtime discovery
- Implement a Skill loader or alter activation managed files

## 13. Relationship to other Skills

| Concern | Skill |
|---------|--------|
| Already-closed Closing read | `cmi-closing` |
| Resume unfinished work | `cmi-continue` |
| Implementation Change loop | `cmi-change-loop` |
| Activate CMI integration | `cmi-activate` |

This Skill does not change CMI core contracts.

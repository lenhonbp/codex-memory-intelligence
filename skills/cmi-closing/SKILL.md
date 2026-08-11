---
name: cmi-closing
description: Read and surface existing Closing Intelligence for an already-closed CMI work session (alerts, CLEAN only when authoritative). Use when the user asks what CMI flagged when work ended, blockers/reminders from a closed session, or to show Closing Intelligence / final CMI alerts (including Vietnamese closed-session questions). Strictly read-only thin adapter; does not close or finalize sessions. External tooling may select it. CMI activation does not auto-apply Skills. npm may deliver this Skill artifact as package content, but npm installation does not activate or install it into an agent runtime.
---

# Skill: cmi-closing

## 1. Purpose

Read and surface **existing** Closing Intelligence for an **already-closed** CMI work session. The Skill is a thin orchestration contract over the existing CMI Closing Intelligence **read** surface. It tells the agent which existing CMI MCP tool or project-local CLI invocation to call; it does **not** close sessions, re-rank alerts, recompute severity, or invent CLEAN.

**CRITICAL:** This Skill does **NOT** close a session. Actively closing/finalizing the current session is out of scope (future `cmi-work-session`).

This Skill is a repository-only reusable workflow artifact. It is not a runtime subsystem, not a Skill loader, and is not automatically applied by activation. External agent tooling may select and apply this artifact; CMI itself does not load Skills.

## 2. Appropriate trigger

An external agent (or external agent tooling) should select and apply this workflow artifact when the user or workflow asks to:

- show Closing Intelligence for the last (or a named) **closed** session
- see what CMI flagged when that work ended
- review blockers, warnings, or reminders from a closed session
- show final CMI alerts for a closed session
- Vietnamese equivalents such as “Phiên vừa rồi CMI cảnh báo gì?” or “Cho tôi xem Closing Intelligence của phiên trước.”

## 3. Non-triggers

Do not treat this Skill as:

- Authority to **close** or **finalize** the current/active session (that is not this Skill).
- Automatic wiring for every repository task.
- A substitute for Ambient orientation (`cmi-ambient-brief`).
- A substitute for continuation (`cmi-continue`).
- A substitute for evidence-health readiness (`cmi-evidence-health`).
- A substitute for durable memory review (`cmi-memory-review`).
- Permission to fabricate CLEAN from Git cleanliness, healthy status, empty findings, or lack of active Changes.
- Permission to re-rank or invent alert severities.

User intent remains authoritative. CMI recommendations do not create business priority.

## 4. Primary workflow (read-only)

Prefer MCP when available.

1. Call `get_closing_intelligence` for latest closed session, or with an explicit session id/prefix when the user supplies one.
2. Present alerts and next-action fields **exactly as returned** (severity/order preserved).
3. Show `CLEAN` **only** when the authoritative Closing Intelligence result for a real closed session indicates no material alerts per CMI’s own result.

If no closed session exists or Closing Intelligence is unavailable, report clearly (for example `CLOSING_INTELLIGENCE_NOT_AVAILABLE`). Do **not** synthesize CLEAN.

## 5. Exact existing MCP invocation

- Tool name: `get_closing_intelligence`
- Classification: read-only
- Input schema (authoritative; do not extend):

```json
{
  "id": "string"
}
```

Rules:

- `id` is optional. When provided, it is a **closed** session ID or unique prefix.
- When omitted, CMI selects the latest closed session according to the existing core contract.
- Call only this tool with only the optional `id` field. Do **not** invent `workspace`, `path`, `branch`, `projectRoot`, `write`, `outcome`, or any other undocumented argument.

Optional acknowledgment (not a preferred execution path when the tool is available):

- Resource: `cmi://project/closing-intelligence/latest` may be recognized as an existing read surface.
- Prefer the **tool** `get_closing_intelligence` when tool execution is available.

## 6. Exact local CLI fallbacks

When MCP is unavailable, and only then, use the exact project-local package entrypoint from the project root.

### 6.1 Latest closed session

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" session closing latest --json
```

### 6.2 Selected closed session

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" session closing <session-id-or-prefix> --json
```

Rules:

- Prefer MCP over CLI when MCP is available.
- A bare `cmi` command PATH failure alone is **not** evidence that CMI is unavailable.
- Do **not** use registry `npx` as a fallback.
- If the exact local entrypoint is absent or unusable **and** MCP is unavailable, report `CMI_LOCAL_INTERFACE_UNAVAILABLE` (or equivalent). Do not invent an alternate invocation.
- **Never** replace this with `session close`.
- **Never** invoke `finalize_work_session`.

## 7. CLEAN invariant (critical)

The Skill may surface:

```text
CLEAN
```

**only** when backed by a real authoritative Closing Intelligence result for a real closed session.

It must **NEVER** fabricate Closing-style:

```text
### CMI Intelligence
CLEAN
```

from:

- Git cleanliness
- healthy CMI status alone
- no open findings alone
- no active Changes alone
- lack of evidence
- an active/unclosed session
- an unavailable Closing surface

If no closed session exists:

```text
CLOSING_INTELLIGENCE_NOT_AVAILABLE
```

(or equivalent clear language). Do not synthesize CLEAN.

## 8. Alert fidelity

Do not reimplement or re-rank:

```text
BLOCKER
WARNING
REMINDER
INFO
CLEAN
```

Rules:

- Do not invent a fourth alert type.
- Do not recompute severity.
- Do not upgrade reminders into blockers.
- Do not downgrade blockers.
- Use authoritative returned Closing Intelligence only.
- Historical unfinished work remains a reminder unless stronger core evidence in the returned Closing result says otherwise.
- User priority remains authoritative over CMI recommendations.

## 9. Reviewed rule boundary

A reviewed design/architecture/database/security/other rule surfaced as **relevant** is **not** automatically a proven violation.

Do not rewrite:

```text
relevant reviewed rule
```

as:

```text
confirmed violation
```

unless authoritative observed evidence in the Closing result establishes that violation.

## 10. Read-only boundary

This Skill is **strictly read-only**.

It may invoke only:

- MCP `get_closing_intelligence` (optional `id`)
- CLI `session closing latest --json` or `session closing <id-or-prefix> --json` via the exact project-local entrypoint

It must **not**:

- close or finalize a session
- invoke `finalize_work_session`
- run `session close`
- start a work session
- start/observe/complete a Change
- scan the project
- refresh memory
- remember knowledge
- mutate findings
- mutate `.codex-memory`
- enable CMI write mode
- fabricate CLEAN or Closing footers

Missing write permission is **not** a reason to request write mode.

## 11. Evidence / provenance rules

Preserve:

- observed evidence ≠ inference
- inference ≠ reviewed durable knowledge
- historical closed-session Closing result ≠ current open session state
- reported verification ≠ independently executed verification

Do not promote proposals into durable truth. Closing Intelligence is a read model and never creates durable truth by itself.

## 12. Failure behavior

| Condition | Required behavior |
|-----------|-------------------|
| No closed session / Closing unavailable | `CLOSING_INTELLIGENCE_NOT_AVAILABLE`; do not fabricate CLEAN. |
| MCP available | Use `get_closing_intelligence` only. |
| MCP unavailable; exact local entrypoint present | Use documented `session closing` CLI only. |
| MCP unavailable; exact local entrypoint absent/unusable | Report `CMI_LOCAL_INTERFACE_UNAVAILABLE`. |
| Partial/malformed closing result | State limitations honestly; do not invent alerts or CLEAN. |

Never fabricate CLEAN, blockers, verification results, or durable writes from a failed or partial Closing read.

## 13. What it must never do

- Invent undocumented MCP arguments.
- Invent new CMI commands, tools, schemas, or capabilities.
- Re-rank or recompute alert severity.
- Close/finalize sessions under this Skill.
- Use bare `cmi` as the only documented fallback.
- Prescribe registry `npx` as fallback.
- Claim that npm installation activates this Skill or installs it into an agent runtime.
- Claim Codex/Grok runtime discovery is validated by this artifact alone.
- Alter activation or managed config generation.

## 14. Expected result handling

- Treat tool/CLI JSON (or formatted Closing output) as authoritative.
- Present at most the alerts CMI returned (do not invent additional ones).
- Keep user intent in control for prioritization.
- Do **not** treat this Skill’s output as a newly closed session.
- Do **not** append a fabricated `### CMI Intelligence` / CLEAN section without a real Closing result that supports it.

## 15. Relationship to other Skills

| Concern | Relationship |
|---------|--------------|
| Actively closing a session | Out of scope (future `cmi-work-session`). |
| Continuation | Separate (`cmi-continue`). |
| Evidence health | Separate (`cmi-evidence-health`) — health alone cannot produce CLEAN. |
| Ambient | Separate (`cmi-ambient-brief`). |
| Memory review | Separate (`cmi-memory-review`). |

This Skill does not change CMI core contracts.

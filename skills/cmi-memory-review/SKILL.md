---
name: cmi-memory-review
description: Read-only review preparation for durable CMI memory—surface stale, review-required, untracked, inactive, or blocked entries so a human can decide next steps. Use when the user asks which memory needs review, what knowledge is stale, to audit project memory, or to inspect inactive/blocked memory (including Vietnamese memory-review questions). Strictly read-only thin adapter; does not refresh, remember, or change memory lifecycle. External tooling may select it. CMI activation does not auto-apply Skills. npm may deliver this Skill artifact as package content, but npm installation does not activate or install it into an agent runtime.
---

# Skill: cmi-memory-review

## 1. Purpose

Provide **read-only review preparation** for durable CMI memory. The Skill exposes and organizes review evidence (stale, review, untracked, inactive, blocked) so the user can make a decision. It is a thin orchestration contract over existing CMI stale-memory and status **read** surfaces. It does **not** mutate memory lifecycle, refresh fingerprints, or promote proposals into durable truth.

This Skill is a repository-only reusable workflow artifact. It is not a runtime subsystem, not a Skill loader, and is not automatically applied by activation. External agent tooling may select and apply this artifact; CMI itself does not load Skills.

## 2. Appropriate trigger

An external agent (or external agent tooling) should select and apply this workflow artifact when the user or workflow asks:

- which memory entries need review
- what CMI knowledge is stale
- to audit current project memory
- to show inactive or blocked memory evidence
- which facts/decisions/mistakes should be reviewed
- Vietnamese equivalents such as “Bộ nhớ CMI nào đang stale hoặc cần review?” or “Kiểm tra memory nào cần con người xem lại.”

## 3. Non-triggers

Do not treat this Skill as:

- Automatic wiring for every ordinary repository question.
- Project-level readiness only (`cmi-evidence-health`) when the user only asks “is CMI healthy?” without a memory audit intent.
- Ambient task orientation (`cmi-ambient-brief`).
- Session continuation (`cmi-continue`).
- Closing Intelligence (`cmi-closing`).
- Authority to mark reviewed, deprecate, reject, supersede, refresh, or remember memory.
- Authority to treat source-fingerprint refresh as semantic approval.

User intent remains authoritative. CMI recommendations do not create business priority.

## 4. Primary workflow (read-only)

Prefer MCP when available.

1. **Primary** — call `check_stale_memory` (no arguments).
2. **Optional project-level context** — call `get_project_memory_status` (no arguments) when overall readiness context helps the review narrative.
3. **Present** — preserve CMI classifications separately (fresh/stale/review/untracked/inactive/blocked); do not merge into one “bad memory” bucket.
4. If the user asks to **mutate** lifecycle during review, refuse within this Skill and explain that an explicitly authorized write-enabled CMI path is required (do not silently enter write mode).

## 5. Exact existing MCP invocations

### 5.1 Primary: stale/review/lifecycle audit

- Tool name: `check_stale_memory`
- Classification: read-only
- Input schema (authoritative; do not extend):

```json
{}
```

Call with **no arguments**. Do not invent filters, ids, or write fields.

### 5.2 Optional: project-level status context

- Tool name: `get_project_memory_status`
- Classification: read-only
- Input schema (authoritative; do not extend):

```json
{}
```

Call with **no arguments** when project-level readiness context is useful.

### 5.3 Forbidden mutation tools (not executable workflow for this Skill)

Do **not** call as part of this Skill’s workflow:

- `refresh_project_memory`
- `set_project_memory_state`
- `remember_project_knowledge`
- `scan_project_intelligence`
- `start_work_session` / `observe_work_session` / `finalize_work_session`
- `start_change_record` / `observe_change_record` / `complete_change_record`
- `set_project_finding_state`

## 6. Exact local CLI fallbacks

When MCP is unavailable, and only then, use the exact project-local package entrypoint from the project root.

### 6.1 Primary

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" stale --json
```

### 6.2 Optional project-level context

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" status --json
```

Rules:

- Prefer MCP over CLI when MCP is available.
- A bare `cmi` command PATH failure alone is **not** evidence that CMI is unavailable.
- Do **not** use registry `npx` as a fallback.
- If the exact local entrypoint is absent or unusable **and** MCP is unavailable, report `CMI_LOCAL_INTERFACE_UNAVAILABLE` (or equivalent). Do not invent an alternate invocation. Do not install anything automatically.
- Do **not** call `refresh-memory`, `memory-state`, or `remember` under this Skill.

## 7. Classification fidelity

Preserve authoritative classifications such as:

```text
fresh
stale
review
untracked
inactive
blocked
```

Do not merge these into one vague “bad memory” bucket.

### fresh

Source/current evidence does not automatically mean a human has semantically reviewed it recently.

### stale

Referenced evidence changed or became unavailable. Do not use it as current truth without qualification.

### review

Requires semantic/review attention. Do not call it stale unless CMI calls it stale.

### untracked

Historical/pre-metadata memory is not equivalent to reviewed-current truth.

### inactive

May include:

```text
deprecated
rejected
superseded
```

Inactive memory is **historical evidence**, not normal trusted retrieval input.

### blocked

Unsafe/unreadable/unsupported memory is a **trust failure**. Blocked is **NOT** empty memory. Do not silently skip blocked evidence.

## 8. Refresh boundary

A source fingerprint refresh is **NOT** semantic review.

Explicitly preserve:

```text
source refresh != semantic approval
```

Do not tell the user that refreshing fingerprints “reviewed” the content. Do not automatically mark memory active/current. Do not run `refresh-memory` under this Skill.

## 9. Mutation request boundary

If during use of this Skill the user asks to:

- mark this reviewed
- deprecate this memory
- reject this memory
- supersede this memory
- refresh this memory
- save this as memory

the Skill contract requires clear statement that:

1. this **read-only** Skill does **not** perform that mutation;
2. mutation requires an **explicitly authorized write-enabled** CMI path;
3. no mutation should be inferred from review discussion.

Do **not** silently transition into write mode. Do not execute `memory-state`, `refresh-memory`, or `remember`.

## 10. Read-only boundary

This Skill is **strictly read-only**.

It may invoke only:

- MCP `check_stale_memory`, optional `get_project_memory_status`
- CLI `stale --json`, optional `status --json` via the exact project-local entrypoint

It must **not**:

- refresh memory fingerprints
- set memory lifecycle state
- remember project knowledge
- scan the project
- start/close sessions
- start/complete Changes
- mutate findings
- mutate `.codex-memory`
- enable CMI write mode
- fabricate CLEAN / Closing Intelligence

Missing write permission is **not** a reason to request write mode for this Skill.

A recommended write command already returned by CMI may be **surfaced** as an explicit follow-up requiring authorization; it must not be executed.

## 11. Evidence / provenance rules

Preserve:

- observed evidence ≠ inference
- inference ≠ reviewed durable knowledge
- source fingerprint current ≠ semantically reviewed current
- inactive/historical memory ≠ current trusted retrieval input
- blocked evidence ≠ empty evidence

Do not promote proposals into durable truth.

## 12. Failure behavior

| Condition | Required behavior |
|-----------|-------------------|
| MCP available | Prefer documented MCP tools only. |
| MCP unavailable; exact local entrypoint present | Use documented CLI only. |
| MCP unavailable; exact local entrypoint absent/unusable | Report `CMI_LOCAL_INTERFACE_UNAVAILABLE`. |
| Blocked memory evidence | Report blocked; do not convert to empty. |
| User requests mutation | Refuse within this Skill; point to authorized write path; do not execute. |
| Partial/unavailable report | State limitations honestly. |

Never fabricate classifications, CLEAN, or durable memory writes from a failed or partial review read.

## 13. What it must never do

- Invent undocumented MCP arguments.
- Invent new CMI commands, tools, schemas, or capabilities.
- Merge stale/review/untracked/inactive/blocked into one vague bucket.
- Auto-run `refresh-memory`, `memory-state`, or `remember`.
- Treat source refresh as semantic approval.
- Use bare `cmi` as the only documented fallback.
- Prescribe registry `npx` as fallback.
- Claim that npm installation activates this Skill or installs it into an agent runtime.
- Claim Codex/Grok runtime discovery is validated by this artifact alone.
- Alter activation or managed config generation.

## 14. Expected result handling

- Treat tool/CLI output as authoritative for classifications and lists.
- Organize for human review: what needs attention, what is historical-only, what is blocked.
- Keep user intent in control for which entries to act on later.
- Do not treat review discussion as completed lifecycle mutation.

## 15. Relationship to other Skills

| Concern | Relationship |
|---------|--------------|
| Evidence health | Related but distinct (`cmi-evidence-health`) — project readiness vs entry-level memory audit. |
| Ambient | Separate (`cmi-ambient-brief`). |
| Continue | Separate (`cmi-continue`). |
| Closing | Separate (`cmi-closing`). |
| Write lifecycle | Out of scope; requires explicit write-enabled CMI use outside this Skill. |

This Skill does not change CMI core contracts.

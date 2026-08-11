---
name: cmi-evidence-health
description: Provide a concise read-only assessment of whether CMI project evidence is currently usable, stale, missing, degraded, or blocked before relying on it. Use when the user asks if CMI is healthy, whether intelligence/evidence is current, why CMI is blocked, if the graph/index is stale, or to check evidence health before starting (including Vietnamese readiness questions). Strictly read-only thin adapter; does not scan, init, or refresh. External tooling may select it. CMI activation does not auto-apply Skills, and npm install does not deliver or activate them.
---

# Skill: cmi-evidence-health

## 1. Purpose

Provide a concise, evidence-labeled **project-level readiness and evidence usability** brief for a coding agent that needs to know whether CMI evidence can be trusted *right now*. The Skill is a thin orchestration contract over existing CMI status, doctor, and stale-memory **read** surfaces. It tells the agent which existing CMI MCP tools or project-local CLI invocations to call; it does **not** reimplement health computation, graph freshness, stale classification, or alert ranking.

This Skill is a repository-only reusable workflow artifact. It is not a runtime subsystem, not a Skill loader, and is not automatically applied by activation. External agent tooling may select and apply this artifact; CMI itself does not load Skills.

## 2. Appropriate trigger

An external agent (or external agent tooling) should select and apply this workflow artifact when the user or workflow asks about:

- whether CMI is healthy / ready
- whether project intelligence or CMI evidence is current
- whether the agent can trust current CMI evidence
- why CMI is blocked
- whether graph/index/memory evidence is stale
- evidence health / readiness before starting work
- Vietnamese equivalents such as “CMI có đang healthy không?” or “Kiểm tra evidence hiện tại có dùng được không.”

## 3. Non-triggers

Do not treat this Skill as:

- Automatic wiring for every ordinary project question (activation is unchanged; this Skill is an externally supplied or selected workflow artifact, not auto-applied by CMI).
- A substitute for Ambient task orientation (`cmi-ambient-brief`).
- A substitute for session continuation (`cmi-continue`).
- A substitute for entry-level durable memory review (`cmi-memory-review`) when the user only wants a memory audit list.
- A substitute for Closing Intelligence (`cmi-closing`).
- Authority to run `init`, `scan`, or `refresh-memory` to “fix” health.
- Authority to start/close sessions, mutate Changes, findings, or durable memory.
- A source of fabricated CLEAN / `### CMI Intelligence` footers.

User intent remains authoritative. CMI recommendations do not create business priority.

## 4. Primary workflow (read-only)

Prefer MCP when available.

1. **Project readiness/status** — call `get_project_memory_status` (no arguments).
2. **Stale/review/blocked memory detail (when relevant)** — call `check_stale_memory` (no arguments) if the user asks about staleness, review queues, blocked memory, or status already indicates memory-health concern.
3. **Present** — evidence state, blocking diagnostics, capabilities currently usable vs unavailable, and any recommended next safe action **as returned by CMI**, without executing it.

Do not invent a replacement health state machine. Do not recompute CMI health logic. Treat returned fields as authoritative.

## 5. Exact existing MCP invocations

### 5.1 Primary: project memory/status readiness

- Tool name: `get_project_memory_status`
- Classification: read-only
- Input schema (authoritative; do not extend):

```json
{}
```

Rules:

- Call with **no arguments**.
- Do **not** invent `workspace`, `path`, `projectRoot`, `write`, `full`, or any other undocumented argument.
- This is the project-level readiness/health view.

### 5.2 Memory-health detail (when relevant)

- Tool name: `check_stale_memory`
- Classification: read-only
- Input schema (authoritative; do not extend):

```json
{}
```

Rules:

- Call with **no arguments**.
- Use when stale/review/blocked/untracked/inactive memory detail is needed to answer the user’s readiness question.
- Preserve CMI’s classifications; do not merge them into a vague “bad memory” bucket.

### 5.3 Forbidden “fix” tools

Do **not** call as part of this Skill:

- `scan_project_intelligence`
- `refresh_project_memory`
- `remember_project_knowledge`
- `set_project_memory_state`
- `start_work_session` / `observe_work_session` / `finalize_work_session`
- `start_change_record` / `observe_change_record` / `complete_change_record`
- `set_project_finding_state`
- `freeze_portable_evidence` / `restore_portable_evidence` / `rebind_portable_evidence`

## 6. Exact local CLI fallbacks

When MCP is unavailable, and only then, use the exact project-local package entrypoint from the project root.

### 6.1 Project status (primary)

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" status --json
```

### 6.2 Diagnostics when needed

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" doctor --json
```

### 6.3 Memory-health detail when needed

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" stale --json
```

Rules:

- Prefer MCP over CLI when MCP is available.
- A bare `cmi` command PATH failure alone is **not** evidence that CMI is unavailable.
- Do **not** use registry `npx` (or any other registry resolution) as a fallback.
- If the exact local entrypoint above is absent or unusable **and** MCP is unavailable, report `CMI_LOCAL_INTERFACE_UNAVAILABLE` (or equivalent clear language). Do not invent an alternate invocation. Do not install anything automatically.
- Do **not** automatically run `init`, `scan`, or `refresh-memory` even when returned recommendations mention them.

## 7. Failure and diagnostic semantics

Health must **never** be fabricated.

Distinguish at least these evidence classes **using authoritative returned evidence** (labels may match CMI field language; do not invent a parallel taxonomy):

| Class | Guidance |
|-------|----------|
| healthy / ready | Only when CMI returned evidence supports readiness. |
| needs-attention | Surface returned warnings/degradations honestly. |
| stale | Preserve stale markers from status/stale/doctor; do not call stale evidence healthy. |
| review-required | Preserve review queues; do not call them stale unless CMI does. |
| missing / uninitialized | Report when CMI indicates uninitialized/missing stores. |
| blocked | Blocked/unreadable/unsafe evidence is a trust failure, **not** empty evidence. |
| unknown / unavailable | When surfaces fail or are unusable; do not invent healthy. |

Additional rules:

- If `doctor --json` (or another diagnostic) exits **non-zero** while still returning valid diagnostic output: do **not** treat non-zero exit alone as “CMI absent”; preserve the diagnostic; report blocked/unhealthy accurately.
- If CMI reports a recommended next safe action: **surface** it; state whether it mutates CMI state when that evidence is available; **do not execute** it under this Skill.
- Do **not** silently scan, initialize, or refresh memory.
- Do **not** treat unreadable/corrupt evidence as empty.

## 8. Read-only boundary

This Skill is **strictly read-only**.

It may invoke only:

- MCP `get_project_memory_status`, optional `check_stale_memory`
- CLI `status --json`, optional `doctor --json`, optional `stale --json` via the exact project-local entrypoint

It must **not**:

- start a work session / observe / finalize a work session
- start / observe / complete a Change
- close or finalize a session
- scan the project / refresh generated intelligence caches
- refresh memory fingerprints
- set memory lifecycle state
- remember project knowledge
- write findings or evaluations
- mutate `.codex-memory`
- enable CMI write mode
- synthesize Closing Intelligence
- emit or fabricate a CLEAN footer

Missing write permission is **not** a reason to request or enable write permission. This Skill does not need write mode.

A read-only Skill may **surface** a recommended write command already returned by CMI, but must label it as an **explicit follow-up requiring user/agent authorization**. It must not execute that recommendation.

## 9. Evidence / provenance rules

Preserve:

- observed evidence ≠ inference
- inference ≠ reviewed durable knowledge
- source fingerprint current ≠ semantically reviewed current
- historical evidence ≠ current evidence
- reported verification ≠ independently executed verification

Do not promote proposals or inference into durable truth. Do not claim tests/builds succeeded unless the agent independently observed them outside this Skill.

## 10. Failure behavior

| Condition | Required behavior |
|-----------|-------------------|
| MCP available | Prefer documented MCP tools only. |
| MCP unavailable; exact local entrypoint present | Use only documented project-local CLI fallbacks. |
| MCP unavailable; exact local entrypoint absent/unusable | Report `CMI_LOCAL_INTERFACE_UNAVAILABLE`. Do not treat bare `cmi` PATH failure as sole proof of absence. |
| Non-zero doctor/diagnostic exit with valid output | Preserve diagnostic; do not interpret as absence. |
| Blocked/corrupt evidence | Report blocked; do not convert to empty or healthy. |
| Recommendation to scan/init/refresh | Surface only; do not auto-execute. |
| Partial/unavailable status | State limitations honestly; do not invent healthy. |

Never fabricate healthy state, CLEAN, blockers, verification results, or durable memory writes from a failed or partial health read.

## 11. What it must never do

- Invent undocumented MCP arguments.
- Invent new CMI commands, MCP tools, arguments, schemas, or capabilities.
- Reimplement health computation, stale classification, or ranking.
- Auto-run `init`, `scan`, or `refresh-memory`.
- Use bare `cmi` as the only documented fallback.
- Prescribe registry `npx` as fallback.
- Claim that installing the npm package delivers this Skill (repository-only; `skills/` is not in the published package files list).
- Claim Codex or Grok runtime discovery has been validated by this artifact alone.
- Alter activation, managed `AGENTS.md`, or `.codex/config.toml` generation.

## 12. Expected result handling

Produce a concise agent-facing answer covering, as evidence allows:

1. Evidence state
2. Blocking diagnostics
3. Capabilities currently usable
4. Capabilities currently unavailable
5. Recommended next safe action (labeled follow-up; not executed)

Do not dump entire JSON unless the user requests raw evidence. Do not recompute CMI health logic.

## 13. Relationship to other Skills

| Concern | Relationship |
|---------|--------------|
| Ambient brief | Separate (`cmi-ambient-brief`) — task orientation, not project readiness. |
| Continue | Separate (`cmi-continue`) — unfinished work reconciliation. |
| Memory review | Separate (`cmi-memory-review`) — entry-level memory audit; may share `check_stale_memory` but different purpose. |
| Closing | Separate (`cmi-closing`) — already-closed session Closing Intelligence. |
| Activate / work session / change loop | Not implemented in Mission 1.6 Wave 1. |

This Skill does not change CMI core contracts.

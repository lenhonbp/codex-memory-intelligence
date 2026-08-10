---
name: cmi-continue
description: Resume known unfinished project work from durable CMI session handoff evidence, current open findings, current active Changes, and a fresh repository baseline re-check. Use when the user asks to continue, resume, pick up previous work, làm tiếp, or identify what unfinished CMI-tracked work remains. Strictly read-only thin adapter; does not start sessions or Changes. External tooling may select it. CMI activation does not auto-apply Skills, and npm install does not deliver or activate them.
---

# Skill: cmi-continue

## 1. Purpose

Provide a bounded, evidence-labeled continuation brief for a coding agent that needs to resume known unfinished project work. The Skill is a thin orchestration contract over existing CMI Session Continuation Intelligence and related read surfaces. It tells the agent which existing CMI MCP tools or project-local CLI invocations to call; it does not reimplement CMI ranking, routing, session, Change, finding, or memory logic.

This Skill is a repository-only reusable workflow artifact. It is not a runtime subsystem, not a Skill loader, and is not automatically applied by activation. External agent tooling may select and apply this artifact; CMI itself does not load Skills.

## 2. Appropriate trigger

An external agent (or external agent tooling) should select and apply this workflow artifact when the user or workflow asks to:

- continue, resume, or pick up previous work
- continue from the last session
- làm tiếp / tiếp tục
- identify unfinished CMI-tracked work
- determine what should be addressed next from existing continuation evidence

The user does not need to know CMI internal terminology.

## 3. Non-triggers

Do not treat this Skill as:

- Automatic wiring for every repository task (activation is unchanged; this Skill is an externally supplied or selected workflow artifact, not auto-applied by CMI).
- Authority to start a new work session.
- Authority to create, observe, or complete a Change.
- Authority to close or finalize a session.
- Authority to resolve, accept, dismiss, reopen, or supersede findings.
- Authority to promote memory candidates into durable project truth.
- Authority to run tests, builds, migrations, deploys, package installs, or other project commands.
- A substitute for Closing Intelligence or a source of a fabricated `### CMI Intelligence` / CLEAN footer.
- Proof of organizational, commercial, or business priority.
- Permission to broaden the user’s requested scope.

User intent remains authoritative.

## 4. Primary workflow (read-only)

Prefer MCP when available. Execute this minimal sequence:

1. **Handoff** — `get_session_handoff` (historical closed-session continuation snapshot).
2. **Current baseline** — `get_repository_baseline` (current repository evidence).
3. **Bounded active-Change inventory** — optional `list_change_records` with `status: "active"` (bounded orientation only).
4. **Per-handoff Change lifecycle re-check** — for each relevant `handoff.activeChanges` entry, call `get_change_record` with that Change `id` (decisive current lifecycle evidence for that ID).
5. **Current open findings** — `list_project_findings` with `state: "open"` (current persistent findings with CMI severity).
6. **Present** — surface current baseline, per-ID Change lifecycle results, optional bounded active inventory, current open findings (with severity), historical handoff recommendation/priority clearly labeled as historical, and discrepancies.

Do not invent ranking algorithms. Do not recompute P0/P1 priorities. CMI executable output remains authoritative for the fields it returns.

## 5. Exact existing MCP invocations

### 5.1 Primary: session handoff

- Tool name: `get_session_handoff`
- Classification: read-only
- Input schema (authoritative; do not extend):

```json
{
  "id": "string"
}
```

Rules:

- `id` is optional. When provided, it is a closed session ID or unique prefix.
- When omitted, CMI selects the latest closed session according to the existing core contract.
- Call only this tool with only the optional `id` field. Do **not** invent `workspace`, `path`, `branch`, `projectRoot`, `write`, `resume`, `sessionStatus`, or any other undocumented argument.

Treat the handoff as **historical durable continuation evidence**, not automatically current repository truth.

Handoff fields such as `activeChanges`, `completedChanges`, `openFindings`, `nextAction`, and `nextActions` are **snapshots generated when the session was closed**. They are historical continuation evidence unless confirmed by a current read surface.

### 5.2 Current-evidence re-check (repository baseline)

After obtaining handoff evidence, re-check current repository evidence:

- Tool name: `get_repository_baseline`
- Classification: read-only
- Input schema (authoritative; do not extend):

```json
{}
```

Call with **no arguments**. Do not invent parameters.

| Source | Role |
|--------|------|
| **Handoff** | Historical continuation snapshot from a closed session. |
| **Current baseline** | Current observable repository evidence (branch, HEAD, worktree cleanliness, upstream). |

They are **not interchangeable**. If current baseline contradicts handoff state, report the discrepancy. Prefer current baseline for current-state claims. Preserve the handoff as historical evidence. Do **not** mutate durable state to reconcile them.

### 5.3 Change lifecycle re-check (historical handoff vs current durable state)

Do **not** claim a Change is currently active solely because it appears in handoff `activeChanges`.

#### A. Bounded current active-Change inventory (orientation only)

- Tool name: `list_change_records`
- Classification: read-only
- Input schema (authoritative; do not invent fields):

```json
{
  "status": "active",
  "limit": 20
}
```

Rules:

- Useful as a **bounded** summary of some currently active Changes.
- Core filters then **slices** to `limit`; omitted IDs are **not** proven inactive.
- **Absence from this bounded list is NOT lifecycle proof** and must **not** be interpreted as “no longer active,” “completed,” or any other terminal state.
- Do not invent path, workspace, or write fields.

#### B. Decisive per-Change re-check for each historical handoff.activeChanges entry

For **each** relevant entry in historical `handoff.activeChanges`, re-check that Change’s current durable lifecycle with:

- Tool name: `get_change_record`
- Classification: read-only
- Input schema (authoritative; do not invent fields):

```json
{
  "id": "string"
}
```

`id` is **required**. Use the handoff Change id (or unique prefix when that is what the handoff entry supplies). Do not invent other fields.

Interpret **only** returned evidence:

| get_change_record result | Allowed claim |
|--------------------------|---------------|
| `status` == `active` | May describe the Change as **currently active**. |
| `status` == `completed` | Handoff `activeChanges` entry is **historical/stale** for lifecycle status. Report the Change is now **completed** using fields actually returned by the current record. Do not fabricate completion outcome beyond returned fields. |
| Lookup fails / record unavailable / evidence blocked | Current lifecycle status is **UNKNOWN**. Do **not** infer terminal state. Do **not** infer active state merely from the historical handoff. Report the limitation. |

| Source | Role |
|--------|------|
| **handoff.activeChanges** | Historical snapshot at session close. |
| **list_change_records(status=active)** | Bounded current active-Change inventory (orientation; not authoritative for omitted IDs). |
| **get_change_record(id)** | Specific current durable lifecycle evidence for one historical handoff Change. |

For reconciling a particular handoff Change, **`get_change_record` is the decisive read surface**.

Do **not** mutate Change lifecycle. Do **not** invent Change start/observe/complete operations.

### 5.4 Current persistent open findings

- Tool name: `list_project_findings`
- Classification: read-only
- Input schema (authoritative; do not invent fields):

```json
{
  "state": "open",
  "limit": 50
}
```

Rules:

- Prefer `state` = `"open"`.
- `limit` is optional integer `1..200` when needed; default handling remains CMI’s.
- Do not invent filters or path arguments.
- Present findings using the severity and ordering CMI returns.
- Current open findings are **not** automatically P0/P1 recommendations. Finding severity is not recommendation priority.

If detail for one finding is necessary:

- Tool name: `get_project_finding`
- Classification: read-only
- Input schema (authoritative):

```json
{
  "id": "string"
}
```

`id` is required. Do not invent other fields.

Findings registry evidence boundaries:

- A **missing** findings registry is valid empty evidence.
- A registry that **exists but is malformed, oversized, symlinked, non-regular, or otherwise unsafe** is **blocked evidence**, not empty evidence.
- Do **not** convert blocked findings evidence into “no findings.”
- Report the blocked state honestly.

Do **not** resolve or mutate finding lifecycle through this Skill.

## 6. Exact local CLI fallbacks

When MCP is unavailable, and only then, use the exact project-local package entrypoint from the project root.

### 6.1 Session handoff

Latest closed-session handoff:

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" session handoff --json
```

Selected closed session ID/prefix (verified positional form):

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" session handoff <id-or-prefix> --json
```

### 6.2 Repository baseline

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" baseline --json
```

### 6.3 Bounded active-Change inventory

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" change list --status active --json
```

Orientation only. Omitted IDs are not proven inactive.

### 6.4 Per-Change lifecycle re-check

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" change show <id-or-prefix> --json
```

Use for each relevant historical `handoff.activeChanges` id (decisive per-ID lifecycle evidence).

### 6.5 Open findings

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" finding list --status open --json
```

Optional detail for one finding:

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" finding show <id-or-prefix> --json
```

Rules:

- Prefer MCP over CLI when MCP is available.
- A bare `cmi` command PATH failure alone is **not** evidence that CMI is unavailable.
- Do **not** use registry `npx` (or any other registry resolution) as a continuation fallback.
- If the exact local entrypoint above is absent or unusable **and** MCP is unavailable, report that Session Continuation Intelligence is unavailable. Do not invent an alternate invocation.

## 7. Session completion ≠ Change completion

**NON-NEGOTIABLE:**

> Session completion is independent from Change completion.

A closed session may coexist with an unfinished **active** Change.

- Handoff `activeChanges` / `completedChanges` are **historical** closed-session snapshots.
- For each relevant handoff `activeChanges` id, current lifecycle status requires `get_change_record` for that id.
- Optional `list_change_records(status=active)` is only a bounded inventory, not proof about omitted IDs.

Do **not** interpret “session closed” as “Change completed.”

Do **not** interpret “absent from bounded active list” as “Change completed” or “not active.”

Do **not**:

- start a new Change solely because continuation evidence exists
- mark an unfinished Change terminal
- fabricate a completed Change outcome beyond returned current-record fields
- silently abandon Changes that `get_change_record` shows as currently active
- invent Change lifecycle operations

Current CMI Change lifecycle semantics remain authoritative.

## 8. Findings severity vs historical recommendation priority

Preserve these distinct evidence classes:

### A. Current findings

From `list_project_findings` (`state: "open"`):

- current persistent finding evidence
- carries CMI-provided **severity** (and related finding fields)
- preserve returned severity and ordering
- do **not** map severity or category to P0/P1 inside this Skill
- do **not** describe current open findings as inherently “P0/P1 findings”

### B. Handoff next actions (historical)

From handoff `nextAction` / `nextActions`:

- recommendation snapshot generated when the session was closed
- may contain P0/P1/P2/P3 priorities
- must be labeled **historical continuation recommendation evidence**
- must **not** be called a freshly recomputed current P0/P1 ranking

### C. No custom recomputation

The Skill must **not** implement:

- any copied recommendation-priority function from CMI core
- category-to-P0/P1 mapping
- severity-to-P0/P1 mapping
- custom recommendation tables
- custom ranking logic

If current baseline, findings, or active-Change evidence contradicts the historical handoff recommendation:

- report the discrepancy
- do **not** silently preserve the old recommendation as current
- do **not** independently recompute a new CMI priority
- let user intent remain authoritative

Present:

1. current baseline
2. per-ID lifecycle results for historical handoff `activeChanges` (via `get_change_record`)
3. optional bounded active-Change inventory (via `list_change_records`) without treating omissions as terminal
4. current open findings with their CMI severity
5. historical handoff recommendation/priority, clearly labeled as such
6. discrepancies between historical and current evidence

Evidence boundary:

- Historical P0/P1 on a handoff recommendation is CMI recommendation priority **at session close**, not proof of current business priority or automatic permission to act.
- The user may change priority.
- CMI recommendation ≠ command authorization. Do not automatically run tests, builds, migrations, deploys, profilers, package installs, or arbitrary shell mutations because continuation evidence recommends them.

## 9. Read-only boundary

This Skill is **strictly read-only**.

It may invoke only the verified existing read surfaces documented above (`get_session_handoff`, `get_repository_baseline`, `list_change_records`, `get_change_record`, `list_project_findings`, optional `get_project_finding`, and their exact project-local CLI fallbacks).

It must **not**:

- start a work session
- observe or finalize a work session
- start a Change
- observe or complete a Change
- close or finalize a session
- resolve, accept, dismiss, reopen, or supersede findings
- remember project knowledge
- refresh memory fingerprints
- set memory lifecycle state
- scan the project / refresh generated intelligence caches
- capture or review evaluations
- enable CMI write mode
- instruct the agent to regenerate MCP config with write or bulk-refresh flags
- mutate `.codex-memory`
- synthesize Closing Intelligence
- emit or fabricate a CLEAN footer

Missing write permission is **not** a reason to request or enable write permission. This Skill does not need write mode.

## 10. Failure behavior

| Condition | Required behavior |
|-----------|-------------------|
| No usable closed-session handoff | Do not fabricate prior work or CLEAN. Report that no usable closed-session handoff is available. |
| MCP available | Prefer the documented MCP tools only. |
| MCP unavailable; exact local entrypoint present | Use only the documented project-local CLI fallbacks. |
| MCP unavailable; exact local entrypoint absent/unusable | Report Session Continuation Intelligence unavailable. Do not treat bare `cmi` PATH failure as the sole proof of absence. |
| Blocked/unsafe findings registry | Report blocked evidence. Do **not** convert it into “no findings.” |
| Handoff Change id; `get_change_record` returns `active` | May claim currently active. |
| Handoff Change id; `get_change_record` returns `completed` | Report currently completed using returned fields only; handoff active entry is historical/stale. |
| Handoff Change id; `get_change_record` fails / unavailable / blocked | Lifecycle status **UNKNOWN**; do not infer terminal or active from handoff alone. |
| Handoff Change omitted from bounded `list_change_records` only | **Not** lifecycle proof. Re-check with `get_change_record` before any current-status claim. |
| Stale/contradicted handoff vs current baseline/findings/Changes | Surface the discrepancy; prefer decisive current reads for current-state claims; keep handoff as historical; do not mutate to reconcile; do not recompute priorities. |
| Partial/unavailable continuation data | State limitations honestly; continue only with evidence the agent can establish independently. |

Never fabricate CLEAN, blockers, verification results, completed Changes from list absence, current P0/P1 rankings, or durable memory writes from a failed or partial continuation read.

## 11. What it must never do

- Invent undocumented MCP arguments (`workspace`, `path`, `projectRoot`, etc.).
- Invent new CMI commands, MCP tools, arguments, schemas, or capabilities.
- Reimplement intent regexes, routing tables, ranking, graph, finding-priority, or next-action algorithms.
- Map finding severity/category to P0/P1.
- Auto-start sessions, Changes, Closing Intelligence, or finding/memory mutations.
- Use bare `cmi` as the only documented fallback.
- Prescribe registry `npx` as fallback.
- Claim that installing the npm package delivers this Skill (repository-only; `skills/` is not in the published package files list).
- Claim Codex or Grok runtime discovery has been validated by this artifact alone.
- Alter activation, managed `AGENTS.md`, or `.codex/config.toml` generation.

## 12. Expected result handling

- Treat tool/CLI JSON (or formatted CMI output) as the authoritative evidence for each class (historical handoff vs current baseline/Changes/findings).
- Present: handoff objective/outcome (historical), current baseline differences if any, per-ID Change lifecycle re-checks, optional bounded active inventory (without treating list absence as terminal), current open findings with severity, historical handoff recommendation priority (labeled historical), and discrepancies.
- Keep user intent in control: do not broaden the task solely because continuation evidence suggests related work.
- Do **not** treat this Skill’s output as a completed session, completed Change, or Closing Intelligence.
- Do **not** append a `### CMI Intelligence` / CLEAN section based on this Skill alone.

## 13. Relationship to other lifecycle concerns

| Concern | Relationship |
|---------|--------------|
| Work session start/close | Out of scope. This Skill only reads continuation evidence. |
| Change Intelligence mutations | Out of scope. Re-check handoff Changes with `get_change_record`; do not mutate Change lifecycle. |
| Closing Intelligence | Out of scope. CLEAN/footer only from a real closed-session Closing Intelligence result, never from this Skill. |
| Ambient brief | Separate Skill (`cmi-ambient-brief`). Continuation remains session-handoff-centered, not Ambient reimplementation. |
| Memory promotion | Out of scope. Knowledge candidates remain proposals. |

Session completion remains independent from Change completion. This Skill does not change those contracts.

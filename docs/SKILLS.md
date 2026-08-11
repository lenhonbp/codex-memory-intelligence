# Skills (repository contract PoC)

## Status

This repository currently has **no native Skill runtime or loader**.

Mission 1 adds a **repository-level reusable Skill contract PoC** with the following open-format Skill artifacts:

- `skills/cmi-ambient-brief/SKILL.md`
- `skills/cmi-continue/SKILL.md`
- `skills/cmi-evidence-health/SKILL.md`
- `skills/cmi-closing/SKILL.md`
- `skills/cmi-memory-review/SKILL.md`

These Skills are structured according to the **Agent Skills open format** (`SKILL.md` with required YAML frontmatter `name` and `description`, plus Markdown instructions). That structural alignment does **not** prove Codex, Grok, or any other agent runtime discovers or invokes them automatically.

The Skills remain **repository-level Skill artifacts**. CMI activation still does **not** automatically discover or apply Skills. Agent-specific discovery, install placement (for example under an agent’s own skills directory), and plugins remain **edge concerns** and are **not** implemented in this repository mission.

The Skills are intentionally **not** listed in `package.json` `files` and are **not** published to npm consumers in this phase. Packaging and distribution remain a later architecture decision.

Do not claim that installing `codex-memory-intelligence` from npm delivers Skills.
Do not claim that npm installation activates Skills.
Do not claim that this repository has proven Codex or Grok runtime Skill discovery.
Do not claim Mission 1.6 Wave 1 field validation for the three new Skills below; repository contracts and static tests only.

## Architectural rule

Skills are **thin orchestration adapters** over existing CMI executable surfaces.

CMI core remains:

- local-first
- project-agnostic
- agent-independent
- evidence-driven

A Skill tells an agent **which existing CMI MCP tool or CLI invocation to call**. It must not reimplement core logic (intent routing, graph, ranking, memory lifecycle, session/change semantics, health computation, Closing alert ranking).

## Separation of concerns

| Layer | Role |
|-------|------|
| **CMI core executable behavior** | Authoritative implementation in `src/**` (CLI, MCP, Ambient, session, change, closing, memory). |
| **Skill contract** | Markdown (or similar) workflow artifact that documents triggers, inputs, exact existing invocations, read/write boundaries, and failure rules. Open-format `SKILL.md` frontmatter supports progressive discovery metadata without implying a CMI loader. |
| **Optional future vendor adapters** | Edge-only mappings to a specific agent’s Skill discovery/install paths; must call the same CMI surfaces. Not present beyond the portable open-format contract. |
| **Optional future distribution** | How Skills ship (npm, separate pack, etc.). Explicitly out of scope for Mission 1 / Mission 1.6 Wave 1. |

## Implemented Skills

### `cmi-ambient-brief`

- **Open format:** Agent Skills-compatible `SKILL.md` with required frontmatter `name: cmi-ambient-brief` and a `description` that states purpose and when to use it.
- **Surface:** existing Ambient Intelligence only.
- **MCP:** `get_ambient_task_brief` with input `{ "request": "string" }` only (no workspace argument).
- **CLI fallback:** exact project-local entrypoint
  `node "./node_modules/codex-memory-intelligence/src/cli-entry.js" ambient "<user request>" --json`
- **Classification:** strictly **read-only**.
- **Not automatic:** not wired into activation; externally supplied or selected workflow artifact for external agent tooling (CMI has no Skill loader).
- **Not published:** `skills/` remains excluded from the package publication set.

See `skills/cmi-ambient-brief/SKILL.md` for the full contract.

### `cmi-continue`

- **Open format:** Agent Skills-compatible `SKILL.md` with required frontmatter `name: cmi-continue` and a `description` that states purpose and when to use it.
- **Surface:** existing Session Continuation Intelligence and related read-only surfaces (thin adapter; no new core behavior).
- **Orientation:** resume unfinished work from durable handoff evidence while re-checking current repository, per-Change lifecycle, and open-finding evidence.
- **MCP (read-only):** `get_session_handoff` (optional `id`), `get_repository_baseline` (no args), optional bounded `list_change_records` with `status: "active"` (optional `limit`), decisive `get_change_record` with required `id` for each relevant historical `handoff.activeChanges` entry, `list_project_findings` with `state: "open"` (optional `limit`), and optional `get_project_finding` with required `id`.
- **CLI fallbacks:** exact project-local entrypoints
  `node "./node_modules/codex-memory-intelligence/src/cli-entry.js" session handoff --json`,
  `node "./node_modules/codex-memory-intelligence/src/cli-entry.js" baseline --json`,
  `node "./node_modules/codex-memory-intelligence/src/cli-entry.js" change list --status active --json`,
  `node "./node_modules/codex-memory-intelligence/src/cli-entry.js" change show <id-or-prefix> --json`,
  `node "./node_modules/codex-memory-intelligence/src/cli-entry.js" finding list --status open --json`
- **Classification:** strictly **read-only**; no session/Change/finding/memory lifecycle mutation.
- **Invariant:** session completion remains independent from Change completion; handoff `activeChanges` is historical. Use `get_change_record` for each relevant handoff Change id to establish current lifecycle. `list_change_records` is only a bounded inventory — absence from that list is not lifecycle proof.
- **Recommendation boundary:** handoff `nextAction`/`nextActions` priorities (including P0/P1) are historical recommendation snapshots; current open findings expose severity, not recomputed P0/P1 rankings.
- **Not automatic:** not wired into activation; externally supplied or selected workflow artifact for external agent tooling (CMI has no Skill loader).
- **Not published:** `skills/` remains excluded from the package publication set.
- **Not claimed:** Codex/Grok runtime discovery is not validated by this repository artifact alone.

See `skills/cmi-continue/SKILL.md` for the full contract.

### `cmi-evidence-health` (Mission 1.6 Wave 1)

- **Open format:** Agent Skills-compatible `SKILL.md` with required frontmatter `name: cmi-evidence-health`.
- **Purpose:** project-level CMI readiness and evidence usability (healthy/ready, needs-attention, stale, review-required, missing, blocked, unknown) before an agent relies on CMI evidence.
- **MCP (read-only):** `get_project_memory_status` (`{}`), optional `check_stale_memory` (`{}`) when memory-health detail is relevant.
- **CLI fallbacks:** exact project-local entrypoints
  `node "./node_modules/codex-memory-intelligence/src/cli-entry.js" status --json`,
  optional `doctor --json`, optional `stale --json`.
- **Classification:** strictly **read-only**. Does **not** auto-run `init`, `scan`, or `refresh-memory`. Non-zero diagnostic exit is not absence proof. Blocked ≠ empty. Recommendations may be surfaced but not executed.
- **Not automatic / not published:** same repository-only PoC boundaries as other Skills.
- **Field validation:** not claimed in Mission 1.6.

See `skills/cmi-evidence-health/SKILL.md` for the full contract.

### `cmi-closing` (Mission 1.6 Wave 1)

- **Open format:** Agent Skills-compatible `SKILL.md` with required frontmatter `name: cmi-closing`.
- **Purpose:** read and surface **existing** Closing Intelligence for an **already-closed** session. Does **not** close or finalize sessions.
- **MCP (read-only):** `get_closing_intelligence` with optional `id` (closed session ID/prefix; omit for latest closed).
- **CLI fallbacks:** exact project-local entrypoints
  `node "./node_modules/codex-memory-intelligence/src/cli-entry.js" session closing latest --json`,
  `node "./node_modules/codex-memory-intelligence/src/cli-entry.js" session closing <session-id-or-prefix> --json`.
- **Classification:** strictly **read-only**. Never `session close` / `finalize_work_session`. CLEAN only from authoritative Closing result for a real closed session; never fabricated from health/Git/findings alone. No alert re-ranking. Reviewed relevance ≠ proven violation.
- **Not automatic / not published:** same repository-only PoC boundaries as other Skills.
- **Field validation:** not claimed in Mission 1.6.

See `skills/cmi-closing/SKILL.md` for the full contract.

### `cmi-memory-review` (Mission 1.6 Wave 1)

- **Open format:** Agent Skills-compatible `SKILL.md` with required frontmatter `name: cmi-memory-review`.
- **Purpose:** entry-level durable memory review preparation (stale/review/untracked/inactive/blocked audit). Does **not** mutate memory lifecycle.
- **MCP (read-only):** `check_stale_memory` (`{}`), optional `get_project_memory_status` (`{}`).
- **CLI fallbacks:** exact project-local entrypoints
  `node "./node_modules/codex-memory-intelligence/src/cli-entry.js" stale --json`,
  optional `status --json`.
- **Classification:** strictly **read-only**. Preserves classification fidelity. Source fingerprint refresh ≠ semantic review. Explicit mutation requests must not silently enter write mode; no `refresh-memory` / `memory-state` / `remember` under this Skill.
- **Not automatic / not published:** same repository-only PoC boundaries as other Skills.
- **Field validation:** not claimed in Mission 1.6.

See `skills/cmi-memory-review/SKILL.md` for the full contract.

## Non-goals (Mission 1 / Mission 1.6 Wave 1)

Explicitly excluded:

- New Skill runtime or loader inside CMI
- Automatic Skill discovery or automatic execution on every task
- Vendor-specific logic inside CMI core
- Automatic durable-memory mutation
- Replacing MCP or CLI
- Changing Issue #41 field-validation behavior
- npm distribution of the `skills/` tree in this phase
- New CMI commands, MCP tools, arguments, or schemas
- Activation, managed `AGENTS.md`, or `.codex/config.toml` generation changes
- Session, Change, or Closing Intelligence behavior changes
- Agent-specific skill install placement (`.agents/skills`, `.grok/skills`, plugins, symlinks)
- Claiming Codex or Grok runtime discovery has been validated by repository format changes alone
- Mission 1.6 field validation of Wave 1 Skills
- Wave 2 Skills (`cmi-activate`, `cmi-work-session`, `cmi-change-loop`)

## Future candidates (not implemented)

Names only; no contracts or code in this mission:

- `cmi-activate`
- `cmi-work-session`
- `cmi-change-loop`

Any future Skill must remain a thin adapter over existing executable surfaces and preserve evidence boundaries (observed ≠ inference ≠ reviewed durable knowledge).

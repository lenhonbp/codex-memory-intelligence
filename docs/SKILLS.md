# Skills (portable package artifacts)

## Status

This repository currently has **no native Skill runtime or loader**.

Mission 1 adds a **repository-level reusable Skill contract PoC** with the following open-format Skill artifacts. All **eight** planned Skills are implemented and packaged:

- `skills/cmi-ambient-brief/SKILL.md`
- `skills/cmi-continue/SKILL.md`
- `skills/cmi-evidence-health/SKILL.md`
- `skills/cmi-closing/SKILL.md`
- `skills/cmi-memory-review/SKILL.md`
- `skills/cmi-work-session/SKILL.md`
- `skills/cmi-change-loop/SKILL.md`
- `skills/cmi-activate/SKILL.md`

These Skills are structured according to the **Agent Skills open format** (`SKILL.md` with required YAML frontmatter `name` and `description`, plus Markdown instructions). That structural alignment does **not** prove Codex, Grok, or any other agent runtime discovers or invokes them automatically.

### Distribution contract (Mission 1.8A)

```text
npm package ships Skill artifacts
!=
npm installation activates Skills
!=
CMI activation installs Skills
!=
CMI owns Skill discovery
```

- The npm package **includes** the `skills/` tree in `package.json` `files` and therefore **ships** portable `skills/<name>/SKILL.md` artifacts to consumers.
- **npm installation does not activate Skills** and does not install them into agent runtime directories.
- CMI activation still does **not** automatically discover or apply Skills.
- **CMI has no native Skill loader**, Skill registry, discovery engine, or Skill execution subsystem.
- **`cmi activate` does not install Skills** into `~/.codex/skills`, `~/.grok/skills`, `~/.agents/skills`, or any other runtime Skill location.
- Runtime installation/discovery remains **external** (**edge concerns**). Observed Skill paths in a particular Codex/Grok/other setup are **runtime/version-specific evidence**, not universal CMI guarantees. Runtime documentation remains authoritative for that surface.
- Mission **1.8B** will perform final field acceptance. This document does **not** claim that all eight Skills have passed final field validation yet.
- Do not claim that this repository has proven Codex or Grok runtime Skill discovery by packaging alone.

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
| **Package distribution** | npm ships portable `skills/` artifacts (Mission 1.8A). Runtime install/discovery remains external (Mission 1.8B field acceptance). |

## Implemented Skills

### `cmi-ambient-brief`

- **Open format:** Agent Skills-compatible `SKILL.md` with required frontmatter `name: cmi-ambient-brief` and a `description` that states purpose and when to use it.
- **Surface:** existing Ambient Intelligence only.
- **MCP:** `get_ambient_task_brief` with input `{ "request": "string" }` only (no workspace argument).
- **CLI fallback:** exact project-local entrypoint
  `node "./node_modules/codex-memory-intelligence/src/cli-entry.js" ambient "<user request>" --json`
- **Classification:** strictly **read-only**.
- **Not automatic:** not wired into activation; externally supplied or selected workflow artifact for external agent tooling (CMI has no Skill loader).
- **Packaged:** included under npm `files` → `skills/`; npm install does not activate.

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
- **Packaged:** included under npm `files` → `skills/`; npm install does not activate.
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
- **Not automatic / packaged:** same boundaries as other Skills — package ships the artifact; install does not activate.
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
- **Not automatic / packaged:** same boundaries as other Skills — package ships the artifact; install does not activate.
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
- **Not automatic / packaged:** same boundaries as other Skills — package ships the artifact; install does not activate.
- **Field validation:** not claimed in Mission 1.6.

See `skills/cmi-memory-review/SKILL.md` for the full contract.

### `cmi-work-session` (Mission 1.7 Wave 2)

- **Open format:** Agent Skills-compatible `SKILL.md` with required frontmatter `name: cmi-work-session`.
- **Purpose:** orchestrate active durable Session lifecycle — start, observe meaningful progress, finalize — then surface authoritative Closing Intelligence/handoff.
- **MCP (write-aware):** `start_work_session` (required `goal`), `observe_work_session`, `finalize_work_session` with existing observation/outcome fields only.
- **MCP write boundary:** if MCP is available but write tools are absent → `CMI_WRITE_MODE_REQUIRED` (no silent CLI bypass).
- **CLI fallbacks (MCP unavailable only):** exact project-local
  `session start`, `session observe`, `session close`, then `session closing` for Closing presentation.
- **Invariant:** session completion ≠ Change completion; must not call `complete_change_record` solely because a session ends.
- **Classification:** write-aware thin adapter for CMI durable session state only — not project source edits, tests/builds/deploys, or Skill installation.
- **Field validation:** not claimed in Mission 1.7.

See `skills/cmi-work-session/SKILL.md` for the full contract.

### `cmi-change-loop` (Mission 1.7 Wave 2)

- **Open format:** Agent Skills-compatible `SKILL.md` with required frontmatter `name: cmi-change-loop`.
- **Purpose:** BEFORE/DURING/AFTER Change Intelligence for real implementation/refactor/fix work (not read-only investigation alone).
- **MCP (write-aware):** optional read `get_change_insights`; mutations `start_change_record`, `observe_change_record`, `complete_change_record` with existing schemas only.
- **MCP write boundary:** if MCP is available but write tools are absent → `CMI_WRITE_MODE_REQUIRED` (no silent CLI bypass).
- **CLI fallbacks (MCP unavailable only):** exact project-local `change start|observe|complete`.
- **Invariant:** `outcome = partial` keeps the Change **active**; do not terminalize partial/paused/review work; do not auto-`remember` learning candidates.
- **Verification provenance:** preserve `reported` vs `observed-command`; CMI does not execute verification commands.
- **Field validation:** not claimed in Mission 1.7.

See `skills/cmi-change-loop/SKILL.md` for the full contract.

### `cmi-activate` (Mission 1.7 Wave 2)

- **Open format:** Agent Skills-compatible `SKILL.md` with required frontmatter `name: cmi-activate`.
- **Purpose:** explicit invocation of existing CMI activation only when the user asks to activate/set up CMI integration.
- **Surface:** **CLI-only** (no MCP activation tool):
  `node "./node_modules/codex-memory-intelligence/src/cli-entry.js" activate --agent codex|generic --json`
- **Mutation disclosure:** may initialize `.codex-memory`, scan, and for Codex manage bounded blocks in `AGENTS.md` / `.codex/config.toml`. Fail closed on conflicts (`ACTIVATION_BLOCKED`).
- **Critical:** activation is **not** Skill installation, discovery, or loading; does not write `~/.codex/skills`, `~/.grok/skills`, or `~/.agents/skills`.
- **Limitation:** first Codex activation requires a new Codex run/session for managed instructions to take effect.
- **Field validation:** not claimed in Mission 1.7.

See `skills/cmi-activate/SKILL.md` for the full contract.

## Planned Skill inventory implemented

All **eight** original planned Skill artifacts are implemented and **packaged** under npm `files` → `skills/`:

`cmi-ambient-brief`, `cmi-continue`, `cmi-evidence-health`, `cmi-closing`, `cmi-memory-review`, `cmi-work-session`, `cmi-change-loop`, `cmi-activate`.

They remain open-format thin adapters: **no** native Skill loader, **no** automatic Skill discovery, **no** auto-activation on npm install, and **no** Skill installation by `cmi activate`. Final runtime field acceptance is Mission **1.8B**.

## Non-goals

Explicitly excluded:

- New Skill runtime or loader inside CMI
- Automatic Skill discovery or automatic execution on every task
- Vendor-specific logic inside CMI core
- Automatic durable-memory mutation beyond intentionally invoked write-aware Skill adapters
- Replacing MCP or CLI
- Changing Issue #41 field-validation behavior
- New CMI commands, MCP tools, arguments, or schemas for Skill loading
- Core changes to activation, session, Change, or Closing Intelligence behavior to “install Skills”
- Agent-specific skill install placement (`.agents/skills`, `.grok/skills`, plugins, symlinks) performed by CMI
- Claiming Codex or Grok runtime discovery has been validated by packaging alone
- Claiming all eight Skills have completed final field validation (Mission 1.8B)
- Treating `cmi activate` as Skill installation
- Version bump / npm publish as part of packaging alone

## Future candidates (not implemented)

None remaining from the original planned Skill inventory.

Any **additional** future Skill beyond the original eight must remain a thin adapter over existing executable surfaces and preserve evidence boundaries (observed ≠ inference ≠ reviewed durable knowledge).

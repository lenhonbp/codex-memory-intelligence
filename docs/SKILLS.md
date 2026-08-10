# Skills (repository contract PoC)

## Status

This repository currently has **no native Skill runtime or loader**.

Mission 1 adds a **repository-level reusable Skill contract PoC** with the following open-format Skill artifacts:

- `skills/cmi-ambient-brief/SKILL.md`
- `skills/cmi-continue/SKILL.md`

These Skills are structured according to the **Agent Skills open format** (`SKILL.md` with required YAML frontmatter `name` and `description`, plus Markdown instructions). That structural alignment does **not** prove Codex, Grok, or any other agent runtime discovers or invokes them automatically.

The Skills remain **repository-level Skill artifacts**. CMI activation still does **not** automatically discover or apply Skills. Agent-specific discovery, install placement (for example under an agent’s own skills directory), and plugins remain **edge concerns** and are **not** implemented in this repository mission.

The Skills are intentionally **not** listed in `package.json` `files` and are **not** published to npm consumers in this phase. Packaging and distribution remain a later architecture decision.

Do not claim that installing `codex-memory-intelligence` from npm delivers Skills.
Do not claim that npm installation activates Skills.
Do not claim that this repository has proven Codex or Grok runtime Skill discovery.

## Architectural rule

Skills are **thin orchestration adapters** over existing CMI executable surfaces.

CMI core remains:

- local-first
- project-agnostic
- agent-independent
- evidence-driven

A Skill tells an agent **which existing CMI MCP tool or CLI invocation to call**. It must not reimplement core logic (intent routing, graph, ranking, memory lifecycle, session/change semantics).

## Separation of concerns

| Layer | Role |
|-------|------|
| **CMI core executable behavior** | Authoritative implementation in `src/**` (CLI, MCP, Ambient, session, change, closing, memory). |
| **Skill contract** | Markdown (or similar) workflow artifact that documents triggers, inputs, exact existing invocations, read/write boundaries, and failure rules. Open-format `SKILL.md` frontmatter supports progressive discovery metadata without implying a CMI loader. |
| **Optional future vendor adapters** | Edge-only mappings to a specific agent’s Skill discovery/install paths; must call the same CMI surfaces. Not present in Mission 1 beyond the portable open-format contract. |
| **Optional future distribution** | How Skills ship (npm, separate pack, etc.). Explicitly out of scope for Mission 1. |

## Mission 1 Skills

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

## Non-goals (Mission 1)

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

## Future candidates (not implemented)

Names only; no contracts or code beyond the implemented Skills above:

- `cmi-activate`
- `cmi-work-session`
- `cmi-change-loop`
- `cmi-closing`
- `cmi-evidence-health`
- `cmi-memory-review`

Any future Skill must remain a thin adapter over existing executable surfaces and preserve evidence boundaries (observed ≠ inference ≠ reviewed durable knowledge).

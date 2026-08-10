# Skills (repository contract PoC)

## Status

This repository currently has **no native Skill runtime or loader**.

Mission 1 adds a **repository-level reusable Skill contract PoC** only:

- `skills/cmi-ambient-brief/SKILL.md`

The Skill is intentionally **not** listed in `package.json` `files` and is **not** published to npm consumers in this phase. Packaging and distribution remain a later architecture decision.

Do not claim that installing `codex-memory-intelligence` from npm delivers Skills.

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
| **Skill contract** | Markdown (or similar) workflow artifact that documents triggers, inputs, exact existing invocations, read/write boundaries, and failure rules. |
| **Optional future vendor adapters** | Edge-only mappings to a specific agent’s Skill format; must call the same CMI surfaces. Not present in Mission 1 beyond the agnostic contract. |
| **Optional future distribution** | How Skills ship (npm, separate pack, etc.). Explicitly out of scope for Mission 1. |

## Mission 1 Skill

### `cmi-ambient-brief`

- **Surface:** existing Ambient Intelligence only.
- **MCP:** `get_ambient_task_brief` with input `{ "request": "string" }` only (no workspace argument).
- **CLI fallback:** exact project-local entrypoint
  `node "./node_modules/codex-memory-intelligence/src/cli-entry.js" ambient "<user request>" --json`
- **Classification:** strictly **read-only**.
- **Not automatic:** not wired into activation; externally supplied or selected workflow artifact for external agent tooling (CMI has no Skill loader).

See `skills/cmi-ambient-brief/SKILL.md` for the full contract.

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

## Future candidates (not implemented)

Names only; no contracts or code in Mission 1:

- `cmi-activate`
- `cmi-work-session`
- `cmi-change-loop`
- `cmi-closing`
- `cmi-continue`
- `cmi-evidence-health`
- `cmi-memory-review`

Any future Skill must remain a thin adapter over existing executable surfaces and preserve evidence boundaries (observed ≠ inference ≠ reviewed durable knowledge).

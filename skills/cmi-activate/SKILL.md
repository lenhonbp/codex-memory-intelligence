---
name: cmi-activate
description: Explicitly invoke existing CMI activation (initialize/scan project intelligence and, for Codex, manage bounded AGENTS.md and .codex/config.toml integration). Use only when the user explicitly asks to activate CMI, set up CMI integration, or configure CMI for Codex/generic (including Vietnamese activation requests). CLI-only thin adapter; no MCP activation tool; activation is not Skill installation. External tooling may select it. CMI activation does not auto-apply Skills, and npm install does not deliver or activate them.
---

# Skill: cmi-activate

## 1. Purpose

Explicitly invoke the **existing** CMI activation operation.

Activation is a real **mutation** operation: it may initialize/scan CMI evidence and, for supported Codex activation, manage bounded project integration surfaces.

This Skill does **not** implement activation logic, conflict repair, or a Skill installer. It is a thin orchestration adapter over the existing CLI activation surface.

## 2. Appropriate trigger

Use **ONLY** when the user explicitly asks to:

- activate CMI
- set up CMI integration
- configure CMI for Codex
- initialize the managed CMI agent integration

Examples: “Activate CMI for Codex in this project.” / “Run CMI activation.” / “Kích hoạt CMI cho Codex.” / “Thiết lập CMI integration cho repo này.”

## 3. Non-triggers

Do **not** run activation merely because the user asks an ordinary project question, continues work, checks health, or starts a session/Change.

## 4. No MCP activation tool

There is currently **no** dedicated MCP activation tool. Do **not** invent one.

Activation is **CLI-only** via the exact project-local entrypoint.

## 5. Exact local CLI invocation

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" activate --agent codex --json
```

or:

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" activate --agent generic --json
```

Supported `--agent` values **exactly**:

```text
codex
generic
```

Do **not** invent agent values such as `grok`, `claude`, `cursor`, or `vscode`.

Rules:

- Prefer the project-local entrypoint. Bare `cmi` PATH failure is not absence proof.
- Do **not** use registry `npx`.
- If the exact local entrypoint is unavailable: `CMI_LOCAL_INTERFACE_UNAVAILABLE`. Do not install automatically.

## 6. Mutation disclosure

Activation is **not** read-only.

Activation may:

- initialize `.codex-memory`
- scan/update generated CMI intelligence

For `--agent codex` it may also manage bounded CMI-owned blocks in:

- `AGENTS.md`
- `.codex/config.toml`

For `--agent generic`, existing activation does **not** create agent-specific integration files.

Do not claim activation is read-only.

## 7. Conflict safety (fail closed)

Existing core activation fails closed on unsafe integration state. Preserve that behavior.

Do **not** attempt to repair or overwrite around failures such as:

- partial managed markers
- duplicated managed markers
- malformed managed blocks
- unsafe/symlink integration paths
- unmanaged existing `[mcp_servers.cmi]` conflict
- oversized/unsafe integration file

If activation rejects the existing state:

```text
ACTIVATION_BLOCKED
```

Report the exact core diagnostic. Do not manually edit around it inside this Skill.

## 8. Idempotence

Repeated activation relies on existing core idempotence.

Do not:

- add duplicate managed blocks
- create a second custom integration
- replace core managed markers
- hand-edit `AGENTS.md` or `.codex/config.toml` before/after activation merely to force success

## 9. Activation is not Skill installation (critical)

```text
cmi activate
```

does **NOT** mean:

- install Skills
- copy Skills to agent runtime directories
- discover Skills
- load Skills
- activate Skills

Do **not** write to:

```text
~/.codex/skills
~/.grok/skills
~/.agents/skills
```

Do not claim Codex will discover repository `skills/` because activation ran. Runtime Skill distribution belongs to a later mission (Mission 1.8).

## 10. Codex restart limitation

Preserve existing activation limitation:

After first Codex activation, the user/client must start a **NEW** Codex run/session before assuming newly managed project instructions are in effect.

Do not claim the already-running agent session automatically reloads them.

Also preserve:

- project trust/client behavior may affect `.codex/config.toml` consumption
- CMI cannot force a client to honor project instructions or MCP

## 11. Permission boundary

An explicit request to activate CMI authorizes the **documented activation operation only**.

It does **NOT** authorize:

- arbitrary project source edits
- deployment / migrations / tests
- package installation
- memory promotion
- Change completion
- finding resolution
- Skill installation

## 12. Trust model

```text
CMI durable-state / integration mutation for activation
!= project source-edit permission for application code
!= test/build/deploy permission
!= business priority
```

## 13. Failure behavior

| Condition | Required behavior |
|-----------|-------------------|
| Explicit activation request; local CLI present | Run documented `activate --agent codex|generic --json`. |
| Local entrypoint missing | `CMI_LOCAL_INTERFACE_UNAVAILABLE`. |
| Core rejects unsafe integration | `ACTIVATION_BLOCKED` + core diagnostic; no manual bypass. |
| User did not explicitly request activation | Do not run this Skill. |

## 14. What it must never do

- Invent MCP activation tools or agent names
- Silently install Skills into runtime directories
- Claim activation enables Skill auto-discovery
- Hand-edit managed integration files to force success
- Use registry `npx`
- Expand into session/Change/memory mutations beyond activation
- Claim npm package install delivers Skills

## 15. Relationship to other Skills

| Concern | Skill |
|---------|--------|
| Session lifecycle | `cmi-work-session` |
| Change lifecycle | `cmi-change-loop` |
| Evidence health | `cmi-evidence-health` |
| Skill runtime distribution | Future Mission 1.8 — not this Skill |

This Skill does not change CMI core contracts.

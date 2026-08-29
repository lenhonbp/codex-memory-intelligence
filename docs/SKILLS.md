# Skills (portable package artifacts)

## Status

This repository currently has **no native Skill runtime or loader**.

CMI ships open-format `SKILL.md` artifacts as portable orchestration contracts. The original eight CMI lifecycle Skills remain implemented and packaged; the Agent OS tranche adds three portable adapters; the Capability tranche adds four bounded cross-domain adapters.

These Skills follow the Agent Skills open format (`SKILL.md` with required YAML frontmatter `name` and `description`, plus Markdown instructions). Structural compatibility does **not** prove that Codex, Grok, or another runtime discovers or invokes them automatically.

## Distribution contract

```text
npm package ships Skill artifacts
!=
npm installation activates Skills
!=
CMI activation installs Skills
!=
CMI owns Skill discovery
```

- All **fifteen** currently supported Skill artifacts are **implemented** and **npm-distributed** under `package.json` `files` → `skills/`.
- **npm installation does not activate Skills** and does not install them into agent runtime directories.
- CMI activation does **not** automatically discover or apply Skills.
- **CMI has no native Skill loader**, Skill registry, discovery engine, or Skill execution subsystem.
- **`cmi activate` does not install Skills** into `~/.codex/skills`, `~/.grok/skills`, `~/.agents/skills`, or another runtime Skill location.
- Runtime installation/discovery remains external and runtime/version-specific.
- Final Codex S0–S7 field acceptance on subject `c05098fa82ddf85a4443e3769801baf78e12c200` was **runtime-blocked** and is not accepted as PASS.
- Packaging alone must never be presented as proof of runtime Skill discovery.

## Architectural rule

Skills are thin orchestration adapters. CMI core remains local-first, project-agnostic, agent-independent, and evidence-driven. A Skill may guide an agent to existing CMI or explicitly external capabilities, but must not silently reimplement CMI memory, graph, evidence lifecycle, Session, Change, trust, or authorization semantics.

## Supported Skill inventory

### CMI lifecycle tranche — 8

- `cmi-ambient-brief` — read-only task orientation through existing Ambient Intelligence.
- `cmi-continue` — resume unfinished work from durable handoff and current repository evidence.
- `cmi-evidence-health` — inspect project-level CMI readiness and evidence usability.
- `cmi-closing` — surface existing Closing Intelligence for an already-closed session.
- `cmi-memory-review` — prepare stale/review/untracked/inactive/blocked durable-memory review without mutation.
- `cmi-work-session` — orchestrate explicit durable Session start, observation, and finalization.
- `cmi-change-loop` — orchestrate BEFORE/DURING/AFTER Change Intelligence while preserving verification provenance.
- `cmi-activate` — explicitly invoke existing CMI activation; activation is not Skill installation.

### Agent OS tranche — 3

- `cmi-agent-operating-system` — apply the cross-domain Orient → Handoff operating contract while preserving CMI lifecycle, provenance, write-mode, and authorization boundaries.
- `cmi-evidence-first-workflow` — maintain typed evidence addresses and verification provenance without introducing a parallel evidence or memory system.
- `cmi-release-readiness` — assess release readiness for an exact revision while keeping prepare, verify, approve, and publish as separate gates.

See [`AGENT_OS.md`](AGENT_OS.md) for the normative Agent OS contract.

### Capability tranche — 4

- `cmi-solution-discovery` — investigate established reusable solutions before implementing a common capability; discovery is evidence, not automatic adoption.
- `cmi-skill-discovery` — discover candidate agent Skills from bounded external sources without treating discovery as installation, trust, or compatibility proof.
- `cmi-skill-authoring` — author or adapt portable Skill contracts while preserving CMI evidence, lifecycle, and runtime boundaries.
- `cmi-output-quality-review` — review generated output for concrete quality defects and undesirable patterns without inventing evidence or silently rewriting authoritative state.

The Capability tranche expands reusable agent workflows without creating new CMI core runtime behavior. External tools, repositories, search surfaces, browsers, or runtimes referenced by a capability Skill remain edge dependencies and must be reported truthfully when unavailable.

## Contract boundaries

Across all fifteen Skills:

- Read-only Skills must not silently mutate CMI state.
- Write-aware Skills require explicit user intent and must preserve existing CMI authorization/write-mode boundaries.
- Session completion does not imply Change completion.
- `outcome = partial` must not be promoted to terminal completion.
- Reported verification must not be elevated to observed-command, CI, live, or release evidence.
- Recommendations, rankings, severity, package metadata, or discovered third-party artifacts do not automatically authorize execution or adoption.
- Runtime-specific Skill discovery/install paths are external concerns.
- Missing external capability must be surfaced as blocked/unknown rather than fabricated as success.

## Package distribution

The npm package ships the complete `skills/` directory through `package.json` `files`. Shipping artifacts is intentionally separate from activation and runtime discovery. Consumers or vendor-specific adapters may place Skills into runtime-specific locations, but CMI itself does not own that installation surface.

## Non-goals

Explicitly excluded:

- New Skill runtime or loader inside CMI.
- Automatic Skill discovery or execution on every task.
- Automatic installation into agent-specific Skill directories.
- Vendor-specific runtime behavior inside CMI core.
- Replacing MCP or CLI with Skill-specific duplicate implementations.
- Automatic durable-memory mutation beyond intentionally invoked write-aware adapters.
- Treating `cmi activate` as Skill installation.
- Claiming universal Codex/Grok/other runtime discovery from packaging alone.
- Claiming runtime-blocked final Codex S0–S7 acceptance as PASS.

Additional domain Skills beyond the current fifteen remain future candidates and require independent evidence before promotion into the supported inventory.

# Skill: cmi-ambient-brief

## 1. Purpose

Provide a bounded, evidence-labeled ambient task brief for a coding agent at the start of substantive repository work. The Skill is a thin orchestration contract over the existing CMI Ambient Intelligence surface. It tells the agent to call CMI; it does not reimplement CMI.

This Skill is a repository-only reusable workflow artifact for Mission 1. It is not a runtime subsystem, not a Skill loader, and is not automatically applied by activation. External agent tooling may select and apply this artifact; CMI itself does not load Skills.

## 2. Appropriate trigger

An external agent (or external agent tooling) should select and apply this workflow artifact when:

- Beginning substantive repository work and a CMI ambient task brief is wanted.
- The user (or agent workflow) asks for an ambient brief, task context, or “what does CMI know about this request?”
- A short natural-language repository request should be routed through CMI Ambient Intelligence before deeper session or change work.

## 3. Non-triggers

Do not treat this Skill as:

- Automatic wiring for every repository task (activation is unchanged; this Skill is an externally supplied or selected workflow artifact, not auto-applied by CMI).
- A substitute for starting or closing a work session.
- A substitute for Change Intelligence lifecycle.
- A source of Closing Intelligence or a `### CMI Intelligence` / CLEAN footer.
- Authority to edit code, broaden scope, or promote candidates into durable project truth.

## 4. Inputs

| Input | Required | Notes |
|-------|----------|--------|
| `request` | Yes | Non-empty string. Prefer the user’s request verbatim. |

There is **no workspace argument** on the current Ambient surface. Do not invent one.

Empty `request` is an invalid invocation.

## 5. Exact existing MCP invocation

Prefer MCP when available.

- Tool name: `get_ambient_task_brief`
- Input schema (authoritative; do not extend):

```json
{
  "request": "string"
}
```

Call only this tool with only the `request` field. Do not pass undocumented arguments.

## 6. Exact local CLI fallback

When MCP is unavailable, and only then, use the exact project-local package entrypoint from the project root:

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" ambient "<user request>" --json
```

Rules:

- Prefer MCP over CLI when MCP is available.
- A bare `cmi` command PATH failure alone is **not** evidence that CMI is unavailable.
- Do **not** use registry `npx` (or any other registry resolution) as a lifecycle or Ambient fallback.
- If the exact local entrypoint above is absent or unusable **and** MCP is unavailable, report that Ambient Intelligence is unavailable. Do not invent an alternate invocation.

## 7. Read-only boundary

This Skill is **strictly read-only**.

It may invoke only the existing Ambient read surface: MCP `get_ambient_task_brief`, or the exact project-local CLI fallback documented in §6.

It must **not**:

- start a work session
- start a Change
- close or finalize a session
- scan the project
- refresh memory
- change memory or finding lifecycle state
- write findings
- write evaluations
- mutate `.codex-memory`
- synthesize Closing Intelligence
- emit or fabricate a CLEAN footer

## 8. Evidence / provenance rules

- Ambient classification, context, preparation, handoff, and workflow hints are **advisory**.
- Observed evidence, inference, and reviewed durable knowledge remain distinct; this Skill does not promote inference or candidates into durable project truth.
- Do not claim tests, builds, or deployments succeeded unless the agent actually observed them through its normal environment (this Skill does not run or record verification).
- Degraded or missing graph/index evidence may reduce context or preparation; report the actual evidence state returned by CMI.
- Intent and workflow hints do not authorize edits or broaden user scope.

## 9. Failure behavior

| Condition | Required behavior |
|-----------|-------------------|
| Empty `request` | Invalid invocation; do not call Ambient. |
| MCP available | Use `get_ambient_task_brief` only. |
| MCP unavailable; exact local entrypoint present | Use the documented project-local CLI fallback only. |
| MCP unavailable; exact local entrypoint absent/unusable | Report Ambient Intelligence unavailable. Do not treat bare `cmi` PATH failure as the sole proof of absence. |
| Missing/stale graph or reduced evidence | Return/report the brief CMI actually produced; do not invent files, blockers, or health. |
| Any failure to obtain a brief | State the limitation honestly; continue only with evidence the agent can establish independently. |

Never fabricate CLEAN, blockers, verification results, or durable memory writes from a failed or partial Ambient call.

## 10. What it must never do

- Invent a `workspace` (or any other) input for Ambient.
- Invent new CMI commands, MCP tools, arguments, schemas, or capabilities.
- Reimplement intent regexes, routing tables, ranking, graph, or memory lifecycle logic.
- Auto-start sessions, Changes, or Closing Intelligence.
- Use bare `cmi` as the only documented fallback.
- Prescribe registry `npx` as fallback.
- Claim that installing the npm package delivers this Skill (repository-only PoC; the published package files list does not include the `skills/` tree).
- Alter activation, managed `AGENTS.md`, or `.codex/config.toml` generation.

## 11. Expected result handling

- Treat the tool/CLI JSON (or formatted brief) as the authoritative Ambient result for this invocation.
- Use classification, project/repository health, context, optional preparation, optional handoff, and workflow fields as **advisory** guidance for the agent’s next steps.
- Keep user intent in control: do not broaden the task solely because the brief suggests related work.
- Do **not** treat the Ambient brief as a completed session or as Closing Intelligence.
- Do **not** append a `### CMI Intelligence` / CLEAN section based on this Skill alone.

## 12. Relationship to later session / change / closing lifecycle

| Later concern | Relationship |
|---------------|--------------|
| Work session | Out of scope for this Skill. Start/observe/finalize via existing session surfaces when the agent chooses, after (or independently of) the brief. |
| Change Intelligence | Out of scope. Start/observe/complete Changes only when implementation work requires it and writes are enabled. |
| Closing Intelligence | Out of scope. CLEAN/footer only from a real closed-session Closing Intelligence result, never from Ambient. |
| Continuation / handoff | Ambient may surface handoff data for continue-intent requests; resuming work still uses session handoff and current repository evidence, not this Skill alone. |

Ambient advice remains advisory. Session completion remains independent from Change completion. This Skill does not change those contracts.

# CMI Closing Intelligence

Closing Intelligence is CMI's bounded end-of-work read model. It exists so unresolved work, verification gaps, and reviewed project constraints remain visible when an AI agent finishes a substantive repository task.

## Agent-facing contract

After a supported agent finalizes a substantial CMI work session, it should append a concise `### CMI Intelligence` section to its normal user-visible answer. The section is authoritative only when backed by a real closed session and a Closing Intelligence result; project/evidence health alone is not Closing Intelligence.

CMI shows at most three alerts, ordered by materiality:

- `BLOCKER`: failed verification or an unresolved session blocker.
- `WARNING`: material verification, evidence-health, scope, or consistency risk that should be addressed before treating affected work as complete.
- `REMINDER`: unfinished previous work, open questions, uncommitted scope, or a reviewed consistency rule that applies and should be checked.
- `INFO`: lower-impact accepted or informational project evidence.
- `CLEAN`: no material closing alert was found.

The footer is product presence, not advertising copy: it should demonstrate value by surfacing evidence the user or agent might otherwise forget.

## Cross-session continuity

Closing Intelligence reads current persistent findings and active Change Intelligence records. If Feature A remains active while the user later works on unrelated Feature B, B's closing view can show `Unfinished previous work: Feature A`. Starting B does not silently abandon A, and the reminder disappears only when current evidence/lifecycle no longer supports it.

Session completion != Change completion. Closing a session with a partial, paused, or review-pending Change keeps that Change under the handoff's `activeChanges`; unfinished work is a non-blocking reminder by default. A Change appears under `completedChanges` only after its own terminal lifecycle operation succeeds.

CMI does not block a user from changing priorities. Carryover work is a reminder unless stronger evidence makes it directly relevant or blocking.

## Graph freshness at close

Repository source edits normally invalidate generated graph fingerprints. CMI keeps the graph itself honestly stale until `cmi scan` rebuilds generated intelligence; Closing Intelligence does not mark stale graph evidence current or auto-scan merely to produce a clean footer.

When a session started from a current graph and every stale graph node is explained by that session's attributed source mutation scope, with no missing nodes, source-set drift, resolver/workspace drift, scan-policy drift, unreadable discovery input, or generated-format problem, Closing Intelligence treats the condition as a non-blocking refresh reminder rather than a material graph-drift warning. The reminder still means graph/impact evidence must be refreshed before the next task relies on it.

Drift that predates the session, changes graph structure/configuration, contains missing nodes, or cannot be explained by the current session remains a material warning and keeps the existing `cmi scan` recovery action.

## Consistency and reviewed rules

CMI may surface reviewed-current facts, decisions, or lessons that are relevant to the just-closed session. Relevance is only a cue to verify compliance.

A reviewed design/Figma, architecture, database, security, or other project rule is **not** automatically a proven violation. The closing alert explicitly says when CMI has not established a violation. Actual conflict language requires stronger observed evidence, such as failed verification or another evidence-backed finding.

This preserves the distinction between observed violations/failures, reviewed durable project knowledge, historical correlation, and inferred relevance.

## Persistence

Closing Intelligence introduces no new durable notification database or persistence schema. It is computed from existing session, finding, change, and reviewed-memory evidence. Findings keep their existing lifecycle (`open`, `accepted`, `resolved`, `dismissed`, `superseded`), and active changes keep the existing Change Intelligence lifecycle.

## Interfaces

CLI:

```bash
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" session closing latest
node "./node_modules/codex-memory-intelligence/src/cli-entry.js" session closing <session-id> --json
```

For an activated project without MCP, use this exact project-local package entrypoint rather than assuming the `cmi` bin directory is exposed through `PATH`. Do not use a network-capable `npx` fallback for lifecycle calls.

MCP:

- read-only tool: `get_closing_intelligence`
- resource: `cmi://project/closing-intelligence/latest`
- `finalize_work_session` returns the existing closed-session record plus a non-persisted `closingIntelligence` read model in tool structured output.

## Evidence limits

Closing Intelligence does not create project truth, prove universal agent compliance, or establish productivity/time-savings claims. Agent adapters can require presentation behavior only on clients that actually honor project instructions/MCP. If the session cannot be started or closed, the agent must report that Closing Intelligence was not finalized and may report verified project/evidence health separately, but must not present health-only evidence as a Closing-style `CLEAN` result.

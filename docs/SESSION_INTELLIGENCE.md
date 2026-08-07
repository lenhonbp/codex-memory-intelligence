# Session Continuation Intelligence

CMI session intelligence is the project-level continuation layer that answers a practical question at the end of work:

> What happened, what is still wrong or uncertain, and what should happen next?

The design goal is **track → understand → surface → recommend → continue**. A user should not need to ask a coding agent "what should I do next?" after every substantial session.

This capability is local-first, deterministic where possible, evidence-labeled where inference or history is involved, and independent of any one AI vendor.

## Why a session is broader than a code change

A useful project session may contain no source edit at all. CMI supports sessions for:

- implementation;
- debugging and root-cause investigation;
- repository or architecture audit;
- code review;
- verification/testing;
- research;
- migration planning;
- failed or abandoned approaches;
- decisions and open questions.

Change Intelligence remains responsible for expected-vs-actual code-change evidence. Session Intelligence sits above it and combines change records with repository health, durable memory health, explicit observations, persistent findings, and historical signals.

```text
PROJECT STATE
    ↓
SESSION START
    ↓
WORK / INVESTIGATION / VERIFICATION
    ↓
SESSION CLOSE
    ↓
OUTCOME + OPEN FINDINGS + NEXT ACTIONS + HANDOFF
    ↓
NEXT SESSION
```

## CLI lifecycle

Start a session before substantial project work:

```bash
cmi session start "investigate authentication retries"
```

Record evidence the repository cannot infer itself:

```bash
cmi session observe latest \
  --accomplished "Mapped the API-to-worker retry flow" \
  --blocker "Worker retry ownership is unclear" \
  --question "Can both boundaries retry the same request?"
```

Inspect the live state at any point:

```bash
cmi session status latest
```

Close the session:

```bash
cmi session close latest \
  --accomplished "Confirmed API retry behavior" \
  --decision "Keep retry ownership at one boundary pending review"
```

`session close` always produces:

- outcome classification;
- problems/unresolved findings;
- prioritized recommended next actions;
- one explicit highest-priority next action;
- review-only knowledge candidates;
- a continuation handoff.

Inspect history and handoff:

```bash
cmi session list
cmi session show <id>
cmi session handoff latest
```

## Session outcomes

CMI supports:

- `succeeded` — completed work with no detected blocker that requires a weaker outcome;
- `partial` — useful work was completed but active work, incomplete verification, or session worktree state remains;
- `blocked` — a high-priority explicit blocker or critical failure prevents reliable continuation;
- `investigated` — the session produced useful understanding without requiring a code change;
- `abandoned` — work was intentionally stopped;
- `unknown` — available evidence is insufficient for a stronger classification.

An agent or user may provide an explicit outcome. Otherwise CMI derives a conservative outcome from current evidence. An explicit label is still a supplied claim; it does not override the findings that CMI reports.

## Persistent Finding Intelligence

Findings are durable project issues under `.codex-memory/findings.json`. They exist so an unresolved problem does not disappear merely because one AI session ended.

Examples include:

- failed or incomplete verification;
- a completed change with no verification evidence;
- graph drift;
- stale reviewed memory;
- invalid change-history records;
- active change records left open;
- explicit blockers and open questions;
- expected-vs-actual prediction gaps;
- unexpected impact;
- session work that changed project scope without a Change Intelligence record;
- uncommitted session scope.

Finding states are:

- `open`;
- `resolved`;
- `accepted`;
- `dismissed`;
- `superseded`.

Manual findings such as blockers remain open across later sessions until explicitly reviewed. Deterministic health findings such as graph drift may auto-resolve when the measured condition disappears.

```bash
cmi finding list --status open
cmi finding show <id>
cmi finding state <id> resolved --reason "Verified migration order" --changed-by reviewer
```

CMI records occurrence/session history for repeated open findings. It does not silently delete reviewed history.

## Recommendation Intelligence

Recommendations are derived from evidence rather than generated as free-form advice.

Each recommendation has:

- `priority` — `P0` through `P3`;
- `action`;
- `reason`;
- `evidenceType`;
- concrete evidence references;
- confidence;
- related finding IDs when applicable.

Priority is deterministic for known finding classes. Current ordering favors:

```text
P0  blocking or failed verification
P1  incomplete reliable project/change state
P2  verification/prediction/impact evidence gaps
P3  review questions, hygiene, or no blocking follow-up
```

Historical verification patterns can suggest additional checks when enough relevant completed history exists. Those recommendations are explicitly labeled `historical-correlation`; they are not causal facts.

CMI does not execute a recommended command merely because it recommended it.

## Handoff Intelligence

A closed session stores a bounded handoff containing:

- objective and outcome;
- branch/HEAD/worktree state when Git is available;
- session-related paths;
- accomplishments and decisions;
- open questions;
- completed and active Change Intelligence records;
- persistent open findings;
- prioritized next actions;
- one explicit `nextAction`;
- review-only knowledge candidates;
- an agent continuation instruction.

The intended next-session behavior is:

```text
read latest handoff
→ re-check current repository evidence
→ address P0/P1 unless user changes priority
→ continue the objective
→ do not ask the user to reconstruct known project state
```

## MCP integration contract

The session-aware MCP endpoint exposes read tools:

- `get_work_session_status`;
- `get_work_session_report`;
- `list_work_sessions`;
- `get_session_handoff`;
- `list_project_findings`;
- `get_project_finding`.

With `CMI_WRITE_ENABLED=1`, it also exposes:

- `start_work_session`;
- `observe_work_session`;
- `finalize_work_session`;
- `set_project_finding_state`.

Resources:

- `cmi://project/session/latest`;
- `cmi://project/session-handoff/latest`;
- `cmi://project/findings`.

Prompts:

- `close_project_session`;
- `continue_from_session_handoff`.

The MCP server instruction explicitly tells connected agents to finalize substantial work and surface P0/P1 findings plus the highest-priority next action before ending a session.

This is an integration contract, not a universal lifecycle hook. CMI cannot force an arbitrary client that ignores MCP instructions to call `finalize_work_session` before disconnecting.

## Evidence semantics

Session intelligence preserves the same trust boundary as the rest of CMI:

- **observed** — direct repository/session evidence;
- **reviewed** — durable knowledge explicitly reviewed by a human or approved process;
- **historical-correlation** — repeated patterns from stored completed history;
- **inferred** — advisory reasoning from deterministic heuristics.

Changed paths do not prove complete runtime impact. A historical verification pattern does not prove a test is required. A user/agent observation is evidence supplied to CMI, not independent attestation.

## Storage and safety

Session records live under:

```text
.codex-memory/sessions/<uuid>.json
```

Persistent findings live at:

```text
.codex-memory/findings.json
```

Both are intentionally durable and reviewable. CMI-internal paths are excluded from project-change scope.

Safety properties include:

- bounded record count and record size;
- project-relative explicit paths only;
- secret-pattern rejection for supplied session text;
- no-follow/symlink-safe record reads where the platform supports it;
- atomic JSON replacement;
- local write locking with stale-lock reclamation;
- unique ID-prefix resolution;
- no automatic execution of project commands;
- no automatic promotion of knowledge candidates into durable facts/decisions/mistakes.

## What CMI intentionally does not claim

CMI does not claim that:

- every AI client will obey the close-session prompt;
- static graph evidence describes all runtime behavior;
- recommendation priority proves business priority;
- historical co-change or verification patterns are causal;
- a session outcome proves production correctness;
- every unresolved issue can be detected from repository evidence alone.

The purpose is narrower and more useful: preserve what CMI can actually observe or was explicitly told, keep unresolved evidence visible across sessions, and make the best-supported next action explicit.

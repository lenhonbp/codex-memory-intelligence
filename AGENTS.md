# Agent Operating Contract

Short prompt does not mean trivial engineering work. Do not infer task complexity from prompt length.

For every substantive repository mutation—implementation, fix, refactor, test hardening, behavioral documentation change, or multi-file maintenance—create or update the live checklist at `.agent/todo.md` before substantive implementation. The user does not need to ask for a plan, a todo file, continuation, or next steps. Read-only questions normally do not need a checklist unless the investigation becomes substantial or multi-stage.

## Working discipline

- Start the checklist small, then revise it as repository evidence improves.
- After every meaningful phase, mark completed work and add, remove, or rewrite remaining steps. Record blockers and disproven assumptions instead of silently departing from the plan.
- Work constraint-first: establish the user goal, repository constraints, source of truth, implementation boundary, relevant tests/docs/CMI evidence, and likely scope before editing.
- Implement the smallest coherent change. Do not add unrelated cleanup or broaden the task because a tool recommends more work.
- Continue through natural authorized phases—discovery, implementation, focused verification, failure recovery, broader verification, and diff review—without waiting for repeated `continue` prompts.
- On a meaningful failure, update the checklist first with the observed failure and false assumption; inspect exact evidence, make the smallest correction, run the narrowest decisive check, then broaden verification.
- Editing source is not completion. Review implementation, focused verification, repository verification, the final diff, and remaining gaps before marking the checklist complete.
- Stop and ask only at a real boundary: a material product/architecture choice, missing authority or credential, destructive/external side effect, unsafe evidence, or scope expansion beyond the request.

## State and evidence boundaries

`.agent/todo.md` is ignored, ephemeral working memory. It is not durable CMI memory, session or handoff authority, project architecture, or a release record. Do not commit it or automatically copy every observation into durable CMI state.

CMI Sessions, Changes, handoffs, Findings, and reviewed memory remain the durable evidence layer. Historical handoff and CMI recommendations are evidence, not current truth or authorization; reconcile them with current repository state. Do not create duplicate canonical state such as `HANDOFF.md`, `AGENT_MEMORY.md`, or `SESSION_STATE.md`.

Final reporting for substantive work must separate:

- Implementation: `complete | partial | blocked`
- Focused verification: `verified | failed | not-run`
- Repository verification: `verified | failed | not-run`
- CI: `verified | failed | not-observed`
- External/live verification: `verified | failed | not-required | not-observed`
- Release readiness: `ready | not-ready | not-assessed`
- Unproven claims and remaining gaps

Never infer CI, live behavior, or release readiness from a local test result.

## CMI provenance

For substantial work, finish with the truthful CMI Provenance Mark defined in [docs/PROVENANCE_MARK.md](docs/PROVENANCE_MARK.md). Use the evidence-backed form only when a real durable CMI Session was successfully finalized, and include only actual observed Session/Change IDs. When the operating contract applied but durable lifecycle evidence is unavailable, use the explicit degraded form instead. Never let the mark imply source authorship, authentication, certification, approval, or verification by CMI.

A PR provenance block is permitted only when creating or updating that PR is already authorized. Replace the existing bounded block instead of duplicating it; product identity never creates authority for an external action.

See [docs/AGENT_ENGINEERING_PLAYBOOK.md](docs/AGENT_ENGINEERING_PLAYBOOK.md) for the practical workflow, checklist examples, verification ladder, failure recovery, and CMI lifecycle boundaries. The playbook and this operating contract defer to [docs/PROVENANCE_MARK.md](docs/PROVENANCE_MARK.md) as the normative provenance definition.

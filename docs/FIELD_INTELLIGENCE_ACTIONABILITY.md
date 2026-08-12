# Field Intelligence Actionability

Status: implemented as a field-hardening contract on top of Closing Intelligence.

## Why this exists

Long-running dogfooding exposed a gap that unit-level correctness alone did not capture: CMI could correctly detect a signal while the surfaced report still left the user asking where the issue was, which durable record produced it, or whether the warning belonged to the current session or historical project state.

Observed field patterns included:

- prediction-gap summaries such as “2 paths” or “10 paths” without the paths being preserved in the agent-facing report;
- historical prediction gaps that remained visible without a durable Finding/Change reference in prose;
- graph-drift guidance that said a refresh was required without preserving the stale source paths in the surfaced result;
- session reports that showed CMI Intelligence without identifying the runtime CMI version that produced it;
- a historical `uncaptured-session-change` recommendation appearing materially urgent in a later completed session.

These are **actionability problems**, not evidence-trust permission to invent stronger conclusions.

## Contract

Closing Intelligence now keeps the following context visible when available:

- `runtime.name` and `runtime.version`;
- `findingId`;
- `relatedChangeIds`;
- `relatedFiles`;
- `scopeRelation` (`current-session` or `historical-project`);
- extracted evidence anchors;
- a bounded per-alert `recommendedAction` for field categories where the next inspection step is clear.

The formatted Closing view prints concrete file paths and record references instead of relying on an aggregate count alone.

## Historical warning semantics

An open historical finding is still project evidence. CMI does not silently delete or resolve durable findings from the Closing read model.

However, the Closing view distinguishes historical project evidence from findings produced by the session being reviewed. In particular, a historical `uncaptured-session-change` must not remain a material P0/P1 blocker for a later unrelated completed session merely because the durable finding is still open. The read model downgrades that historical follow-up to P3 while preserving its Finding ID, paths, evidence, and review action.

This does **not** mark the durable finding resolved. Resolution still belongs to the explicit findings lifecycle.

## Graph drift

Expected source mutation can make stored graph fingerprints stale after successful work. When that happens:

- the warning/reminder keeps the affected `relatedFiles` visible;
- the action says to run `cmi scan` before the next graph/impact-dependent task;
- the warning must not imply a product defect merely because the graph needs refresh;
- agents must not run a scan only to manufacture a CLEAN closing state.

## Prediction gaps

A prediction gap should answer all of the following when the evidence exists:

1. Which path escaped predicted scope?
2. Which Change record is related?
3. Is the alert current-session or historical-project evidence?
4. What should be reviewed before relying on the same prediction boundary again?

CMI may still bound large path lists, but surfaced reports must preserve the returned concrete paths instead of replacing them with only a count.

## Runtime observability

Closing Intelligence includes the CMI runtime version from `src/version.js`. This allows field reports to distinguish product behavior across releases without requiring the user to infer the installed version from repository or npm metadata.

Runtime version is observability metadata, not evidence that an external agent runtime loaded a particular Skill artifact.

## Agent-facing fidelity

The `cmi-closing` and `cmi-work-session` Skills require external agents to preserve the actionability fields returned by CMI. Agents must not:

- rewrite `relatedFiles` into only “N paths”;
- remove Finding/Change IDs when CMI returned them;
- erase `current-session` versus `historical-project` scope;
- omit returned evidence anchors or action guidance in a way that makes the warning non-actionable;
- promote a historical P3 follow-up back into a current P1 blocker in prose.

If CMI itself lacks a concrete location, the agent should state that limitation instead of inventing one.

## Regression coverage

Field-hardening tests cover:

- runtime version in Closing output;
- graph-drift file localization and refresh action;
- prediction-gap missed paths plus related Change ID;
- historical `uncaptured-session-change` material-priority downgrade;
- agent Skill contracts that preserve concrete paths and durable record references.

These tests complement, rather than replace, graph, session, Change Intelligence, MCP, packaging, and evidence-integrity coverage.

## Trust boundary

Actionability does not change CMI's core trust rule:

> Evidence addresses tell the user where a signal came from. They do not automatically prove a design, architecture, runtime, security, or policy violation.

Observed evidence, inference, reviewed knowledge, and established violations remain distinct states.

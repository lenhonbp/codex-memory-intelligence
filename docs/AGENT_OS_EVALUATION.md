# Agent OS Evaluation Protocol

**Status:** Incremental evaluation plan; descriptive only.
**Scope:** Compare an agent without Agent OS, an agent using CMI, and an agent using CMI plus Agent OS.

## 1. Purpose

This protocol evaluates whether the Agent OS contract improves evidence integrity, scope control, diagnosis, verification and handoff while preserving CMI's existing ownership boundaries. It does not treat one session, one repository or one fixture result as proof of general productivity.

The normative rubric is in [`evaluation/agent-os/rubric.md`](../evaluation/agent-os/rubric.md). Scenario fixtures are under [`evaluation/agent-os/scenarios/`](../evaluation/agent-os/scenarios/). They are task contracts and expected evidence shapes, not fabricated historical results.

## 2. Conditions

| Condition | Allowed | Not allowed |
|---|---|---|
| **A — Plain agent** | Repository, Git, ordinary source/text search, normal tests/builds and declared runtime tools. | CMI output, Agent OS policy bundle or prior durable CMI state. |
| **B — Agent + CMI** | Everything in A plus existing CMI CLI/MCP, memory/graph, Session, Change, findings, provenance and handoff surfaces. | Agent OS policies and experimental domain Skills. |
| **C — Agent + CMI + Agent OS** | Everything in B plus `docs/AGENT_OS.md`, `cmi-agent-operating-system`, evidence-first/release adapters and the selected fixture contract. | Hidden answers, post-hoc evidence authored outside the run, or tools outside the declared protocol. |

Run the same task specification and repository revision with fresh state. Reset project state between runs. Counterbalance or randomize condition order. Record model, tool, prompt and environment differences. A rerun after the agent has seen another condition's output is not independent evidence.

## 3. Scenario inventory

| Scenario | Primary risk | Status of domain claim |
|---|---|---|
| `game-prototype.md` | Content breadth hides an unproven core loop. | Domain-specific fixture; no claim of general game quality. |
| `ux-journey-audit.md` | Preference is mistaken for a user-facing defect. | Domain-specific fixture; requires actual journey evidence. |
| `coding-bug-fix.md` | Symptom patch and regression. | Good cross-condition core-policy fixture. |
| `schema-change.md` | Schema/runtime/template/fixture drift and partial references. | Coding/contract fixture. |
| `release-preparation.md` | Tag/package/local pass is mistaken for authorization. | Release boundary fixture. |
| `failure-recovery.md` | Blind rerun and hidden failure state. | Core recovery fixture. |
| `browser-mobile-verification.md` | Desktop/local pass is mistaken for mobile/live pass. | Domain-specific boundary fixture; currently evidence-limited. |
| `performance-verification.md` | “Smooth” claim without metric/workload. | Domain-specific boundary fixture; currently evidence-limited. |

## 4. Required run ledger

The evaluator should retain one record per run with:

| Field | Requirement |
|---|---|
| `runId` | Stable evaluator-generated ID; never fabricated as a CMI Session ID. |
| `condition` | `plain`, `cmi` or `cmi-agent-os`. |
| `scenario` | Scenario filename and version. |
| `repositoryRevision` | Exact revision under test. |
| `environment` | OS, runtime, browser/device/workload when relevant. |
| `modelAndTools` | Model/tool configuration and known differences. |
| `observations` | Raw observations with addresses and timestamps. |
| `clarifications` | User corrections/questions requested by agent. |
| `verification` | Focused, repository, CI, external/live and release states separately. |
| `outcome` | Succeeded, partial, blocked or failed, with evidence. |
| `rubric` | Dimension scores and reviewer notes. |
| `gaps` | Missing evidence, unsupported claims and unresolved findings. |

The study ledger should remain outside `.codex-memory` unless the existing CMI evaluation contract explicitly requires a bounded record. Do not auto-promote raw runs, hypotheses or fixture results to durable project memory.

## 5. Metrics

Report paired results before pooled averages. Minimum metrics are: independent repositories, paired tasks, condition order, time to first justified edit, reconstruction searches, clarification count, material risks found early/late/missed, false positives, verification level chosen, regressions, task outcome, handoff score and user follow-up count.

Time or speed must not compensate for fabricated evidence. A slower run that finds a material risk, verifies the original journey and hands off accurately may be better than a faster overclaiming run.

## 6. Scoring and pass discipline

Use the 0–4 rubric in [`../evaluation/agent-os/rubric.md`](../evaluation/agent-os/rubric.md). Required dimensions are scope, evidence integrity, verification and handoff. A proposed run-level pass requires no critical evidence violation, each required dimension at least 2 and at least 75% of the weighted maximum. A proposed strong result begins at 85%, subject to reviewer inspection.

These thresholds are proposed and not field-validated. Evaluation must report uncertainty, sample size and limitations. A high score with fabricated evidence is a fail.

## 7. CMI mapping

| Evaluation need | Existing CMI surface | Agent OS addition |
|---|---|---|
| Baseline/context | Ambient/context, status, doctor, pre-change intelligence | Require baseline before mutation; do not duplicate ranking. |
| Change tracking | Change Intelligence `BEFORE → DURING → AFTER` | Require exact lifecycle handling and partial-active behavior. |
| Session continuation | Session Intelligence and handoff | Require truthful IDs and context-preserving handoff. |
| Findings | Findings and evidence anchors | Keep finding severity separate from current priority. |
| Durable knowledge | Reviewed memory interface | Keep learning candidates as proposals; never auto-remember. |
| Verification | Runtime commands outside CMI; supplied evidence in CMI records | Separate local, CI, live and release results. |
| Skill distribution | Packaged open-format `skills/*/SKILL.md` | Test ship-but-not-activate contract; no loader/discovery. |

No new schema, CLI, MCP tool or `src/**` behavior is required by this evaluation protocol. If a run reveals a product gap, first test whether documentation or an edge adapter solves it. Core escalation requires repeated failure and a reviewed compatibility-preserving proposal.

## 8. Interpretation limits

The protocol can show bounded differences on declared scenarios. It cannot, by itself, establish universal Manus behavior, user productivity, end-user UX quality, game fun, accessibility, performance, adoption or production readiness. Current fixture results must be labeled fixture-scoped. Current absence of a contradiction is not evidence of universal validity.

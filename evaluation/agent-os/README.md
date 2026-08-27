# Agent OS Evaluation Fixtures

Đây là bộ fixture mở để kiểm tra portable Agent OS Skill theo từng scenario. Fixture chỉ mô tả task contract, evidence cần tạo và failure boundary; nó không chứa kết quả chạy thật, không tự tạo CMI Session/Change, không tự ghi memory và không thay thế test hoặc live verification.

## Required scenario coverage

| Scenario | Fixture | Primary contract checks | Evidence-limited boundary |
|---|---|---|---|
| Coding bug fix | [`coding-bug-fix.md`](scenarios/coding-bug-fix.md) | Observe before edit, root-cause diagnosis, smallest change, regression and handoff. | A fixture does not prove repository-wide debugging quality. |
| UX/product audit | [`ux-journey-audit.md`](scenarios/ux-journey-audit.md) | User goal, original journey, evidence address, replay after change. | Static preference is not comprehension, accessibility or task-completion evidence. |
| Schema/contract change | [`schema-change.md`](scenarios/schema-change.md) | Schema/runtime/template/fixture synchronization and negative cases. | A parsing pass is not proof that every consumer is compatible. |
| Release readiness | [`release-preparation.md`](scenarios/release-preparation.md) | Exact revision, verification ladder, approval separation and no external action. | Local/package/tag success is not release authorization. |
| Failure/recovery | [`failure-recovery.md`](scenarios/failure-recovery.md) | Failure → changed hypothesis/evidence → correction → rerun → contained outcome. | A final pass without the recovery chain is reduced evidence. |
| Browser/mobile verification | [`browser-mobile-verification.md`](scenarios/browser-mobile-verification.md) | Exact browser/device/viewport and original journey. | Desktop/local evidence is not mobile/live evidence; unavailable environment is `not-observed`. |

Additional boundary fixtures cover game prototype and performance verification. They remain domain-specific or evidence-limited and are not promoted to universal Agent OS policy.

## Running an evaluation

Use [`docs/AGENT_OS_EVALUATION.md`](../../docs/AGENT_OS_EVALUATION.md) for the A/B/C conditions and [`rubric.md`](rubric.md) for scoring. Start each run from a declared repository revision and fresh project state. Record condition, scenario, model/tools, environment, raw observations, clarifications, exact commands/journeys, verification statuses, outcome, rubric notes and evidence gaps.

Report focused/local, repository, CI, external/live and release readiness independently. If the required browser, device, CI, live environment or approval is unavailable, record `not-observed`, `not-run`, `not-required`, `not-assessed` or `blocked`; do not infer a pass.

## Promotion boundary

Scenario results are fixture-scoped. They do not establish universal agent accuracy, hidden Manus behavior, user productivity, end-user UX quality, game fun, performance, adoption or production readiness. Repeated cross-session evidence and explicit review are required before any pattern is promoted into core policy or durable CMI memory.

# Real Repository Corpus Validation

The real corpus validator exercises CMI against **pinned source trees from real GitHub repositories** without executing target repository software.

Its purpose is engineering validation: verify that scan, incremental reuse, doctor, context, impact, session, and handoff continue to work on representative JavaScript/TypeScript source trees beyond synthetic fixtures.

It is not a product-value study and does not establish that CMI makes an agent faster or more correct.

## Initial corpus

The committed manifest is `corpus/real-repositories.json`. Every repository entry pins an exact 40-character Git commit SHA.

The initial classes are intentionally bounded to CMI's strongest current evidence surface:

- Node/JavaScript self-host repository;
- TypeScript application/library repository;
- TypeScript monorepo.

Polyglot support is not inferred from this corpus and is not part of this tranche.

## Safety boundary

For each manifest entry the runner:

1. creates a disposable Git checkout;
2. attempts to fetch the exact preregistered commit SHA;
3. if the server refuses direct SHA fetch and the manifest declares a bounded `fetchRef`, fetches that ref only as a transport hint;
4. checks out the preregistered SHA, never the moving ref tip;
5. verifies `HEAD` equals that SHA;
6. invokes CMI `init`;
7. runs a full scan;
8. runs an unchanged incremental scan to exercise reuse;
9. runs `cmi doctor`;
10. runs one bounded `context` query;
11. runs one bounded `impact` query;
12. starts, closes, and produces a handoff for a validation session;
13. removes the disposable checkout unless explicitly retained for debugging.

The runner does **not**:

- run `npm install`, `pnpm install`, `yarn`, `bun install`, or equivalent;
- run target tests;
- run target builds;
- execute target package scripts;
- execute application code from the target repository;
- treat a moving branch or tag as evidence identity instead of the pinned SHA.

CMI writes only its own state inside the disposable checkout.

## Manifest contract

Each repository record contains:

```json
{
  "id": "stable-study-id",
  "repository": "owner/repository",
  "revision": "40-character-git-sha",
  "fetchRef": "refs/heads/main",
  "repoClass": "node-typescript",
  "contextQuery": "bounded query",
  "impactTarget": "repository/relative/file-or-symbol",
  "minWorkspaces": 0
}
```

`fetchRef` is optional. When present, it must be a bounded `refs/heads/...` or `refs/tags/...` value. It exists only for Git servers that refuse a direct fetch of an otherwise valid historical commit object. The execution plan always attempts the exact revision first, and after any transport fallback the runner checks out and verifies `revision` before CMI is allowed to run.

A changed `fetchRef` does not change the evidence identity. A changed `revision` does.

Supported repository classes are currently:

- `node-javascript`
- `node-typescript`
- `node-typescript-monorepo`

Repository URLs, branch names in `revision`, short SHAs, unsafe transport refs, absolute impact paths, and traversal targets are rejected.

## Commands

Validate the manifest without network access:

```bash
node scripts/real-corpus.js validate --manifest corpus/real-repositories.json
```

Inspect the exact execution policy and planned steps:

```bash
node scripts/real-corpus.js plan --manifest corpus/real-repositories.json
node scripts/real-corpus.js plan --manifest corpus/real-repositories.json --json
```

Run the pinned corpus:

```bash
node scripts/real-corpus.js run --manifest corpus/real-repositories.json --json
```

For controlled debugging only, `--work-root <dir>` selects the checkout parent and `--keep-checkouts` preserves disposable checkouts.

## Failure-preserving execution

The CLI execution layer runs each validated repository as an independent pinned sub-run. A failure in one repository does **not** stop later repositories from being exercised.

Failure collection does not make the gate permissive:

- a failed repository is recorded with `status: "failed"`;
- failure diagnostics are bounded and do not serialize error stacks;
- later repositories still run so the report shows the full corpus state;
- the overall report has `status: "failed"` when any repository fails;
- the CLI emits the complete report first and then exits non-zero.

The underlying `runRealCorpus()` library contract remains fail-closed for a single run. Failure collection and transport fallback live in the execution-orchestration layer around independent one-repository runs rather than silently weakening the core pinned-revision validator.

## Large CLI output boundary

The first live self-host corpus execution exposed a process-boundary defect that ordinary fixtures had not exercised: large JSON output written by the top-level CLI could be truncated when stdout was captured through a pipe because `cli-entry.js` forced `process.exit()` immediately after the delegated CLI module returned.

The top-level entrypoint now flushes stdout and stderr before the existing forced-exit boundary. `tests/cli-stdio-flush.test.js` locks the regression with a context response larger than 200 KB captured through `spawnSync`; the complete output must remain parseable JSON.

This fix is part of the real-corpus evidence tranche because the failure was discovered by executing the committed corpus rather than by a synthetic correctness-only test.

## Report contract

The report records bounded engineering metadata, including:

- observed exact revision;
- full and incremental scan duration/count summaries;
- parsed/reused source counts;
- workspace count;
- graph edge/symbol counts;
- doctor health/check count;
- bounded context/impact result counts and wall time;
- session/handoff completion and wall time;
- per-repository pass/fail state;
- whether a declared transport fallback was needed;
- bounded operational failure diagnostics when a repository does not complete.

The aggregate summary exposes `total`, `passed`, `failed`, and `healthy`, plus a top-level `status` that is `passed` only when the entire corpus passes.

It intentionally does not store retrieved source snippets as ground truth. Context/impact result counts show that the query path executed; they do not assert semantic correctness.

Reports carry `claimDiscipline: engineering-validation-only` and repeat that target code was not executed.

## First preserved live pilot

The first fully passing three-repository live execution is preserved at:

`evidence/real-corpus/2026-08-13-pilot.json`

Its provenance points to GitHub Actions workflow run `31690157805`, head `c3965aec3bd5bfd2b02cb9e3234e083fe5a2513c`, artifact `real-corpus-report` / ID `9177031950`, and artifact digest `sha256:fe51f9a680a9e11a50335a10898369ac0d7962c89a31017d2f8070cc6f797917`.

That run reported:

- 3 repositories total;
- 3 passed;
- 0 failed;
- 3 with healthy doctor state;
- complete full-scan, incremental-reuse, context, impact, session-close, and handoff paths on every pinned source tree;
- no target dependency installation, target build/test invocation, or target-code execution.

The stored timing values are **one observed GitHub-hosted execution only**. They are not p95/p99 measurements, cold-start measurements, concurrency/lock-contention evidence, or productivity measurements. The pilot remains `engineering-validation-only` and must not be presented as evidence that CMI makes an agent faster or more correct.

The final passing run fetched the self-host exact revision directly, so the optional `fetchRef` transport fallback was **not** exercised by that passing artifact. The fallback exists because an earlier live run encountered a real direct-SHA transport refusal; its exact-revision behavior is covered by the execution-plan and transport regression tests.

## CI policy

Pull requests run the **offline contract gate**: manifest validation, execution-plan validation, the large-stdout regression, and corpus unit tests using injected command runners. This keeps ordinary PR CI deterministic and avoids making external repositories a required dependency of every commit.

The external real-corpus run is scheduled and manually dispatchable. It requires network access because Git objects must be fetched, but the evidence revisions themselves do not move automatically.

The workflow preserves failure evidence before enforcing the red gate: the corpus command is allowed to finish and write `real-corpus-report.json`, the artifact upload runs even after a corpus failure, and a final enforcement step then fails the job. This keeps regressions visible without converting them into green CI.

A scheduled or manually dispatched external failure should be investigated as one of:

- CMI regression;
- Git/network operational failure;
- pinned Git object availability/transport problem;
- a newly exposed parser/graph limitation on the pinned source tree.

Do not silently advance a pin to make the job green. If a server transport rule prevents direct historical-SHA fetch, a reviewed `fetchRef` may be added only when the same pinned revision is still fetched, checked out, and verified.

## Updating the corpus

A corpus pin change must be reviewed like test-data code:

1. record the old and proposed SHA;
2. confirm the impact target exists at the proposed SHA;
3. explain why the revision or repository is being changed;
4. run the contract gate;
5. run the external corpus manually;
6. review metric changes before merging.

Repository additions should increase representativeness without silently expanding CMI's public support claim.

## Relationship to product evidence

Real-corpus validation answers:

> Does CMI's engineering workflow operate on these pinned real source trees?

The paired empirical study answers a different question:

> Under controlled conditions, does CMI change agent outcomes or effort relative to plain operation?

Keep these evidence classes separate. See `docs/PRODUCT_EVIDENCE_VALIDATION.md` for the stricter paired-study contract.

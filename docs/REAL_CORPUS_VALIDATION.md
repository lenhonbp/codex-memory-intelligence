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
2. fetches the exact preregistered commit SHA;
3. verifies `HEAD` equals that SHA;
4. invokes CMI `init`;
5. runs a full scan;
6. runs an unchanged incremental scan to exercise reuse;
7. runs `cmi doctor`;
8. runs one bounded `context` query;
9. runs one bounded `impact` query;
10. starts, closes, and produces a handoff for a validation session;
11. removes the disposable checkout unless explicitly retained for debugging.

The runner does **not**:

- run `npm install`, `pnpm install`, `yarn`, `bun install`, or equivalent;
- run target tests;
- run target builds;
- execute target package scripts;
- execute application code from the target repository;
- follow a moving branch or tag instead of the pinned SHA.

CMI writes only its own state inside the disposable checkout.

## Manifest contract

Each repository record contains:

```json
{
  "id": "stable-study-id",
  "repository": "owner/repository",
  "revision": "40-character-git-sha",
  "repoClass": "node-typescript",
  "contextQuery": "bounded query",
  "impactTarget": "repository/relative/file-or-symbol",
  "minWorkspaces": 0
}
```

Supported repository classes are currently:

- `node-javascript`
- `node-typescript`
- `node-typescript-monorepo`

URLs, branch names, short SHAs, absolute impact paths, and traversal targets are rejected.

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

## Report contract

The report records bounded engineering metadata, including:

- observed exact revision;
- full and incremental scan duration/count summaries;
- parsed/reused source counts;
- workspace count;
- graph edge/symbol counts;
- doctor health/check count;
- bounded context/impact result counts and wall time;
- session/handoff completion and wall time.

It intentionally does not store retrieved source snippets as ground truth. Context/impact result counts show that the query path executed; they do not assert semantic correctness.

Reports carry `claimDiscipline: engineering-validation-only` and repeat that target code was not executed.

## CI policy

Pull requests run the **offline contract gate**: manifest validation, execution-plan validation, and unit tests using an injected command runner. This keeps ordinary PR CI deterministic and avoids making external repositories a required dependency of every commit.

The external real-corpus run is scheduled and manually dispatchable. It requires network access because exact Git objects must be fetched, but the revisions themselves do not move automatically.

A scheduled external failure should be investigated as one of:

- CMI regression;
- Git/network operational failure;
- pinned Git object availability problem;
- a newly exposed parser/graph limitation on the pinned source tree.

Do not silently advance a pin to make the job green.

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
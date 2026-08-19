# Current Release Status

Updated: 2026-08-19

## v0.14.1 PUBLIC RELEASE

`v0.14.1` is the current supported public CMI release. It is a focused pre-v1 maintenance hotfix over `v0.14.0` for two field-reproduced Codex activation failures: registry bootstrap and project-root binding.

### Public release summary

| Field | Value |
|---|---|
| Public release | `v0.14.1` |
| npm package | `codex-memory-intelligence@0.14.1` |
| npm dist-tag | `latest` |
| Release commit/tag target | `c08163281df7990a2bcb4d7ecdcd4f5857b09c0b` |
| Temporary `release/v0.14.1` branch | removed after successful guarded publication |
| GitHub Release | [CMI v0.14.1](https://github.com/lenhonbp/codex-memory-intelligence/releases/tag/v0.14.1) |
| Public-source license | PolyForm Perimeter License 1.0.1 |

The `v0.14.1` tag resolves exactly to the release target above.

The guarded publication path validates exact release-target identity, release metadata consistency, full repository verification, benchmark smoke, packed installation, npm publication and registry visibility, GitHub Release creation, and only then removes the temporary release branch. The release branch was observed removed after publication. The current connector session did not expose the publication workflow run id or GitHub Release numeric id, so those identifiers are intentionally not invented here.

Canonical release detail: [CMI v0.14.1 Public Release](V0_14_1_RELEASE.md).

The historical preparation checkpoint remains at [CMI v0.14.1 Release Candidate](V0_14_1_RELEASE_CANDIDATE.md).

## v0.14.1 hotfix scope

- Registry fallback now uses non-interactive exact-version npm execution instead of the prior non-bootstrapable `--no` form.
- Generated Codex MCP configuration binds both its working directory and `CMI_PROJECT_ROOT` to the resolved activated repository root.
- Exact-local CMI package behavior remains preferred when a valid project-local package exists.
- Activation records the root-bound integration portability limit and must be rerun after moving or cloning a project to another path.
- Regression coverage preserves fallback arguments, project-root binding, exact-local behavior, write opt-in, and activation idempotence.
- Public onboarding now uses the actual CLI contract: change into the intended project root first, run `cmi activate`, and use an explicit `--package=codex-memory-intelligence@<version>` spec for one-off npm execution rather than bare `npx cmi`.

## Field evidence boundary

The v0.14.1 defect was reproduced on one real consumer project:

1. package bootstrap failed when the local/cached package was absent;
2. after bootstrap correction, lifecycle tools became visible;
3. Session start then failed because the MCP process resolved the project root as `/`;
4. explicit root binding allowed Ambient brief, Session start, observation, finalization, durable project-local Session evidence, and Closing Intelligence to complete.

This is concrete evidence for the bounded integration defects and fixes. It does **not** establish universal Codex compatibility, complete runtime portability across clients, or productivity improvement.

## Broader v0.14 capability line

The current product line also retains the v0.14.0 feature tranche:

- proactive repository-local agent workflow guidance with constraint-first discovery, ephemeral `.agent/todo.md`, bounded failure recovery, proportional verification, and evidence-separated reporting;
- CMI Provenance Mark v1 with durable-session-backed and degraded operating-contract-only forms;
- bounded CMI ownership of managed sections in `AGENTS.md`, `.codex/config.toml`, and `.gitignore`;
- exact-local consumer runtime binding when valid local package evidence exists;
- Portable Evidence v2/v3 compatibility with v3 current writers and fail-closed future schemas;
- seven-repository pinned engineering corpus across JavaScript/TypeScript, Python, Go, Rust, and PHP source trees;
- Windows MCP cleanup and package-bin validation hardening;
- Operational Trust through additive `cmi-trust` pre-share checks;
- eight packaged open-format Agent Skills, without claiming runtime auto-installation or automatic selection.

## Evidence and trust limits

- Real-corpus validation is engineering portability evidence on pinned source trees, not proof of target-repository application correctness, language-complete parsing, or universal agent compatibility.
- Existing product-value studies remain descriptive; they do not establish answer-quality superiority, productivity improvement, or causal time savings.
- No pair becomes `productValueEligible` without the required blinded externally-verified human review under the current evaluation contract.
- The Provenance Mark records workflow participation/evidence provenance only; it is not authorship, authentication, signing, approval, certification, or verification by CMI.
- Portable Evidence digests provide integrity checks, not creator authentication, source authorship, or backup authenticity.
- `cmi-trust` remains a conservative pre-share guard, not DLP, malware scanning, authentication, signature verification, or proof that content is safe to disclose.
- Evidence Contract v2 remains simulation-only; production discovery/negotiation remains **NO-GO / NOT EXPOSED**.
- CodeQL is supporting security evidence, not complete security certification.
- Publication and test evidence do not establish v1 readiness.

## Historical release line

`v0.14.0` is now historical. It remains available for provenance and reproducibility but is no longer the supported security line because `v0.14.1` contains the later Codex activation hotfix.

Canonical historical detail: [CMI v0.14.0 Public Release](V0_14_0_RELEASE.md).

For installation and source downloads, new users should use the latest supported release:

https://github.com/lenhonbp/codex-memory-intelligence/releases/latest

See [Release & Version Policy](RELEASE_POLICY.md), [Security](../SECURITY.md), [README](../README.md), and [Changelog](../CHANGELOG.md) for current support and setup guidance.

## Product capability status

The current CMI product line includes:

- local-first reviewed durable project memory with lifecycle/freshness provenance;
- dependency, impact, boundary, and pre-change advisory intelligence;
- Change Intelligence BEFORE → DURING → AFTER records;
- Session Continuation Intelligence, durable handoff state, and persistent findings;
- Codex/generic activation integration with proactive repository-local workflow guidance;
- Ambient and Closing Intelligence;
- Evidence-Anchored Rule Intelligence;
- all eight planned Agent Skill open-format adapters shipped in the npm package;
- MCP integration with durable project writes disabled by default unless the integration explicitly enables the write lifecycle;
- exact-local consumer runtime binding when valid local package evidence exists;
- exact-version registry fallback plus root-bound Codex MCP activation in v0.14.1;
- bounded activation-managed ownership in AGENTS/config/ignore integration sections;
- CMI Provenance Mark v1 with durable-evidence-backed and degraded forms;
- Portable Evidence v3 writer integrity coverage with released v2 compatibility boundaries;
- Operational Trust through additive `cmi-trust` pre-share checks;
- maintainer/evaluator-side real-corpus and paired-study evidence tooling;
- no npm auto-activation, automatic runtime Skill installation, CMI-native Skill loader, or production Evidence Contract negotiation surface.

## Governance / current state

| Item | State |
|---|---|
| Current supported public release | **v0.14.1** |
| Operational Trust / `cmi-trust` | **PUBLIC** |
| Proactive consumer workflow | **PUBLIC / ACTIVATION CONTRACT** |
| Codex bootstrap + root binding hotfix | **PUBLIC / v0.14.1** |
| Provenance Mark v1 | **PUBLIC / WORKFLOW EVIDENCE PROVENANCE** |
| Exact-local consumer runtime binding | **PUBLIC / FAIL-CLOSED WHEN LOCAL CANDIDATE IS UNSAFE** |
| Real-repository engineering validation | **PUBLIC / ENGINEERING EVIDENCE** |
| Product Value Regression workflow | **PUBLIC / ENGINEERING DIAGNOSTIC** |
| Product-value eligible pilot pairs | **0 — externally-verified blinded human review not present** |
| Production Evidence Contract discovery/negotiation | **NO-GO / NOT EXPOSED** |
| v0.14.1 publish pipeline | **PASS** |
| v1 readiness | **NO-GO — roadmap evidence criteria remain** |

```text
CMI_PUBLIC_RELEASE = v0.14.1
CMI_SUPPORTED_RELEASE = v0.14.1
CMI_MODE = MAINTENANCE_WITH_BOUNDED_PRODUCT_EVIDENCE
PLANNED_SKILLS = 8/8
PRODUCTION_CONTRACT_SURFACE = NO_GO
PRODUCT_VALUE_ELIGIBLE_PAIRS = 0
PRODUCTIVITY_CLAIM = NOT_ESTABLISHED
V1_READINESS = NO_GO
```

## Historical release policy

Historical tags and releases are retained for provenance, reproducibility, exact licensing history, and regression evidence. They are not recommended for new installations and are not represented as containing all current fixes or security hardening.

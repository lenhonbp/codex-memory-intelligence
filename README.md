# Codex Memory Intelligence (CMI)

[![CI](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/ci.yml/badge.svg)](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/ci.yml)
[![CodeQL](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/codeql.yml/badge.svg)](https://github.com/lenhonbp/codex-memory-intelligence/actions/workflows/codeql.yml)
[![npm version](https://img.shields.io/npm/v/codex-memory-intelligence.svg)](https://www.npmjs.com/package/codex-memory-intelligence)
[![npm downloads](https://img.shields.io/npm/dm/codex-memory-intelligence.svg)](https://www.npmjs.com/package/codex-memory-intelligence)
[![License: PolyForm Perimeter 1.0.1](https://img.shields.io/badge/License-PolyForm%20Perimeter%201.0.1-orange.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-green.svg)](package.json)

CMI is a **local-first project memory and evidence-driven intelligence layer for AI coding agents**. It helps an agent continue long-running work with durable project context while keeping observed evidence, reviewed knowledge, and advisory inference separate.

CMI stores human-reviewable project intelligence under `.codex-memory/` and does not require a cloud service, API key, database, telemetry service, remote model, or network-enrichment dependency.

> Codex Memory Intelligence is an independent **source-available** project and is not affiliated with or endorsed by OpenAI.

## What CMI provides

- **Durable project memory** — reviewed facts, decisions, mistakes, lifecycle state, freshness, and provenance.
- **Dependency and impact intelligence** — bounded project graph, workspaces, inferred boundaries, and advisory impact analysis.
- **Pre-change intelligence** — Git baseline, relevant memory, likely scope, risk, and verification suggestions.
- **Change Intelligence** — BEFORE → DURING → AFTER records that preserve predicted scope, observed changes, outcomes, and supplied verification evidence.
- **Session Continuation Intelligence** — durable accomplishments, blockers, findings, next actions, and handoff state across agent sessions.
- **Ambient + Closing Intelligence** — agent-facing project guidance and bounded end-of-session signals when the runtime follows the integration contract.
- **Portable Agent Skills** — eight open-format Skill artifacts shipped under `skills/`.
- **MCP integration** — read-only by default, with explicit opt-in for durable project writes.
- **Operational Trust** — additive `cmi-trust` pre-share checks for generated-state policy and obvious accidental credentials.

CMI intentionally treats **evidence as evidence**: a warning is not automatically a product blocker, historical correlation is not causality, and inference is never automatically promoted into durable project truth.

## Get CMI

**Current supported release: `v0.13.0` / `codex-memory-intelligence@0.13.0`.**

For new installations, use the current npm package:

```bash
npm install -g codex-memory-intelligence
cmi --version
```

Or install it in one project:

```bash
npm install --save-dev codex-memory-intelligence
npx cmi --version
```

Requires **Node.js 22 or newer**.

If you prefer a GitHub source archive, use **[Download the latest release](https://github.com/lenhonbp/codex-memory-intelligence/releases/latest)**. New users should use the latest supported release rather than a historical tag.

Historical releases are retained for provenance and reproducibility, but they are **not recommended for new installations and are not the currently supported security line**. They may not include later fixes, hardening, compatibility improvements, or current licensing terms. See [Release & Version Policy](docs/RELEASE_POLICY.md), [Security](SECURITY.md), and [Changelog](CHANGELOG.md).

## Try CMI and share field feedback

CMI is being evaluated on real repositories, not only scripted examples. If you try it, the most useful feedback is concrete and evidence-based:

- **What was useful?** Which memory, impact, change/session, handoff, or closing signals helped?
- **What felt noisy or misleading?** Repeated warnings, false positives, stale context, or unclear severity are especially useful to report.
- **What is missing?** Describe what you expected CMI to preserve, detect, or explain but it did not.

Use the [CMI field feedback issue template](https://github.com/lenhonbp/codex-memory-intelligence/issues/new?template=field_feedback.yml). Please remove secrets, private source code, tokens, or sensitive `.codex-memory/` content before posting.

## Maintenance and governance

CMI is actively maintained by **Nhơn Lê ([@lenhonbp](https://github.com/lenhonbp))**, the project owner and primary maintainer. Release approval, security coordination, compatibility decisions, and community moderation are documented in [Maintainers](MAINTAINERS.md) and [Governance](GOVERNANCE.md).

Public maintenance evidence is kept reviewable through [Current Release Status](docs/RELEASE_STATUS.md), [Security](SECURITY.md), [Changelog](CHANGELOG.md), and GitHub pull requests/releases. Adoption signals should be interpreted from live public sources such as GitHub and npm rather than frozen claims in this README.

## Quick start

Initialize and scan a project:

```bash
cmi init
cmi scan
cmi doctor
```

Add reviewed durable knowledge explicitly:

```bash
cmi remember fact "Production runs on the documented hosting platform"
cmi remember decision "Schema changes must use versioned migrations" --source package.json
```

Ask for bounded project intelligence:

```bash
cmi context "change the account migration"
cmi prepare "change the account migration"
cmi impact migrate
```

A second unchanged `cmi scan` can reuse previously parsed source nodes. Use `cmi scan --full` when you intentionally need a full rebuild after parser or configuration changes.

## Agent integration

### Codex

For the supported Codex project integration, activate once:

```bash
npx cmi activate
```

Then start a **new Codex run/session** and use normal prompts. CMI manages a bounded `AGENTS.md` block and project-scoped Codex MCP configuration without overwriting unrelated user content.

Activation configures project integration only. It does **not** install Skills into runtime Skill directories.

See [Ambient Agent Intelligence](docs/AMBIENT_AGENT_INTELLIGENCE.md), [Closing Intelligence](docs/CLOSING_INTELLIGENCE.md), and [Skills](docs/SKILLS.md).

### Other coding agents

CMI's core CLI, durable evidence model, portable Skills, and MCP interface are not tied to one model. Agent-specific instruction loading, folder trust, Skill discovery, Skill placement, and automatic selection remain runtime responsibilities outside CMI.

Observed field validation and its limits are recorded separately from the current-product README. See [Current Release Status](docs/RELEASE_STATUS.md) and [Real-Repository Evaluation](docs/EVALUATION.md).

## How the evidence model fits together

### Durable memory

Reviewed lifecycle states are `active`, `deprecated`, `rejected`, and `superseded`. Active knowledge can separately become stale or require review when its source/project evidence changes.

```bash
cmi memory-state <id> deprecated --reason "Policy was replaced" --changed-by reviewer
cmi search "retry policy" --stale-policy demote
cmi refresh-memory <id>
```

Refreshing fingerprints does not replace semantic review. Durable truth still requires an explicit reviewed write.

See [Durable Memory Lifecycle](docs/MEMORY_LIFECYCLE.md).

### Change Intelligence

A Change record follows the coding lifecycle:

```text
BEFORE  understand + predict + retrieve relevant history
DURING  observe meaningful changed scope
AFTER   record outcome + supplied verification evidence + unexpected impact
```

Typical flow:

```bash
cmi change start "add retry-safe payment processing"
cmi change observe <id>
cmi change complete <id> --outcome succeeded --verify "npm test=passed"
```

**Session completion is independent from Change completion.** If implementation is intentionally partial, paused, or awaiting review, keep the Change active and close only the session. The handoff carries unfinished work under `activeChanges`. An explicit `abandoned` outcome is terminal.

See [Change Intelligence](docs/CHANGE_INTELLIGENCE.md).

### Session continuation

Sessions can represent implementation, debugging, audit, review, verification, research, or no-code investigation.

```bash
cmi session start "investigate authentication retries"
cmi session observe latest --accomplished "Mapped retry flow" --question "Who owns retries?"
cmi session close latest --blocker "Worker retry ownership is unresolved"
cmi session handoff latest
```

CMI preserves unresolved blockers/findings and evidence-linked next actions so a later agent can continue from durable state instead of asking the user to reconstruct known project context.

See [Session Continuation Intelligence](docs/SESSION_INTELLIGENCE.md).

## Agent Skills

The npm package ships all eight planned open-format Skill artifacts:

```text
skills/<skill-name>/SKILL.md
```

Shipping a Skill is not the same as installing or activating it in an agent runtime:

- npm installation does **not** auto-activate Skills;
- `cmi activate` does **not** install Skills;
- CMI has **no native Skill loader**;
- runtime placement, discovery, and automatic selection remain external to CMI.

See [Skills](docs/SKILLS.md).

## MCP

Generate the safe default MCP configuration:

```bash
cmi mcp-config
```

Enable durable project writes explicitly:

```bash
cmi mcp-config --write
```

Bulk memory refresh requires a second opt-in:

```bash
cmi mcp-config --write --bulk-refresh
```

The MCP interface does not authorize CMI to execute arbitrary project commands. Tests, builds, migrations, profilers, and other verification remain the responsibility of the agent/user environment.

See [MCP Integration](docs/MCP.md).

## Operational Trust

Before sharing CMI state or one exported evidence file, use the additive read-only trust gate:

```bash
cmi-trust doctor .
cmi-trust export <file>
```

Operational Trust checks the generated/transient Git-sharing policy and performs bounded credential-like-content scanning. It is conservative and fail-closed, but it is not DLP, malware scanning, authentication, or proof that content is safe to disclose.

See [Operational Trust](docs/OPERATIONAL_TRUST.md).

## Common commands

```text
cmi init [path]
cmi scan [path] [--full] [--json]
cmi doctor [path] [--json]
cmi status [path] [--json]
cmi baseline [path] [--json]
cmi workspaces [path] [--json]
cmi search <query> ...
cmi context <query> ...
cmi prepare <change-goal> ...
cmi impact <file-or-symbol> ...
cmi change start|observe|complete|show|list|history ...
cmi session start|observe|status|close|show|list|handoff ...
cmi finding list|show|state ...
cmi evaluate capture|review|list|show|report|export|import ...
cmi provenance [--json]
cmi evidence freeze|inspect|restore|rebind ...
cmi mcp-config [--write] [--bulk-refresh]
cmi activate
cmi --version
cmi-trust doctor [path] [--json]
cmi-trust export <file> [--json]
```

Use `cmi --help` and command-specific help for the complete current CLI surface.

## Monorepos and ignore rules

CMI detects npm/pnpm workspaces, Cargo workspace members, and Go workspaces/modules. Workspace-aware context and impact commands can scope results to a specific member.

A root `.cmiignore` uses gitignore-style patterns for project-intelligence scanning. Built-in dependency/generated paths and symbolic links cannot be re-included; hidden paths such as `.env` are excluded by default, while root `.github/` and `.cmiignore` remain visible where required by CMI's repository-intelligence rules.

See [Ignore Semantics](docs/IGNORE.md).

## Evidence limits

CMI is deliberately conservative about what it claims:

- inference is advisory and is never automatically promoted into reviewed durable project truth;
- static parsing, impact, and inferred boundaries are best-effort rather than compiler-grade;
- historical co-change and verification patterns are correlation, not causality;
- an observed changed path is not proof of complete runtime impact;
- agent clients may ignore project or MCP guidance;
- package shipment does not prove runtime Skill discovery or automatic Skill selection;
- current field evidence does not imply universal agent compatibility;
- no productivity-improvement, time-savings, statistical-sufficiency, causal-effectiveness, or v1-readiness claim is made from the current evidence.

See [Evidence Integrity](docs/EVIDENCE_INTEGRITY.md), [Real-Repository Evaluation](docs/EVALUATION.md), and [Current Release Status](docs/RELEASE_STATUS.md).

## Security model

CMI is local-first, but repository content and durable memory remain untrusted input for connected agents.

Key boundaries include:

- project scanning does not follow symbolic links;
- unsafe/symlinked durable storage targets are rejected where supported;
- hidden and common generated/dependency paths are excluded by default;
- MCP durable project writes are disabled by default;
- bulk memory refresh requires separate opt-in;
- CMI-internal paths are excluded from observed product/session change scope;
- user-supplied durable text receives best-effort secret-pattern checks, but CMI is not DLP or a complete secret scanner.

Review `.codex-memory/` before publishing it.

See [Security](SECURITY.md), [Evidence Integrity](docs/EVIDENCE_INTEGRITY.md), and [Operational Trust](docs/OPERATIONAL_TRUST.md).

## Release and version policy

CMI has one recommended public installation path: **the latest supported release**.

- **Latest release:** [GitHub latest release](https://github.com/lenhonbp/codex-memory-intelligence/releases/latest)
- **npm:** `npm install -g codex-memory-intelligence`
- **Security support:** current supported release only unless explicitly documented otherwise.
- **Historical releases:** retained for provenance/reproducibility; not recommended for new installs and not promised current security fixes.

GitHub may continue to expose source archives for historical tags. Their availability does not make them the recommended or supported version.

See [Release & Version Policy](docs/RELEASE_POLICY.md), [Security](SECURITY.md), and [Changelog](CHANGELOG.md).

## Documentation

### Product and integration

- [Architecture](docs/ARCHITECTURE.md)
- [Ambient Agent Intelligence](docs/AMBIENT_AGENT_INTELLIGENCE.md)
- [Closing Intelligence](docs/CLOSING_INTELLIGENCE.md)
- [Change Intelligence](docs/CHANGE_INTELLIGENCE.md)
- [Session Continuation Intelligence](docs/SESSION_INTELLIGENCE.md)
- [Durable Memory Lifecycle](docs/MEMORY_LIFECYCLE.md)
- [MCP Integration](docs/MCP.md)
- [Skills](docs/SKILLS.md)
- [Operational Trust](docs/OPERATIONAL_TRUST.md)
- [Evidence Integrity](docs/EVIDENCE_INTEGRITY.md)
- [Ignore Semantics](docs/IGNORE.md)

### Release, evaluation, and project history

- [Release & Version Policy](docs/RELEASE_POLICY.md)
- [Current Release Status](docs/RELEASE_STATUS.md)
- [Real-Repository Evaluation](docs/EVALUATION.md)
- [Real Corpus Validation](docs/REAL_CORPUS_VALIDATION.md)
- [Product Value Regression](docs/PRODUCT_VALUE_REGRESSION.md)
- [Changelog](CHANGELOG.md)
- [Roadmap](ROADMAP.md)
- [Releasing](docs/RELEASING.md)

### Policy

- [Licensing](LICENSING.md)
- [Project Identity & Brand Policy](BRAND_POLICY.md)
- [Security](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Governance](GOVERNANCE.md)
- [Support](SUPPORT.md)
- [Maintainers](MAINTAINERS.md)

## Development

```bash
npm run verify
npm run benchmark:smoke
npm run package:smoke
```

CI runs on Ubuntu, macOS, and Windows with Node.js 22 and 24. A separate benchmark smoke job checks incremental reuse and release metadata. CodeQL scans JavaScript and GitHub Actions workflows.

## License

Repository source after the 2026-08-11 licensing cutover is available under the **PolyForm Perimeter License 1.0.1**. It permits use, modification, and distribution for permitted purposes, while restricting the provision of products that compete with the software as defined by the license.

Current post-cutover CMI source is **source-available, not OSI open source**.

`v0.11.0` and earlier public releases retain the MIT license that accompanied those versions. Separate commercial licensing may be available for uses outside the public license.

See [LICENSE](LICENSE), [LICENSING.md](LICENSING.md), [NOTICE](NOTICE), and [BRAND_POLICY.md](BRAND_POLICY.md).

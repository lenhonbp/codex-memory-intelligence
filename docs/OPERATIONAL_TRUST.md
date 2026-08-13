# Operational Trust

CMI separates **evidence health** from **sharing trust**.

`cmi doctor` answers whether CMI's local evidence can currently be used. The operational-trust gate answers a narrower but different question:

> Is the CMI state or export I am about to share free of known generated-state policy violations and obvious accidental credentials?

The gate is intentionally conservative. It is not a DLP system, malware scanner, authentication mechanism, or proof that a file is safe for public disclosure.

## Commands

The package ships an additional read-only binary:

```bash
cmi-trust doctor [path]
cmi-trust doctor [path] --json
cmi-trust export <file>
cmi-trust export <file> --json
```

`cmi` remains mapped to `src/cli-entry.js`; the operational-trust binary is additive and does not replace the established CLI/MCP/local-fallback contract.

### `cmi-trust doctor`

The doctor gate combines two independent checks:

1. Git-sharing policy for `.codex-memory/`.
2. A bounded credential-like-content scan over share-candidate CMI state.

A clean result has:

```text
state: healthy
readyToShare: true
```

The command exits non-zero for blocked, degraded, or uninitialized trust state. That makes it usable as a pre-share or pre-publication gate without silently upgrading uncertainty into a clean attestation.

### `cmi-trust export`

This command scans one bounded stable UTF-8 regular file before it is uploaded or otherwise shared.

It fails closed when the candidate is:

- credential-like;
- binary/non-UTF-8;
- oversized;
- unstable while being read;
- a symlink or non-regular file.

The report never includes the suspected credential value; it reports only a path/name, code, and bounded explanation.

## `.codex-memory` Git policy

CMI does **not** impose either extreme policy:

- it does not say all `.codex-memory/` must be committed;
- it does not say all `.codex-memory/` must remain local-only.

Durable, reviewed project evidence may be intentionally shared so context can follow the project. Generated and transient state must remain untracked.

The current generated/transient denylist is:

```text
.codex-memory/project-graph.json
.codex-memory/project-index.json
.codex-memory/snapshots/**
*.lock / *.tmp / *.bak inside .codex-memory
```

`cmi init` already creates the internal ignore rules:

```gitignore
project-graph.json
project-index.json
snapshots/
```

Operational Trust verifies that these rules still exist and that generated/transient paths are not already tracked by Git.

Other durable records are **not automatically declared public-safe**. They remain subject to review and the secret scan. This includes memory, decisions, mistakes, architecture summaries, sessions, findings, evaluations, change records, configuration, and portable provenance when those files exist.

## Secret scanning

CMI already rejects many credential-like values at normal durable-write boundaries, and Portable Evidence freeze has its own secret preflight. Operational Trust adds a second defensive layer for manually edited, historical, imported, or otherwise externally produced CMI state.

The scanner is bounded:

- at most 2,000 share-candidate files;
- at most 1 MB per scanned CMI file;
- at most 32 MB total CMI text;
- at most 16 MB for a standalone export candidate.

Generated graph/index and snapshot state are skipped by the share-candidate secret scan because Git policy already requires them to remain untracked.

If a candidate exceeds a scan limit or cannot be stably read as UTF-8 text, the result is degraded/blocked rather than silently clean.

The detector remains best-effort accidental-secret detection only. False positives and false negatives are possible.

## Structured explainability

Trust findings use stable codes and never require a user to infer the cause from a generic failure string. Current codes include:

- `CMI_TRUST_SENSITIVE_CONTENT`
- `CMI_TRUST_UNSAFE_ENTRY`
- `CMI_TRUST_STORAGE_UNSAFE`
- `CMI_TRUST_SCAN_LIMIT`
- `CMI_TRUST_OVERSIZED_FILE`
- `CMI_TRUST_UNSCANNABLE_FILE`
- `CMI_TRUST_EXPORT_SENSITIVE_CONTENT`
- `CMI_TRUST_EXPORT_UNSCANNABLE`

The doctor report also separates:

- sharing-policy state;
- Git availability;
- tracked-file count;
- generated paths that are tracked;
- ignore-policy completeness;
- secret-scan completeness;
- scanned file/byte counts;
- bounded remediation recommendations.

## Recommended workflow

Before intentionally committing or publishing CMI state:

```bash
cmi doctor
cmi-trust doctor .
git diff -- .codex-memory
```

Review durable changes before staging them. Do not automatically run a blanket `git add .codex-memory` or delete tracked state solely because a tool reports a warning.

Before uploading an exported evaluation/report or another evidence artifact:

```bash
cmi-trust export ./path/to/report.json
```

If a real credential is found, remove it from the artifact/state and rotate or revoke the credential if exposure may already have occurred.

## Trust boundary

A clean operational-trust result means only:

- no generated/transient tracked-path violation was observed within the policy;
- required internal ignore rules were present;
- the bounded best-effort text scan found no credential-like content;
- the relevant files could be completely scanned within configured limits.

It does **not** prove that:

- every sensitive business datum is absent;
- a repository is suitable for publication;
- a reviewer has approved the content;
- portable evidence is authenticated;
- the source author is trusted;
- a dependency or source tree is secure.

Operational Trust is a pre-share guardrail, not a replacement for human review or dedicated security tooling.

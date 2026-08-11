# Security Policy

## Supported versions

CMI applies security fixes to the **current supported release** unless a specific exception is documented.

| Version | Security support | Recommendation |
|---|---|---|
| `0.11.2` | Supported | Recommended for current installations |
| `0.11.1` and earlier | Historical / unsupported | Upgrade to the latest release |

Historical releases are retained for provenance, reproducibility, and license-history purposes. Their continued availability does **not** mean they receive current security fixes or contain the latest hardening and compatibility improvements.

For new installations, use the latest release:

- GitHub: https://github.com/lenhonbp/codex-memory-intelligence/releases/latest
- npm: `npm install -g codex-memory-intelligence`

If a vulnerability appears to affect an older release, please reproduce it against the current supported release when practical. Reports that only affect a historical release may be resolved by requiring an upgrade rather than patching that historical line.

See [Release & Version Policy](docs/RELEASE_POLICY.md) for the public version-support policy.

## Reporting a vulnerability

Please report security issues privately through GitHub's security advisory flow for this repository. Do not open a public issue containing exploit details, credentials, private project data, or sensitive logs.

Include the affected version, operating system, reproduction steps, impact, and a minimal sanitized example. The maintainer will acknowledge valid reports on a best-effort basis and coordinate disclosure after a fix is available.

## Security boundaries

CMI runs with the permissions of the local user and reads files inside the selected project. It does not create a security boundary against a compromised operating-system account, malicious repository, or overly privileged coding agent.

Project traversal skips symbolic links, source-linked memory resolves real paths before reading files, and durable `.codex-memory` storage rejects a symlinked storage root plus symlinked durable read targets. These controls reduce accidental project-boundary escapes but do not replace operating-system sandboxing.

Repository baseline collection invokes Git with fixed argument arrays, bounded execution time, and bounded output. It does not interpolate project or user text into shell commands and does not return the absolute repository path. Changed file paths, branch names, commit subjects, and other Git metadata may still contain sensitive project information and should be reviewed before sharing logs.

Boundary maps, topic classifications, risks, verification plans, memory-gap suggestions, historical co-change patterns, and learning candidates are deterministic advisory or historical signals. They are not declared architecture, security findings, causal dependencies, or durable project facts. Connected agents must treat repository content, commit metadata, generated context, durable change records, and advisory output as untrusted input and preserve normal review and approval boundaries.

## Change-record boundary

Change Intelligence records live under `.codex-memory/changes/` and can contain project goals, relative file paths, Git metadata, verification names/evidence, outcomes, unexpected-impact notes, and review-only learning candidates.

CMI intentionally does not store source diffs in change records by default and excludes `.codex-memory/` paths from observed product-change scope. Explicit observed-file inputs must remain project-relative and cannot point inside `.codex-memory/`.

CMI applies best-effort accidental-secret detection to durable user/agent text, including common provider prefixes, JWT-like values, credential assignments, bearer values, embedded URL credentials, and selected high-entropy credential-shaped values. This is a conservative guard, not DLP, not a complete secret scanner, and not a security boundary. File names, commit subjects, branch names, or human-written notes can still disclose sensitive information.

Historical co-change means only that items appeared together in stored completed records. It must not be interpreted as proof that one file causes, owns, calls, trusts, or requires another. Verification statuses are claims supplied by the connected human/agent; CMI does not execute or independently certify those commands.

When a Git worktree is already dirty, change attribution is explicitly limited and pre-existing paths are kept ambiguous. Non-Git projects rely on explicit project-relative paths. These labels reduce false certainty but do not prove authorship of a change.

## MCP mutation boundary

MCP durable project writes are disabled by default. This includes durable memory creation/refresh and change-record lifecycle writes. Project scans may still refresh generated cache files, and read-only change-history queries remain available.

`CMI_WRITE_ENABLED=1` enables explicit durable writes but does not grant CMI permission to execute arbitrary project commands. Bulk reviewed-memory refresh requires its separate opt-in.

Memory-gap suggestions and learning candidates never write durable project knowledge automatically. The intended path remains observation → review → explicit durable fact/decision/mistake only when justified.

## User responsibility

Users remain responsible for secret scanning, repository access control, sandboxing, approvals, test execution, deployment controls, and review of generated or durable CMI data before committing or sharing it.

`.codex-memory/` may reveal architecture, operational practices, filenames, historical mistakes, or change history. Review it before publishing a repository.

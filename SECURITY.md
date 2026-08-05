# Security Policy

## Supported versions

Security fixes are applied to the latest minor release. Older pre-1.0 releases may require upgrading to receive a fix.

## Reporting a vulnerability

Please report security issues privately through GitHub's security advisory flow for this repository. Do not open a public issue containing exploit details, credentials, private project data, or sensitive logs.

Include the affected version, operating system, reproduction steps, impact, and a minimal sanitized example. The maintainer will acknowledge valid reports on a best-effort basis and coordinate disclosure after a fix is available.

## Security boundaries

CMI runs with the permissions of the local user and reads files inside the selected project. It does not create a security boundary against a compromised operating-system account, malicious repository, or overly privileged coding agent.

Project traversal skips symbolic links, and source-linked memory resolves real paths before reading files. These controls reduce accidental project-boundary escapes but do not replace operating-system sandboxing.

MCP write tools are disabled by default. The credential guard is intentionally conservative and incomplete. Users remain responsible for secret scanning, repository access control, sandboxing, approvals, and review of generated memory before committing it.

Generated `.codex-memory/` files may reveal architecture, operational practices, filenames, or historical mistakes. Review them before publishing a repository.

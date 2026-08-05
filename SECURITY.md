# Security Policy

## Reporting a vulnerability

Please report security issues privately through GitHub's security advisory flow for this repository. Do not open a public issue containing exploit details, credentials, private project data, or sensitive logs.

## Security boundaries

CMI runs with the permissions of the local user and reads files inside the selected project. It does not create a security boundary against a compromised operating-system account, malicious repository, or overly privileged coding agent.

The credential guard is intentionally conservative and incomplete. Users remain responsible for secret scanning, repository access control, sandboxing, agent approvals, and review of generated memory before committing it.

Generated `.codex-memory/` files may reveal architecture, operational practices, filenames, or historical mistakes. Review them before publishing a repository.

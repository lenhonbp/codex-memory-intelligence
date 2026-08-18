# Project Architecture

Index: `5580036f7e04`

## Detected stack
- Node.js

## Workspaces
- **codex-memory-intelligence** · node · `.` · package.json

## Languages and formats
- JavaScript: 128 files, 1345516 bytes
- Markdown: 67 files, 491910 bytes
- JSON: 38 files, 94964 bytes
- YAML: 8 files, 15085 bytes
- Other: 2 files, 5982 bytes

## Repository shape
- `tests`: 109 files
- `docs`: 42 files
- `src`: 41 files
- `schemas`: 10 files
- `.github`: 9 files
- `skills`: 8 files
- `scripts`: 7 files
- `AGENTS.md`: 1 files
- `BRAND_POLICY.md`: 1 files
- `CHANGELOG.md`: 1 files
- `CODE_OF_CONDUCT.md`: 1 files
- `CONTRIBUTING.md`: 1 files
- `GOVERNANCE.md`: 1 files
- `LICENSE`: 1 files
- `LICENSING.md`: 1 files
- `MAINTAINERS.md`: 1 files
- `NOTICE`: 1 files
- `README.md`: 1 files
- `ROADMAP.md`: 1 files
- `SECURITY.md`: 1 files

## Likely entry points
- `src/cli.js`

## Important configuration and guidance
- `.github/workflows/ci.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/operational-trust.yml`
- `.github/workflows/publish.yml`
- `.github/workflows/real-corpus.yml`
- `AGENTS.md`
- `README.md`
- `package.json`
- `tests/fixtures/evidence-contract/README.md`

## Graph intelligence
- Source files analyzed: 128
- Local import edges: 282
- Cross-workspace edges: 0
- Symbols indexed: 4393
- External dependencies observed: 13
- Non-code local dependencies observed: 0
- Unresolved local imports: 0

### Shared or high-impact files
- `src/core.js`: 55 dependents, 12 local imports, 93 symbols, workspace node:.
- `src/session-intelligence.js`: 23 dependents, 11 local imports, 205 symbols, workspace node:.
- `src/search.js`: 16 dependents, 5 local imports, 101 symbols, workspace node:.
- `src/change-intelligence.js`: 15 dependents, 6 local imports, 191 symbols, workspace node:.
- `src/stale.js`: 14 dependents, 5 local imports, 90 symbols, workspace node:.
- `src/graph.js`: 13 dependents, 5 local imports, 194 symbols, workspace node:.
- `src/storage.js`: 13 dependents, 0 local imports, 45 symbols, workspace node:.
- `src/version.js`: 12 dependents, 0 local imports, 3 symbols, workspace node:.
- `src/advisor.js`: 9 dependents, 2 local imports, 127 symbols, workspace node:.
- `src/portable-evidence.js`: 8 dependents, 9 local imports, 177 symbols, workspace node:.

## Ignore and safety summary
- Ignored entries: 4
- Symbolic links skipped: 0
- Oversized files skipped: 0
- Unreadable entries skipped: 0
- Custom ignore rules: 0

## Agent operating context
- Indexed files: 243
- Indexed bytes: 1953457
- Search durable knowledge with `cmi search "query"`.
- Scope monorepo retrieval with `cmi context "query" --workspace name-or-path`.
- Check affected files and workspaces with `cmi impact "file-or-symbol"`.
- Explain exclusions with `cmi explain-ignore path`.
- Update this index after dependencies, folders, entry points, or shared APIs change.

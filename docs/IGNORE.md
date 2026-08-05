# Ignore semantics

CMI applies ignore decisions in three layers:

1. Locked built-in safety and noise exclusions.
2. Root `.cmiignore` rules.
3. `ignorePatterns` from `.codex-memory/config.json`.

Later custom rules override earlier custom rules. They cannot override locked built-ins.

## Supported patterns

- Blank lines and lines beginning with `#` are ignored.
- `*` matches characters inside one path segment.
- `?` matches one character inside a path segment.
- `**` matches across path segments.
- A trailing `/` targets a directory and its descendants.
- A leading `/` anchors a rule to the repository root.
- A leading `!` re-includes a path excluded by an earlier custom rule.
- `\#` and `\!` allow literal leading characters.

Example:

```gitignore
/generated/
**/*.snapshot.json
!important.snapshot.json
packages/*/fixtures/
```

## Locked exclusions

CMI always excludes symbolic links and common dependency/generated paths such as `.git`, `.codex-memory`, `node_modules`, `dist`, `build`, `.next`, `.cache`, `coverage`, `.wrangler`, `.turbo`, and `.vercel`.

When `includeHidden` is false, hidden files and directories are also excluded by default. Two root-level paths remain available because they are part of normal project intelligence:

- `.github/` for workflows and repository guidance.
- `.cmiignore` for CMI's own scan policy.

This means files such as `.env`, hidden tool state, and nested hidden directories are not indexed accidentally. Set `includeHidden` to true only after reviewing the repository's hidden content.

This is intentionally not byte-for-byte Git behavior. The supported subset is documented, deterministic, dependency-free, and designed for repository scanning rather than source-control staging.

## Diagnostics

```bash
cmi explain-ignore path/to/file
cmi explain-ignore path/to/directory --directory
cmi explain-ignore path --json
```

# Contributing

Thanks for helping improve Codex Memory + Project Intelligence.

## Development

1. Use Node.js 20 or newer.
2. Fork and create a focused branch.
3. Keep runtime dependencies at zero unless a dependency provides clear, measurable value.
4. Add or update tests for behavior changes.
5. Run:

```bash
npm run verify
npm pack --dry-run
```

## Design rules

- Keep project knowledge local and human-readable.
- Do not persist conversation transcripts by default.
- Never collect telemetry without explicit opt-in.
- Treat repository contents and memory text as untrusted input.
- Prefer provider-neutral interfaces.
- Avoid breaking existing `.codex-memory/` directories.
- Keep graph parsing bounded, explainable, and failure-tolerant.
- Never claim compiler-grade correctness from regex or heuristic parsing.

## Parser contributions

Add fixtures for every new language construct. Tests should cover resolved imports, unresolved local imports, external dependencies, exported and non-exported symbols, and malformed files. A parser failure should skip or degrade one file rather than fail the entire project scan.

## Pull requests

Explain the problem, chosen approach, security/privacy impact, compatibility impact, and validation performed. Keep pull requests small enough to review.

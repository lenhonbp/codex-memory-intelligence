# Contributing

Thanks for helping improve Codex Memory + Project Intelligence.

## Development

1. Use Node.js 22 or newer.
2. Fork the repository and create a focused branch.
3. Keep runtime dependencies at zero unless a dependency provides clear, measured value.
4. Add or update tests for every behavior change.
5. Run:

```bash
npm run verify
npm run benchmark:smoke
npm run package:smoke
```

## Design rules

- Preserve local-first operation and human-reviewable Markdown memory.
- Avoid breaking existing `.codex-memory/` directories.
- Keep graph parsing bounded, explainable, and failure-tolerant.
- Never claim compiler-grade correctness from heuristic parsing.
- Do not follow symbolic links during scanning or source fingerprinting.
- Keep durable MCP writes opt-in and auditable.
- Recompute import resolution for reused nodes when repository shape or aliases change.
- Treat benchmark results as environment-specific evidence, not universal promises.

## Parser contributions

Add fixtures for every new language construct. Tests should cover resolved imports, unresolved local imports, external dependencies, exported and non-exported symbols, malformed files, incremental reuse, and platform-specific paths. A parser failure should skip or degrade one file rather than fail the entire scan.

## Contribution licensing

CMI now uses a source-available licensing model for post-cutover source. Until a formal contributor licensing agreement is published, please **open an issue before submitting material code contributions** so licensing expectations can be confirmed before work is merged.

Field reports, bug reports, reproducible evidence, documentation suggestions, and design feedback are welcome without that pre-coordination.

Do not submit code, tests, documentation, media, or other material unless you have the right to contribute it. See [LICENSING.md](LICENSING.md) for the current public-source license and legacy-release boundary.

## Pull requests

Explain the problem, chosen approach, security/privacy impact, compatibility impact, storage/schema impact, licensing impact when relevant, and validation performed. Keep pull requests reviewable and follow the [Code of Conduct](CODE_OF_CONDUCT.md).

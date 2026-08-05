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
```

## Design rules

- Keep project knowledge local and human-readable.
- Do not persist conversation transcripts by default.
- Never collect telemetry without explicit opt-in.
- Treat repository contents and memory text as untrusted input.
- Prefer provider-neutral interfaces.
- Avoid breaking existing `.codex-memory/` directories.

## Pull requests

Explain the problem, the chosen approach, security/privacy impact, compatibility impact, and validation performed. Keep pull requests small enough to review.

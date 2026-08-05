# Releasing

## Prerequisites

- The package name is owned on npm.
- npm trusted publishing is configured for `lenhonbp/codex-memory-intelligence` and workflow filename `publish.yml`.
- `main` CI and CodeQL are green.
- The changelog and package version agree.

## Process

1. Update `package.json`, `src/version.js`, changelog, schemas, and docs in a reviewed pull request.
2. Run:

   ```bash
   npm run verify
   npm run benchmark:smoke
   npm run package:smoke
   npm run release:check -- v0.5.0
   ```

3. Merge the release pull request.
4. Create a signed semantic tag such as `v0.5.0` on the reviewed `main` commit.
5. Create and publish the matching GitHub Release.
6. `.github/workflows/publish.yml` checks out the release tag, validates the tag/version pair, reruns tests, benchmark smoke, and package installation smoke, then publishes through npm trusted publishing using GitHub OIDC.
7. Install the published package on a clean machine and run `cmi --version`, `cmi doctor`, and a small project scan.

Do not add a long-lived npm publish token when trusted publishing is available. Provenance is generated automatically by npm for eligible public packages published through trusted publishing.

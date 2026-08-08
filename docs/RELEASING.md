# Releasing

## Prerequisites

- The package name is owned on npm.
- npm Trusted Publishing is configured for `lenhonbp/codex-memory-intelligence`.
- `main` CI and CodeQL are green.
- The changelog, package version, and `src/version.js` agree.
- A reviewed publish workflow has been added only after the npm trusted publisher is configured.

The repository intentionally does not publish merely because a version number exists. Account-level npm ownership and the trusted-publisher relationship must be established first.

Phase 2 is an unreleased readiness pass. It keeps the public/package version at `0.9.2`; it does not create a `v0.10.0` tag, publish a package, or create a GitHub Release.

## First-package bootstrap

The first public package version must be published manually after npm account verification and 2FA are complete. Do not force provenance from a local machine. Provenance requires a supported CI/CD environment and will be generated automatically once Trusted Publishing is configured.

## Process

1. Update `package.json`, `src/version.js`, changelog, schemas, and docs in a reviewed pull request.
2. Run:

   ```bash
   npm run verify
   npm run benchmark:smoke
   npm run package:smoke
   npm run release:check -- v<version>
   ```

3. Merge the release pull request after CI and CodeQL pass.
4. Configure npm Trusted Publishing for the exact repository and reviewed workflow filename.
5. Add and review a minimal tag-triggered publish workflow with `contents: read` and `id-token: write`; do not store a long-lived npm token.
6. Create a signed semantic tag such as `v<version>` on the reviewed `main` commit.
7. Let the trusted workflow revalidate the tag/version pair, tests, benchmark smoke, and packed installation before running `npm publish --access public`.
8. Create and publish the matching GitHub Release.
9. Install the published package on a clean machine and run `cmi --version`, `cmi doctor`, and a small project scan.

## Required workflow properties

The future publishing workflow must:

- trigger only on semantic version tags;
- use GitHub OIDC and npm Trusted Publishing;
- request only `contents: read` and `id-token: write`;
- run `npm run release:check`, `npm run verify`, and `npm run package:smoke` before publication;
- publish from the reviewed tag, not a mutable branch;
- avoid long-lived npm tokens and unreviewed third-party release actions.

Provenance is generated automatically by npm for eligible public packages published through Trusted Publishing.

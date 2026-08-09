# Releasing

This document describes the repository's current release workflow. A release-candidate PR is preparation only; publication is a separate, explicitly authorized operation.

## Current prerequisites

- The package name is owned on npm and the public package is already published.
- npm Trusted Publishing is configured for `lenhonbp/codex-memory-intelligence` and the reviewed `Publish package` workflow.
- The reviewed `main` commit and CodeQL are green.
- `package.json`, `src/version.js`, and the matching changelog section agree.

## Release-candidate preparation

Use a normal feature or release-prep branch and open a draft PR to `main`.

1. Update the package/source version, changelog, and user-facing release documentation.
2. Run the complete local verification set:

   ```bash
   npm run verify
   npm run benchmark:smoke
   npm run package:smoke
   npm run release:check -- v<version>
   ```

3. Inspect the packed tarball in a clean temporary install and verify CLI, MCP, provenance, compatibility, and fail-closed behavior.
4. Wait for the full hosted matrix (Ubuntu/macOS/Windows × Node 22/24), benchmark/release metadata, package smoke, and CodeQL checks.
5. Obtain Tech Lead authorization for the exact reviewed commit.

This preparation flow must not create or push a `release/vX.Y.Z` branch, create a `vX.Y.Z` tag, publish to npm, change dist-tags, or create a GitHub Release.

## Authorized publication

The current `.github/workflows/publish.yml` is live. It runs on pushes to semantic version tags (`v*.*.*`) and on pushes to release branches matching `release/v*.*.*`. Creating or pushing a matching release branch is therefore a live publish trigger; maintainers must do so only after the exact reviewed `main` SHA has been approved.

For an authorized release branch, the workflow:

1. Verifies the branch points exactly at the current `origin/main` SHA, derives the matching semantic tag, and rejects invalid or moved tag conditions.
2. Runs `npm run release:check`, `npm run verify`, `npm run benchmark:smoke`, and `npm run package:smoke` before publication.
3. Creates and pushes the tag when the release branch has no existing matching tag. A tag push also starts the tag-triggered workflow path; concurrency is scoped by ref.
4. Checks whether the exact package version is already on npm, publishes with `npm publish --access public` only when it is absent, and verifies registry visibility.
5. Extracts the matching changelog section, creates the GitHub Release if it does not already exist, and removes the temporary release branch after a successful branch-triggered run.

Tag-triggered runs do not create tags or remove release branches. If the exact package version is already published, the workflow skips the publish step and still verifies the registry and GitHub Release state. A conflicting existing tag fails the guard; an existing GitHub Release is kept unchanged.

## Workflow security properties

- The workflow is guarded to this repository and to semantic tag or authorized release-branch events. The branch path additionally requires the repository owner actor and an exact current-`main` SHA.
- `id-token: write` is explicit for npm Trusted Publishing/OIDC. No long-lived npm token or `NODE_AUTH_TOKEN` is configured.
- `contents: write` is currently required because the workflow may create tags, create GitHub Releases, and delete temporary release branches. It should not be reduced without redesigning those operations and rerunning the full release regression evidence.
- The workflow uses pinned major action lines (`actions/checkout@v6`, `actions/setup-node@v6`, `gh` from the runner) and no unreviewed third-party publish action.
- A non-semantic tag, package/source mismatch, missing changelog section, moved tag, or release-branch SHA mismatch stops before publication.
- The workflow does not make a durable authentication claim about package contents; npm provenance is supplied by the Trusted Publishing path.

## Bootstrap history

The first-package manual/bootstrap instructions are historical and are no longer the primary flow. The package is already public and the current path is the reviewed workflow above. Do not force provenance from a local machine or add a long-lived npm token.

## Post-publication validation

After an authorized workflow succeeds, install the published package in a clean environment and verify `cmi --version`, `cmi doctor`, `cmi provenance`, `cmi --help`, `cmi-mcp`, and a small disposable-project scan. Record the workflow run, package version, GitHub Release, npm state, and any follow-up separately from the release-candidate PR.

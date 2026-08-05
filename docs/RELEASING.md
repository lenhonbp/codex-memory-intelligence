# Releasing

1. Ensure CI and CodeQL are green on `main`.
2. Confirm `package.json`, `CHANGELOG.md`, MCP server version, and CLI version match.
3. Run `npm run verify` and `npm run package:smoke` locally.
4. Create a signed `vX.Y.Z` tag from the reviewed commit.
5. Create GitHub release notes from the changelog.
6. Publish through npm trusted publishing with provenance after the npm package and GitHub environment are configured.
7. Verify a clean-machine installation with `npm install -g codex-memory-intelligence` and `cmi doctor`.

Never publish from an unreviewed working tree or a personal long-lived npm token.

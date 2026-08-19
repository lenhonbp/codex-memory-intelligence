# Release & Version Policy

CMI has one recommended public release line: **the latest supported release**.

## Recommended download and installation

Use the latest GitHub release:

https://github.com/lenhonbp/codex-memory-intelligence/releases/latest

Or install the current npm package explicitly:

```bash
npm install -g codex-memory-intelligence@0.14.1
cmi --version
```

For Codex integration, change into the intended project root before activation:

```bash
cd /absolute/path/to/your-project
cmi activate
cmi doctor
```

`cmi activate` uses the current working directory as the project root. The complete canonical setup, project-local alternative, and one-off npm form are documented in the repository [README](../README.md#get-cmi).

The repository README and security policy should point new users to the latest supported release rather than to an arbitrary historical tag.

## Current supported line

As of 2026-08-19, the supported public release is:

- `v0.14.1`
- npm: `codex-memory-intelligence@0.14.1`

Security fixes and compatibility guidance target the current supported release unless a specific exception is documented.

v0.14.1 is a focused maintenance hotfix over v0.14.0. It fixes two field-reproduced Codex activation failures: non-bootstrapable registry fallback and missing project-root binding for the managed MCP process. The managed Codex MCP configuration now uses an exact-version non-interactive registry fallback when no valid local package exists and binds both its working directory and `CMI_PROJECT_ROOT` to the activated repository root.

The broader v0.14 line includes proactive repository-local consumer workflow, CMI Provenance Mark v1, exact-local consumer activation binding when valid local package evidence exists, bounded activation-managed ownership, published Portable Evidence v2/v3 compatibility policy, expanded real-repository engineering validation, and documented Windows/CodeQL hardening.

These release capabilities do not establish productivity improvement, universal agent effectiveness, authenticated provenance, complete security certification, or v1 readiness.

## Historical releases

Older GitHub releases and tags are retained for:

- provenance and auditability;
- reproducibility of historical results;
- changelog and release-history review;
- preserving the exact licensing terms that accompanied previously published versions.

Historical availability is **not** a recommendation to install or operate those versions. Historical releases may lack later bug fixes, security hardening, compatibility improvements, evidence-model corrections, or current documentation.

Users starting a new installation should not choose a historical tag simply because GitHub still exposes its source archive.

## Security support

Only the current supported release is promised current security attention unless another line is explicitly listed in `SECURITY.md`.

If a report concerns an older release, reproduce it against the latest supported release when practical. A historical-only issue may be handled by requiring an upgrade rather than issuing a patch to that old line.

No statement that a historical release is unsupported should be read as proof that it contains a known exploitable vulnerability. It means that the project does not represent that historical version as containing all current fixes and hardening.

## GitHub source archives

GitHub can continue to expose automatically generated `Source code (zip)` and `Source code (tar.gz)` archives for historical tags. Those archives are part of repository history and are not the project's recommended download path.

Public-facing documentation should therefore link to:

https://github.com/lenhonbp/codex-memory-intelligence/releases/latest

rather than directing new users to the general Releases index when the intent is installation.

## Licensing history

`v0.11.0` and earlier public releases remain under the MIT license shipped with those exact versions.

`v0.11.1` and later public releases, plus repository source after the 2026-08-11 licensing cutover, use the PolyForm Perimeter License 1.0.1, subject to `LICENSE`, `LICENSING.md`, `NOTICE`, and `BRAND_POLICY.md`.

Changing the current license does not retroactively revoke rights already granted under earlier release licenses.

## Release history and evidence

Use these files for historical detail rather than expanding the current-product README with version-by-version narrative:

- `CHANGELOG.md` — version changes;
- `docs/RELEASE_STATUS.md` — current publication/evidence status;
- `docs/V0_14_1_RELEASE.md` — canonical v0.14.1 publication record;
- `docs/V0_14_1_RELEASE_CANDIDATE.md` — historical v0.14.1 pre-publication checkpoint;
- `docs/V0_14_0_RELEASE.md` — canonical v0.14.0 historical publication record;
- `docs/V0_13_0_RELEASE.md` — canonical v0.13.0 historical publication record;
- `docs/V0_12_1_RELEASE.md` — canonical v0.12.1 historical publication record;
- `docs/EVALUATION.md` and `docs/field-evidence/` — bounded evaluation evidence;
- `LICENSING.md` — license transition and commercial-license path;
- `SECURITY.md` — current security-support policy.
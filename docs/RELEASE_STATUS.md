# Current Release Status

Updated: 2026-08-11

## v0.11.0 RELEASE CANDIDATE — NOT YET PUBLISHED

This document describes the **release-preparation** state for candidate `v0.11.0`. It is **not** a claim that `v0.11.0` is the public npm `latest` package yet.

### Candidate summary

| Field | Value |
|-------|--------|
| Candidate version | `0.11.0` |
| Base feature-complete subject | `c05098fa82ddf85a4443e3769801baf78e12c200` |
| Planned Skills implemented | **8/8** |
| Planned Skills packaged in npm `files` | **8/8** |
| Package smoke (skills + no auto-activation) | pass (on preparation branch after version bump) |
| Public npm latest (until publication succeeds) | still `v0.10.0` |

### Scope

`v0.11.0` packages the post-`v0.10.0` feature-complete line:

- Codex/generic CMI activation integration;
- Ambient Agent Intelligence;
- Closing Intelligence;
- Session/Change continuation improvements including incomplete-active Change preservation;
- eight Agent Skill open-format adapters (read-only and write-aware thin adapters);
- npm shipment of Skill artifacts without auto-activation or Skill installation by `cmi activate`;
- no CMI-native Skill loader.

### Governance / field evidence

| Item | State |
|------|--------|
| Mission 1.5 bounded Skill field evidence | exists (Grok partial; Codex earlier matrix incomplete) |
| Mission 1.8B final Codex S0–S7 on final subject | **runtime-blocked before S0** (ChatGPT-auth model capacity; API-key fallback unavailable) |
| Issue #41 | closed **NOT_PLANNED** — **not** S0–S7 PASS |
| Study #30 (Study 003 preregistration) | closed **NOT_PLANNED** — no manufactured study results |

### Evidence limits

- Final Codex S0–S7 matrix was **not executed** on `c05098f…` due to external runtime availability. That is a **runtime limitation**, not a recorded CMI product field failure or pass.
- No productivity/time-savings proof.
- Static analysis remains heuristic/advisory.
- Agent clients may ignore project instructions/MCP.
- Package shipment does not prove runtime Skill discovery.
- No universal Codex/Grok Skill installation path claim.
- Not a v1 readiness claim.

### Publication status

```text
candidate prepared = YES (after this release-preparation merge/PR)
npm published v0.11.0 = NO (until separately authorized publication workflow)
GitHub Release v0.11.0 = NO (until publication)
```

## Current public release (until v0.11.0 publishes)

- Release: `v0.10.0`
- npm package: `codex-memory-intelligence@0.10.0`
- See historical notes below for the accepted `v0.10.0` publication record.

## Historical: v0.10.0 public release

- Release: `v0.10.0`
- npm package: `codex-memory-intelligence@0.10.0`
- npm dist-tag used by the authorized workflow: `latest`
- Release commit/tag target: `7218634b5ee54165dcedefe57fea5f6cb2a080fd`
- GitHub Release: [CMI v0.10.0](https://github.com/lenhonbp/codex-memory-intelligence/releases/tag/v0.10.0)
- Independent packed-package black-box acceptance: Issue #36 — `BLACK_BOX_ACCEPTED`

## Maintenance mode

After successful `v0.11.0` publication, the product owner intends **maintenance mode**: no additional planned feature Missions in the original roadmap. Future work is unplanned maintenance, security, or separately authorized research—not a continuation of the prerelease feature program.

---
name: portable-publish-helper
description: Prepare a bounded publication handoff for a generated site when the user explicitly asks to publish and an authorized runtime-specific publishing adapter is available. Does not install, activate, authenticate, publish, or assume network access by itself.
---

# Portable publish helper

## Trigger

Use after generation is complete when the user explicitly requests a publication handoff or separately authorizes publishing through an available runtime adapter.

Do not use for preview-only work, when publication authority is absent, or when the required runtime adapter cannot be identified.

## Workflow

1. Identify the project root from the active workspace; do not assume a vendor home directory.
2. Confirm the intended destination, publication authority, network/credential requirements, and the exact runtime adapter or command available in the current environment.
3. If any required adapter, credential, destination, or authority is unavailable, return `needs-evidence` or `blocked` rather than inventing a publish result.
4. Prepare the bounded handoff: project root, destination, runtime adapter identity, expected side effects, verification plan, and stop conditions.
5. Execute publication only in a separately authorized runtime-specific workflow. This portable Skill does not itself publish.
6. Treat a command exit status as command evidence only. Do not claim a live site is published until the destination is independently observed when that observation is required.

## Runtime adapter boundary

Vendor-specific commands, filesystem paths, account state, and automatic network behavior belong in an explicitly named runtime adapter. Their presence in a source Skill is reported source behavior, not portable truth.

Installing or packaging this Skill does not prove that any agent runtime discovers or activates it automatically.

## Handoff

Return the publication status (`not-run`, `blocked`, `reported`, or observed at the appropriate scope), runtime adapter used or required, evidence addresses, unresolved gaps, and the next authorized action.

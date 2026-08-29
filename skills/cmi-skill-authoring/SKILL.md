---
name: cmi-skill-authoring
description: Create or adapt portable Agent Skill artifacts from concrete, evidenced workflows while preserving CMI authority, evidence, lifecycle, and runtime boundaries. Use when a reusable workflow should become a SKILL.md package or an external/vendor-specific Skill needs portability refactoring. It does not install or activate Skills, invent unobserved expertise, or create a native CMI Skill runtime.
---

# Skill: cmi-skill-authoring

## Purpose

Turn a sufficiently understood workflow into a concise portable Agent Skill, or adapt a useful vendor-specific Skill without importing its assumptions blindly.

This Skill generalizes reusable authoring principles such as concrete usage examples, appropriate degrees of freedom, progressive disclosure, bundled resources, validation, and iteration. It is agent-independent and must not assume Manus, Codex, Claude, or any runtime-specific filesystem unless the resulting Skill is explicitly a bounded adapter for that runtime.

## Before authoring

Establish:

- concrete trigger examples and non-triggers;
- intended user outcome and acceptance criteria;
- target runtime(s) and portability goal;
- authoritative workflow evidence or source material;
- required tools/dependencies and side effects;
- security, license, provenance, and authorization constraints;
- what is known, inferred, reported, or still unobserved.

Do not encode a speculative workflow as established expertise. If the workflow is not sufficiently evidenced, create an evaluation candidate or mark `needs-evidence` instead.

## Authoring workflow

1. **Understand concrete use cases.** Prefer observed/reviewed examples over abstract descriptions. Identify where the workflow varies and where mistakes are costly.
2. **Choose degree of freedom.** Use high freedom for judgment-heavy work, medium freedom for preferred patterns with bounded variation, and low freedom for fragile deterministic operations.
3. **Design the package.** Every Skill needs `SKILL.md` with YAML `name` and `description`. Add `scripts/`, `references/`, or `templates/` only when they reduce repetition or context cost.
4. **Write discovery metadata carefully.** `description` must say what the Skill does and when it should trigger. Do not imply automatic discovery, installation, support, or runtime compatibility that has not been observed.
5. **Keep the core workflow concise.** Put trigger logic, boundaries, required sequence, failure behavior, and navigation in `SKILL.md`. Move detailed variants/reference material out of the main body when useful.
6. **Remove vendor assumptions unless intentional.** Replace hard-coded home directories, proprietary tool names, runtime-only commands, and hidden environment assumptions with portable contracts or clearly named adapters.
7. **Bound authority and side effects.** State read/write behavior, destructive/external actions, credentials/network needs, and stop conditions. A Skill never gains authority merely by being selected.
8. **Preserve CMI semantics.** Do not create parallel memory/evidence/lifecycle state; do not relabel reported verification as observed; do not auto-promote inference to reviewed memory; do not make session closure complete a partial Change.
9. **Validate structure and references.** Check frontmatter, folder/name consistency, internal links, referenced resources, executable syntax where applicable, and prohibited absolute/vendor paths for portable Skills.
10. **Evaluate behavior.** Test representative trigger, non-trigger, failure, evidence-gap, and authorization cases. For executable scripts, test the smallest safe representative path in an authorized environment.
11. **Iterate from observed use.** Treat improvements as proposals until usage evidence supports them. Do not turn a single successful example into universal core policy.

## Progressive disclosure

Use three conceptual layers:

1. metadata for discovery;
2. `SKILL.md` for the active workflow;
3. bundled resources loaded or executed only when needed.

This is a packaging discipline, not proof that a particular agent runtime implements those layers automatically.

## Portability review

For a Skill intended to be portable, reject or explicitly bound:

- absolute runtime-specific paths;
- commands that assume an unavailable proprietary tool;
- implicit network access;
- implicit credential access;
- automatic installation/activation;
- undocumented destructive writes;
- claims that package distribution proves runtime discovery;
- references to a vendor-specific evidence vocabulary that conflict with CMI semantics.

A runtime-specific Skill is allowed when its scope is explicit in its name/description and it remains an edge adapter.

## Relationship to discovery

`cmi-skill-discovery` may supply a third-party Skill as source material. Authoring must independently inspect and adapt it. Discovery ranking, stars, cache entries, or another agent's recommendation are not proof that its workflow is safe or correct.

## Completion

A completed Skill has valid frontmatter, accurate trigger metadata, explicit non-goals/authority boundaries, coherent workflow, minimal necessary resources, valid internal references, disclosed runtime/dependency assumptions, representative evaluation evidence, and no unsupported claim of installation, activation, compatibility, or verification.

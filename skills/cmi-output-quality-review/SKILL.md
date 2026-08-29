---
name: cmi-output-quality-review
description: Review or edit user-facing prose for clarity, specificity, repetition, unsupported attribution, generic AI-like writing patterns, and unnecessary formatting while preserving the author's meaning and CMI evidence/provenance semantics. Use as a final quality pass for documentation, reports, handoffs, release notes, and other prose. Style-only adapter; it must not strengthen claims, change evidence state, or invent facts.
---

# Skill: cmi-output-quality-review

## Purpose

Improve prose quality without changing what the evidence supports. This is an optional output-quality adapter, not an AI-authorship detector and not a technical verification gate.

## Modes

- **Review:** identify concrete writing patterns and propose bounded fixes without rewriting the artifact.
- **Edit:** make the minimum effective edits while preserving meaning, voice, technical identifiers, evidence addresses, uncertainty, and provenance.

Never claim to determine whether a human or AI authored text. Observable writing patterns are evidence about the text, not authorship proof.

## Review priorities

1. Preserve the author's actual meaning and useful voice.
2. Protect concrete facts, numbers, dates, identifiers, commands, links, code, and evidence addresses.
3. Remove unsupported attribution such as `experts agree`, `studies show`, or `widely regarded` unless the source is present.
4. Replace generic importance claims with the supported fact or consequence when available.
5. Cut throat-clearing, redundant recap, fake-insight framing, repeated sentence shapes, unnecessary dramatic fragments, and decorative formatting when they obscure the point.
6. Prefer concrete mechanisms and observed outcomes over vague abstractions.
7. Keep uncertainty where it is real. Words such as `may`, `reported`, `inferred`, `not-observed`, `partial`, or `needs-evidence` must not be removed merely to make prose sound stronger.

## CMI evidence-preservation contract

When editing CMI-related output:

- `observed` must remain observed only when directly supported;
- `inferred` must not become `reviewed` or `fact` through prose cleanup;
- reported verification must remain visibly reported and must not become an observed command;
- `not-enough-evidence`, `needs-evidence`, `not-observed`, `not-run`, `partial`, `blocked`, and `not-assessed` must retain their semantic force;
- local/focused verification must not be rewritten as CI, external/live, mobile, production, or release verification;
- recommendation/severity must not be rewritten as authorization or current priority;
- Session and Change lifecycle language must preserve their independence;
- evidence addresses, actual IDs, revisions, command metadata, and artifact references must not be invented or silently altered.

If a stylistic improvement would require changing any of those meanings, leave the text intact or flag the conflict.

## Workflow

1. Read the full artifact before changing it.
2. Identify the artifact's job, audience, core point, and voice signals worth preserving.
3. Identify concrete quality problems; do not apply a banned-word list mechanically.
4. In Review mode, report the pattern, exact passage, why it hurts clarity/evidence fidelity, and a bounded fix.
5. In Edit mode, make the smallest coherent changes.
6. Run an evidence-preservation pass comparing the edited text with the source claims.
7. If the source itself contains unsupported claims, flag them; do not silently manufacture support or rewrite them into stronger certainty.

## Non-goals

This Skill does not:

- verify technical correctness;
- verify citations or external facts unless another authorized workflow supplies that evidence;
- decide AI authorship;
- replace the Agent OS evidence or verification workflow;
- alter durable CMI state;
- automatically rewrite every output;
- force one house style over a user's deliberate voice.

## Completion

For Review mode, return actionable findings without authorship scoring. For Edit mode, return the edited artifact plus a concise summary of material changes when useful. In both modes, any unresolved evidence conflict remains explicit rather than being polished away.

---
name: cmi-skill-discovery
description: Discover and assess external Agent Skill artifacts when the current runtime or CMI Skill set lacks a needed workflow. Use to find candidate SKILL.md packages from authorized sources and decide whether to reject, evaluate, or adapt them. Advisory only; it does not auto-install, auto-activate, execute, trust, or promote third-party Skills and does not add a native CMI Skill loader or registry.
---

# Skill: cmi-skill-discovery

## Purpose

Find external Agent Skill candidates and prepare an evidence-bounded adoption decision without turning discovery into trust, installation, activation, or execution.

CMI currently distributes portable Skill artifacts but does not own runtime Skill discovery or loading. This Skill preserves that architecture.

## Trigger

Use when a requested workflow is not covered by the current available Skills, when the user explicitly asks to find an Agent Skill, or when adapting a proven external workflow could be safer or cheaper than authoring one from scratch.

## Required workflow

1. **Define the missing capability.** State task, trigger examples, target agent/runtime, expected inputs/outputs, required tools, authority boundary, and acceptance criteria.
2. **Check existing capability first.** Inspect currently available CMI/runtime Skills before external discovery. Do not create duplicates merely because names differ.
3. **Search authorized sources.** GitHub repositories, curated catalogs, or runtime-specific registries may be providers. Do not claim a fixed source list is the Internet or the complete ecosystem.
4. **Inspect the actual artifact.** Read the candidate `SKILL.md` and relevant bundled scripts/references before recommending adoption. Repository title, description, stars, cached metadata, or search snippets are insufficient.
5. **Assess portability and trust.** Record runtime-specific paths/tools, shell/network assumptions, write/destructive actions, bundled executable code, external dependencies, license/provenance, secret/credential expectations, and conflicts with CMI evidence/lifecycle semantics.
6. **Classify the candidate.** Use one of:
   - `compatible`: portable enough to evaluate without semantic rewrite;
   - `adapt-required`: useful workflow, but vendor/runtime assumptions must be removed or bounded;
   - `reject`: conflicts with authority, evidence, security, lifecycle, or project constraints;
   - `needs-evidence`: artifact/provenance/behavior is insufficiently observed.
7. **Require review before adoption.** Discovery never means installation. Any import/adaptation is a separate authorized change with its own verification.

## Minimum candidate evidence

Record:

- canonical source and exact revision/version when observable;
- `name` and `description` from the actual artifact;
- relevant workflow/resources inspected;
- target runtime assumptions;
- scripts/executable behavior and side effects;
- external/network/credential dependencies;
- license/provenance state;
- conflicts with CMI contracts;
- adaptation required;
- classification, confidence, and missing evidence.

## Hard boundaries

This Skill MUST NOT:

- auto-install or copy a discovered Skill into an agent runtime;
- auto-activate a Skill;
- execute third-party scripts as part of discovery;
- treat a repository as verified merely because it is curated, popular, starred, cached, or named by another agent;
- treat cached discovery metadata as current evidence without disclosing its provenance/freshness;
- bypass runtime permissions or CMI write boundaries;
- create a CMI-native loader, registry, discovery daemon, or automatic execution path;
- promote an external Skill's claims into durable CMI truth.

## Relationship to authoring

If a candidate is `adapt-required`, hand it to `cmi-skill-authoring` as source material. Preserve attribution/provenance and extract the reusable workflow rather than blindly renaming vendor-specific paths or commands.

If no suitable candidate exists, `cmi-skill-authoring` may be used to create a new bounded Skill from observed requirements and tested workflows.

## Completion

Return the missing capability, sources searched, candidates inspected, evidence addresses, classifications, rejected reasons, recommended next action, confidence, and unresolved gaps. A successful discovery outcome may still be `reject all` or `needs-evidence`.

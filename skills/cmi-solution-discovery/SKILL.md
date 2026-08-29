---
name: cmi-solution-discovery
description: Evaluate whether an existing library, tool, project-local component, standard capability, or other reusable solution should be adopted before custom implementation. Use for well-trodden implementation problems where reuse could reduce cost or risk. Evidence-bounded advisory Skill only; it does not install dependencies, execute candidates, authorize licenses, mutate project source, or treat popularity as proof of fitness.
---

# Skill: cmi-solution-discovery

## Purpose

Find and compare credible reuse candidates before custom implementation when the problem is likely already solved. This is an advisory discovery workflow under the CMI Agent OS contract, not a package installer or implementation engine.

## Trigger

Use when a substantive implementation task involves a common capability such as parsing, conversion, media/file handling, automation, protocol support, UI infrastructure, testing, scraping, serialization, storage adapters, or other reusable technical building blocks.

Do not use when the repository already has an authoritative implementation that satisfies the requirement, when reuse is prohibited by policy, or when discovery would cost more than the bounded change.

## Required workflow

1. **Orient.** Record the actual capability, constraints, target runtime, acceptance criteria, dependency policy, security/privacy constraints, and license constraints. Missing constraints are evidence gaps, not permission to assume compatibility.
2. **Inspect local reuse first.** Check the project for an existing dependency, utility, abstraction, platform API, or adjacent implementation before searching externally.
3. **Discover candidates.** Use available external search/provider tooling only when authorized and available. GitHub may be one provider; it is not the capability boundary.
4. **Collect evidence per candidate.** Prefer authoritative repository/package documentation and observed project metadata. Record source address and observation time when freshness matters.
5. **Evaluate fitness.** Compare candidates on requirement fit, compatibility, maintenance/activity, documentation, tests/CI signals, security posture, license, dependency weight, integration effort, reversibility, and project-specific risk.
6. **Challenge the leading candidate.** Identify at least one material reason it could be wrong for this project. Popularity, stars, downloads, age, or brand recognition are supporting signals only and never prove quality, security, compatibility, or license suitability.
7. **Recommend a disposition.** Return `reuse`, `adapt`, `build`, or `needs-evidence`, with evidence addresses and residual risks. A recommendation is not authorization to install or modify source.
8. **Hand off.** If implementation is authorized separately, pass the chosen candidate, rejected alternatives, evidence, constraints, and verification plan to the implementation workflow.

## Candidate record

For each serious candidate record:

- name and canonical source;
- capability match and known gaps;
- observed version/activity evidence where relevant;
- runtime/platform compatibility evidence;
- license evidence or `needs-evidence`;
- security/maintenance evidence or unknowns;
- integration cost and reversibility;
- decisive project-specific verification needed;
- disposition and confidence.

## Evidence and authority boundaries

Follow `cmi-agent-operating-system` evidence semantics. Keep observation, inference and recommendation separate. A README claim is reported project documentation unless independently observed in the target environment. Search ranking is not evidence of fitness. Historical popularity is not causality. Do not fabricate vulnerability, license, benchmark, adoption, maintenance or compatibility claims.

This Skill MUST NOT:

- install a package or system dependency;
- execute downloaded code;
- copy third-party source into the project;
- edit lockfiles or project source;
- approve a license, security exception, architecture choice or external action;
- create a native CMI discovery engine, registry, persistence layer or network dependency;
- claim a candidate works until the relevant project journey or contract is observed.

## Completion

A complete discovery result contains the problem/constraints, local-reuse check, candidate evidence, comparison, rejected alternatives, disposition, confidence, unresolved evidence gaps, and the next decisive verification. If no candidate is sufficiently supported, prefer `build` or `needs-evidence` over forced reuse.

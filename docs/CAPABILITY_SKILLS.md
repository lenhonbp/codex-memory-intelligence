# CMI Capability Skills

**Status:** Portable advisory/orchestration artifacts; no native Skill loader, registry, discovery engine, automatic activation, or new CMI lifecycle runtime.

This tranche adapts four useful patterns from externally supplied Skills into CMI-native, agent-independent contracts. The source Skills were used as design inputs rather than copied wholesale because several contained vendor-specific paths, fixed provider assumptions, popularity heuristics, or style rules that would conflict with CMI's portability and evidence boundaries.

## Added artifacts

| Skill | Role | Boundary |
|---|---|---|
| `cmi-solution-discovery` | Decide whether to reuse/adapt/build before custom implementation. | Advisory only; no install, execution, source mutation, or license/security approval. |
| `cmi-skill-discovery` | Find and assess external Agent Skill candidates. | Discovery is not trust, import, installation, activation, or execution. |
| `cmi-skill-authoring` | Create/adapt portable Skills from concrete evidenced workflows. | No invented expertise, auto-installation, runtime activation, or parallel CMI lifecycle. |
| `cmi-output-quality-review` | Improve user-facing prose while preserving evidence semantics. | Style pass only; cannot strengthen claims or verification state. |

These four artifacts are packaged by the existing `package.json` `files` → `skills` rule. Packaging still does not prove or cause runtime discovery.

## Why the external Skills were adapted rather than imported

### Tool reuse

The useful pattern is **reuse before reinvention**, but GitHub stars or project age are not sufficient evidence of fitness. CMI's version therefore checks local reuse first and treats GitHub as one possible provider. Candidate evaluation includes project fit, compatibility, maintenance evidence, documentation, tests/CI signals, security posture, license, dependency weight, integration effort and reversibility.

### Skill discovery

The supplied finder searched a fixed set of GitHub repositories and included cached metadata. CMI's version does not call that set "the Internet" or "verified" by default. It requires inspection of the actual Skill artifact, explicit cache/freshness provenance, portability/trust review, and a separate authorized adoption step.

### Skill authoring

The supplied authoring workflow contained useful principles: concrete examples, degree-of-freedom matching, progressive disclosure, bundled resources, validation and iteration. Its Manus-specific paths and commands were deliberately removed. CMI authoring is agent-independent unless a resulting Skill is explicitly scoped as a runtime adapter.

### Output quality

The supplied writing editor contains useful observable prose-pattern checks, but fixed banned-word/style rules are not CMI policy. CMI's version focuses on clarity and specificity while adding a stronger invariant: editing must never turn inference into reviewed fact, reported verification into observed verification, local checks into CI/live proof, or recommendations into authorization.

## Architecture fit

The authoritative rule in `docs/SKILLS.md` still applies: Skills are thin portable workflow artifacts. These additions do not change `src/**`, CMI schemas, MCP/CLI commands, activation, memory, Session, Change, findings, Closing Intelligence, or trust behavior.

The intended composition is:

```text
CMI Agent OS
  ├─ solution discovery → reuse/adapt/build recommendation
  ├─ skill discovery → compatible/adapt-required/reject/needs-evidence
  ├─ skill authoring → portable reviewed Skill candidate
  └─ output quality review → evidence-preserving prose pass
```

External search, runtime Skill placement, installation, execution, source edits, dependency changes, approval and publishing remain separate authority gates.

## Deliberately not imported

The domain Skills from the same supplied collection (GSAP, Babylon.js, HyperFrames, Excel and Chrome performance) remain domain candidates rather than core CMI capability policy. The memsearch adapter is also not imported because its implementation is tied to a specific CLI/transcript environment; only generic evidence-bounded retrieval ideas should be considered against CMI's existing memory architecture.

## Verification expectations

`tests/skills/capability-skills-contract.test.js` enforces the portable metadata and key negative boundaries. Repository verification must still run the normal CMI gates (`npm run check`, `npm run quality`, `npm test` or `npm run verify`). CI, external runtime discovery and release readiness remain separate evidence layers and must not be inferred from repository-local checks.

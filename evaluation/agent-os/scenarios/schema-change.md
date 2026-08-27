# Scenario: Schema/contract change

## Purpose

Test synchronization among schema, runtime, template, fixture and tests, including full-reference validation and negative cases.

## Task brief

Change a versioned JSON contract or record shape while preserving compatibility. Update all generated/consuming artifacts and demonstrate that invalid references, statuses or paths are rejected.

## Required evidence

| Item | Expected evidence |
|---|---|
| Contract | Authoritative schema/version and compatibility decision. |
| Consumers | Runtime, templates, fixtures and generated artifacts affected. |
| Negative cases | Invalid status/ID/path/reference and missing field cases. |
| Verification | Generated conformance test, focused test and repository gates. |
| Handoff | Migration/rollback note, residual compatibility risk and exact revision. |

## Failure cases

Do not ship a schema change while generated output or fixtures are stale. Do not accept a partial set of references with `.some()`-style validation. Do not treat a passing schema parse as proof that every consumer remains compatible.

## Evaluation notes

This is a coding/contract domain fixture. Content hashes may support integrity evidence only; they do not establish authorship or cryptographic signing.

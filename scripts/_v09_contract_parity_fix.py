from pathlib import Path

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    (ROOT / path).write_text(text if text.endswith('\n') else text + '\n')

def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one anchor, found {count}: {old!r}')
    write(path, text.replace(old, new, 1))

replace_once(
    'src/durable-contracts.js',
    "function uuidLike(value) { return typeof value === 'string' && /^[0-9a-f]{8,}(?:-[0-9a-f-]+)?$/i.test(value); }",
    "function uuidLike(value) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }",
)

replace_once(
    'schemas/session-record.schema.json',
    '    "id": { "type": "string", "minLength": 8 },',
    '    "id": { "type": "string", "format": "uuid" },',
)
replace_once(
    'schemas/session-record.schema.json',
    '      "required": ["id", "key", "state", "category", "severity", "title", "detail", "confidence", "evidenceType"],',
    '      "required": ["id", "key", "state", "category", "severity", "title", "detail", "confidence", "evidenceType", "occurrences"],',
)
replace_once(
    'schemas/session-record.schema.json',
    '        "id": { "type": "string" },\n        "key": { "type": "string" },',
    '        "id": { "type": "string", "format": "uuid" },\n        "key": { "type": "string" },',
)
replace_once(
    'schemas/session-record.schema.json',
    '        "relatedFiles": { "type": "array", "items": { "type": "string" }, "maxItems": 50 },\n        "occurrences": { "type": "integer", "minimum": 1 }',
    '        "relatedFiles": { "type": "array", "items": { "type": "string" }, "maxItems": 50 },\n        "sessions": { "type": "array", "items": { "type": "string", "format": "uuid" }, "maxItems": 50 },\n        "occurrences": { "type": "integer", "minimum": 1 }',
)
replace_once(
    'schemas/session-record.schema.json',
    '        "sessionId": { "type": "string" },',
    '        "sessionId": { "type": "string", "format": "uuid" },',
)

replace_once(
    'schemas/findings-registry.schema.json',
    '          "sessions": {\n            "type": "array",\n            "items": {\n              "type": "string",\n              "maxLength": 100\n            },',
    '          "sessions": {\n            "type": "array",\n            "items": {\n              "type": "string",\n              "format": "uuid"\n            },',
)

replace_once(
    'scripts/quality.js',
    "  if (session.properties?.schemaVersion?.const !== SESSION_SCHEMA_VERSION) errors.push('session schemaVersion differs from runtime contract');\n",
    "  if (session.properties?.schemaVersion?.const !== SESSION_SCHEMA_VERSION) errors.push('session schemaVersion differs from runtime contract');\n  if (session.properties?.id?.format !== 'uuid') errors.push('session id schema must use canonical UUID format');\n  if (session.$defs?.finding?.properties?.id?.format !== 'uuid') errors.push('session finding id schema must use canonical UUID format');\n  if (!(session.$defs?.finding?.required || []).includes('occurrences')) errors.push('session finding schema must require occurrences like runtime');\n  if (session.$defs?.handoff?.properties?.sessionId?.format !== 'uuid') errors.push('session handoff sessionId schema must use canonical UUID format');\n",
)
replace_once(
    'scripts/quality.js',
    "  if (findings.properties?.schemaVersion?.const !== FINDINGS_SCHEMA_VERSION) errors.push('findings schemaVersion differs from runtime contract');\n",
    "  if (findings.properties?.schemaVersion?.const !== FINDINGS_SCHEMA_VERSION) errors.push('findings schemaVersion differs from runtime contract');\n  if (findings.properties?.findings?.items?.properties?.id?.format !== 'uuid') errors.push('findings registry id schema must use canonical UUID format');\n  if (!(findings.properties?.findings?.items?.required || []).includes('occurrences')) errors.push('findings registry must require occurrences like runtime');\n",
)

replace_once(
    'tests/v09-evidence-integrity.test.js',
    "  const base = { schemaVersion: 1, id: '12345678-abcd', revision: 1, status: 'active', goal: 'validate nested evidence', createdAt: now, updatedAt: now, start: {}, close: null };",
    "  const base = { schemaVersion: 1, id: '12345678-1234-4123-8123-123456789abc', revision: 1, status: 'active', goal: 'validate nested evidence', createdAt: now, updatedAt: now, start: {}, close: null };",
)
replace_once(
    'tests/v09-evidence-integrity.test.js',
    "  assert.equal(validateSessionRecord({ ...base, observations: [{ observedAt: now, files: [] }] }), false);",
    "  assert.equal(validateSessionRecord({ ...base, id: '12345678-abcd', observations: [] }), false);\n  assert.equal(validateSessionRecord({ ...base, observations: [{ observedAt: now, files: [] }] }), false);",
)

replace_once(
    'CHANGELOG.md',
    '- `schemas/findings-registry.schema.json` plus CI-enforced schema/runtime enum and version parity.',
    '- `schemas/findings-registry.schema.json` plus CI-enforced schema/runtime identity, required-field, enum, and version parity.',
)
replace_once(
    'docs/EVIDENCE_INTEGRITY.md',
    '- persistent findings registry.\n',
    '- persistent findings registry.\n\nDurable memory, session, handoff, and finding identities use canonical UUIDs in both runtime validation and their versioned JSON Schemas. Required trust fields such as finding occurrence counts are also parity-checked.\n',
)

print('v0.9 contract parity correction applied')

import test from 'node:test';
import assert from 'node:assert/strict';
import { looksSensitive, SECRET_GUARD_DESCRIPTION } from '../src/sensitive.js';

function repeated(char, count) {
  return char.repeat(count);
}

test('sensitive guard covers explicit credential formats without broad plain-text false positives', () => {
  assert.equal(looksSensitive(null), false);
  assert.equal(looksSensitive('ordinary architecture note with no credentials'), false);
  assert.equal(looksSensitive('-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----'), true);
  assert.equal(looksSensitive(`api_key=${repeated('a', 8)}`), true);
  assert.equal(looksSensitive(`Bearer ${'Ab3_'.repeat(5)}`), true);
  assert.equal(looksSensitive('https://user:password123@example.invalid/path'), true);
  assert.equal(looksSensitive('eyJabcdefgh.ijklmnopq.rstuvwxyz'), true);
  assert.equal(looksSensitive(`AKIA${'A1'.repeat(8)}`), true);
  assert.equal(looksSensitive(`AIza${'Ab1_'.repeat(8)}`), true);

  for (const prefix of ['ghp', 'gho', 'ghu', 'ghs', 'ghr', 'github_pat', 'glpat', 'npm_', 'xoxb', 'sk_live', 'rk_live']) {
    assert.equal(looksSensitive(`${prefix}-${'Ab3'.repeat(5)}`), true, prefix);
  }

  assert.match(SECRET_GUARD_DESCRIPTION, /best-effort/i);
  assert.match(SECRET_GUARD_DESCRIPTION, /not a DLP/i);
});

test('generic credential heuristic exercises entropy, length, whitespace, hex, UUID, and class boundaries', () => {
  const highEntropy = 'aB3_'.repeat(8);
  assert.equal(looksSensitive(`credential ${highEntropy}`), true);

  assert.equal(looksSensitive('credential short-token'), false);
  assert.equal(looksSensitive(`credential ${repeated('a', 24)}`), false);
  assert.equal(looksSensitive(`credential ${'ab12'.repeat(6)}`), false);
  assert.equal(looksSensitive(`credential ${'0123456789abcdef'.repeat(3)}`), false);
  assert.equal(looksSensitive('credential 123e4567-e89b-12d3-a456-426614174000'), false);
  assert.equal(looksSensitive(`credential ${'Ab3_'.repeat(6)} suffix with spaces that prevent one token from swallowing prose`), true);
  assert.equal(looksSensitive(`credential ${'A'.repeat(501)}`), false);
});

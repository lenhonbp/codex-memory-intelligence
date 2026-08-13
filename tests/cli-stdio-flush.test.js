import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI_ENTRY = fileURLToPath(new URL('../src/cli-entry.js', import.meta.url));
const MAX_BUFFER = 16 * 1024 * 1024;

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [CLI_ENTRY, ...args], {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    timeout: 60_000,
    env: { ...process.env },
  });
}

function assertSucceeded(result, label) {
  assert.equal(result.error, undefined, `${label}: ${result.error?.message || ''}`);
  assert.equal(result.status, 0, `${label}: ${String(result.stderr || result.stdout || '').slice(0, 1000)}`);
}

test('cli-entry flushes large JSON stdout before forced exit', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-cli-stdio-flush-'));
  try {
    const sourceDir = path.join(root, 'src');
    await fs.mkdir(sourceDir, { recursive: true });
    const symbols = Array.from({ length: 3200 }, (_, index) => (
      `export function portableEvidenceSymbol${String(index).padStart(4, '0')}() { return ${index}; }`
    ));
    await fs.writeFile(path.join(sourceDir, 'portable-evidence-large.js'), `${symbols.join('\n')}\n`, 'utf8');

    const init = runCli(['init', root], { cwd: root });
    assertSucceeded(init, 'init');

    const scan = runCli(['scan', root, '--full', '--json'], { cwd: root });
    assertSucceeded(scan, 'scan');
    assert.doesNotThrow(() => JSON.parse(scan.stdout.trim()));

    const context = runCli(['context', 'portable evidence', '--json'], { cwd: root });
    assertSucceeded(context, 'context');
    assert.ok(Buffer.byteLength(context.stdout) > 200_000, `expected a large stdout payload, observed ${Buffer.byteLength(context.stdout)} bytes`);
    const parsed = JSON.parse(context.stdout.trim());
    assert.ok(parsed.summary.results >= 1);
    assert.equal(context.stderr, '');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

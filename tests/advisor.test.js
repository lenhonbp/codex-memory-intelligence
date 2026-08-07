import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { scanProject, remember } from '../src/core.js';
import {
  getRepositoryBaseline,
  mapProjectBoundaries,
  suggestProjectMemory,
  prepareChangeBrief,
} from '../src/advisor.js';

const execFileAsync = promisify(execFile);

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-advisor-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src', 'identity'), { recursive: true });
  await fs.mkdir(path.join(root, 'src', 'billing'), { recursive: true });
  await fs.mkdir(path.join(root, 'src', 'api'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'identity', 'session.js'), 'export function validateSession() { return true; }\n');
  await fs.writeFile(path.join(root, 'src', 'billing', 'ledger.js'), 'export function recordCharge() { return true; }\n');
  await fs.writeFile(path.join(root, 'src', 'api', 'checkout.js'), "import { validateSession } from '../identity/session.js';\nimport { recordCharge } from '../billing/ledger.js';\nexport function checkout() { return validateSession() && recordCharge(); }\n");
  await scanProject(root);
  return root;
}

async function initializeGit(root, context) {
  try {
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
    await execFileAsync('git', ['config', 'user.name', 'CMI Test'], { cwd: root });
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'Initial fixture'], { cwd: root });
  } catch (error) {
    if (error.code === 'ENOENT') { context.skip('Git is unavailable on this runner.'); return false; }
    throw error;
  }
  return true;
}

test('repository baseline is bounded and does not expose absolute paths', async (context) => {
  const root = await fixture();
  if (!await initializeGit(root, context)) return;
  let baseline = await getRepositoryBaseline(root);
  assert.equal(baseline.available, true);
  assert.equal(baseline.clean, true);
  assert.equal(baseline.projectPath, '.');
  assert.ok(baseline.head);
  assert.ok(!JSON.stringify(baseline).includes(root));

  const nested = path.join(root, 'packages', 'client');
  await fs.mkdir(nested, { recursive: true });
  const nestedBaseline = await getRepositoryBaseline(nested);
  assert.equal(nestedBaseline.available, true);
  assert.equal(nestedBaseline.projectPath, 'packages/client');
  assert.ok(!JSON.stringify(nestedBaseline).includes(root));

  await fs.appendFile(path.join(root, 'src', 'api', 'checkout.js'), '\nexport const version = 2;\n');
  baseline = await getRepositoryBaseline(root);
  assert.equal(baseline.clean, false);
  assert.ok(baseline.changes.some((item) => item.path === 'src/api/checkout.js'));
});

test('repository baseline parses rename destinations and origins without arrow pseudo-paths', async (context) => {
  const root = await fixture();
  if (!await initializeGit(root, context)) return;
  await execFileAsync('git', ['mv', 'src/api/checkout.js', 'src/api/purchase.js'], { cwd: root });
  const baseline = await getRepositoryBaseline(root);
  const rename = baseline.changes.find((item) => item.status.includes('R'));
  assert.ok(rename);
  assert.equal(rename.path, 'src/api/purchase.js');
  assert.equal(rename.originalPath, 'src/api/checkout.js');
  assert.ok(!rename.path.includes(' -> '));
  assert.ok(!JSON.stringify(baseline).includes(root));
});

test('repository baseline remains usable in detached HEAD state', async (context) => {
  const root = await fixture();
  if (!await initializeGit(root, context)) return;
  await execFileAsync('git', ['checkout', '--detach'], { cwd: root });
  const baseline = await getRepositoryBaseline(root);
  assert.equal(baseline.available, true);
  assert.equal(baseline.branch, 'detached');
  assert.ok(baseline.head);
  assert.ok(baseline.fullHead);
  assert.equal(baseline.clean, true);
});

test('non-Git projects still receive a complete advisory brief', async () => {
  const root = await fixture();
  const baseline = await getRepositoryBaseline(root);
  assert.equal(baseline.available, false);
  const brief = await prepareChangeBrief(root, 'change checkout identity and billing flow');
  assert.equal(brief.ready, true);
  assert.equal(brief.baseline.available, false);
  assert.ok(brief.context.recommendedFiles.includes('src/api/checkout.js'));
  assert.ok(brief.assumptions.length > 0);
});

test('boundary inference remains generic and labels confidence and provenance', async () => {
  const root = await fixture();
  const map = await mapProjectBoundaries(root);
  assert.equal(map.available, true);
  assert.ok(map.boundaries.some((item) => item.label === 'Identity'));
  assert.ok(map.boundaries.some((item) => item.label === 'Billing'));
  assert.ok(map.boundaries.some((item) => item.label === 'Api'));
  assert.ok(map.connections.some((item) => item.edges > 0));
  assert.ok(map.boundaries.every((item) => ['low','medium','high'].includes(item.confidence)));
  assert.match(map.method, /advisory/i);
  assert.doesNotMatch(JSON.stringify(map), /CuuChau|Cloudflare|game/i);
});

test('memory suggestions are proposals and never durable writes', async () => {
  const root = await fixture();
  const before = await fs.readFile(path.join(root, '.codex-memory', 'decisions.md'), 'utf8');
  const result = await suggestProjectMemory(root, 'change authentication and billing transaction flow');
  const after = await fs.readFile(path.join(root, '.codex-memory', 'decisions.md'), 'utf8');
  assert.equal(before, after);
  assert.equal(result.coverage.relevantDurableEntries, 0);
  assert.ok(result.suggestions.some((item) => item.title === 'Identity and access control'));
  assert.ok(result.suggestions.some((item) => item.title === 'Persistence and schema'));
  assert.ok(result.suggestions.every((item) => item.status === 'proposal'));
  assert.match(result.policy, /never converts inferred knowledge/i);
});

test('pre-change brief combines context, boundaries, impact, risks, and verification', async () => {
  const root = await fixture();
  await remember(root, 'decision', 'Checkout must validate identity before recording a charge.', { sources: ['src/api/checkout.js'] });
  const brief = await prepareChangeBrief(root, 'change checkout identity billing authentication and transaction handling');
  assert.equal(brief.schemaVersion, 1);
  assert.equal(brief.ready, true);
  assert.ok(brief.context.recommendedFiles.includes('src/api/checkout.js'));
  assert.ok(brief.boundaries.relevant.length >= 2);
  assert.equal(brief.impact.found, true);
  assert.ok(brief.risks.some((item) => item.id === 'identity-access'));
  assert.ok(brief.verification.some((item) => item.id === 'verify-persistence-schema'));
  assert.ok(brief.assumptions.every((item) => typeof item === 'string'));
  assert.equal(brief.provenance.boundaries, 'workspace, directory, and import-graph inference');
});

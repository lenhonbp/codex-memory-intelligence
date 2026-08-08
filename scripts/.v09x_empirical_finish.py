from pathlib import Path


def patch(path, old, new, count=1):
    p=Path(path); t=p.read_text()
    if old not in t: raise SystemExit(f'anchor missing in {path}: {old[:120]!r}')
    p.write_text(t.replace(old,new,count))

# Generated intelligence caches have a larger but still bounded ceiling than durable user records.
patch('src/storage.js',
      "export const DEFAULT_MAX_DURABLE_BYTES = 1_000_000;\n",
      "export const DEFAULT_MAX_DURABLE_BYTES = 1_000_000;\nexport const DEFAULT_MAX_GENERATED_CACHE_BYTES = 64 * 1024 * 1024;\n")
patch('src/graph.js',
      "import { safeReadMemoryJson } from './storage.js';",
      "import { safeReadMemoryJson, DEFAULT_MAX_GENERATED_CACHE_BYTES } from './storage.js';")
patch('src/graph.js',
      "try { return await safeReadMemoryJson(root, 'project-graph.json', { optional: true }); } catch { return null; }",
      "try { return await safeReadMemoryJson(root, 'project-graph.json', { optional: true, maxBytes: DEFAULT_MAX_GENERATED_CACHE_BYTES }); } catch { return null; }")
patch('src/core.js',
      "import { ensureSafeMemoryRoot, safeEnsureMemoryDir, safeReadMemoryFile, safeReadMemoryJson, safeWriteMemoryFile, safeAppendMemoryFile, safeListMemoryDir } from './storage.js';",
      "import { ensureSafeMemoryRoot, safeEnsureMemoryDir, safeReadMemoryFile, safeReadMemoryJson, safeWriteMemoryFile, safeAppendMemoryFile, safeListMemoryDir, DEFAULT_MAX_GENERATED_CACHE_BYTES } from './storage.js';")
patch('src/core.js',
      "  const index = await safeReadMemoryJson(root, 'project-index.json', { optional: true }).catch(() => null);\n  const graph = await safeReadMemoryJson(root, 'project-graph.json', { optional: true }).catch(() => null);",
      "  const index = await safeReadMemoryJson(root, 'project-index.json', { optional: true, maxBytes: DEFAULT_MAX_GENERATED_CACHE_BYTES }).catch(() => null);\n  const graph = await safeReadMemoryJson(root, 'project-graph.json', { optional: true, maxBytes: DEFAULT_MAX_GENERATED_CACHE_BYTES }).catch(() => null);")

# One-time post-hoc evaluation review mutation with lease serialization.
patch('src/evaluation.js',
      "import { ensureSafeMemoryRoot, safeEnsureMemoryDir, safeListMemoryDir, safeReadMemoryJson, safeWriteMemoryFile } from './storage.js';",
      "import { ensureSafeMemoryRoot, safeEnsureMemoryDir, safeListMemoryDir, safeReadMemoryJson, safeWriteMemoryFile } from './storage.js';\nimport { withLeaseLock } from './lease-lock.js';")
anchor="""export async function getEvaluation(root, selector) {
  const { records } = await readEvaluationRecords(root);
  return resolveEvaluation(records, selector);
}

"""
review_fn="""export async function getEvaluation(root, selector) {
  const { records } = await readEvaluationRecords(root);
  return resolveEvaluation(records, selector);
}

export async function reviewEvaluation(root, selector, options = {}) {
  const review = normalizeReview(options);
  if (review.outcome === 'unreviewed') throw new Error('Evaluation review requires --review-outcome pass, partial, or fail with --review-provenance human or agent.');
  const snapshots = await safeEnsureMemoryDir(root, 'snapshots');
  return withLeaseLock(path.join(snapshots, 'evaluation-review.lock'), async () => {
    const { records } = await readEvaluationRecords(root);
    const record = resolveEvaluation(records, selector);
    if (record.review.outcome !== 'unreviewed') throw new Error('Evaluation record is already reviewed. Capture a new evaluation for a distinct review rather than overwriting provenance.');
    const updated = { ...record, review };
    const validation = validateEvaluationRecordContract(updated);
    if (!validation.valid) throw new Error(`Invalid reviewed evaluation record: ${validation.errors.join(' ')}`);
    await safeWriteMemoryFile(root, `${EVALUATION_DIR}/${record.id}.json`, `${JSON.stringify(updated, null, 2)}\n`);
    return updated;
  });
}

"""
if anchor not in Path('src/evaluation.js').read_text(): raise SystemExit('evaluation get anchor missing')
patch('src/evaluation.js', anchor, review_fn)

# CLI post-hoc review surface.
patch('src/cli-entry.js',
      "  getEvaluation,\n  listEvaluations,",
      "  getEvaluation,\n  reviewEvaluation,\n  listEvaluations,")
patch('src/cli-entry.js',
      "return 'Usage: cmi evaluate <capture|list|show|report> ...\\n\\nCollect anonymized field evidence while keeping external-real, self-host, and synthetic records separate.';",
      "return 'Usage: cmi evaluate <capture|review|list|show|report> ...\\n\\nCollect anonymized field evidence while keeping external-real, self-host, and synthetic records separate. Reviews are explicit post-hoc attestations and are not inferred from capture.';")
old="""    } else if (action === 'list') {
      const result = await listEvaluations(process.cwd(), { sourceKind: optionValues('--source-kind')[0], limit: optionNumber('--limit', 50) });
"""
new="""    } else if (action === 'review') {
      const selector = values[0];
      if (!selector) throw new Error('Usage: cmi evaluate review <id> --review-outcome <pass|partial|fail> --review-provenance <human|agent> [usefulness options]');
      const record = await reviewEvaluation(process.cwd(), selector, evaluationOptions());
      print(record, formatEvaluationRecord(record));
    } else if (action === 'list') {
      const result = await listEvaluations(process.cwd(), { sourceKind: optionValues('--source-kind')[0], limit: optionNumber('--limit', 50) });
"""
patch('src/cli-entry.js',old,new)
patch('src/cli-entry.js',
      "throw new Error('Usage: cmi evaluate <capture|list|show|report> ...');",
      "throw new Error('Usage: cmi evaluate <capture|review|list|show|report> ...');")

# MCP post-hoc review surface.
patch('src/mcp-entry.js',
      "  getEvaluation,\n  listEvaluations,",
      "  getEvaluation,\n  reviewEvaluation,\n  listEvaluations,")
anchor="""  { name: 'capture_project_evaluation', title: 'Capture project evaluation', description: 'Persist one bounded anonymized evaluation record. Requires MCP write opt-in. Source class, protocol, and review provenance are explicit and are never auto-promoted.', inputSchema: { type: 'object', required: ['sourceKind'], properties: {
"""
if anchor not in Path('src/mcp-entry.js').read_text(): raise SystemExit('MCP capture anchor missing')
# Insert review tool after capture tool block by locating closing annotations specific text.
p=Path('src/mcp-entry.js'); t=p.read_text()
needle="""  } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
];
const evaluationResources = [
"""
replacement="""  } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: 'review_project_evaluation', title: 'Review project evaluation', description: 'Attach one explicit human or agent post-hoc review to an unreviewed evaluation record without changing its captured measurements, source/protocol class, or stress evidence. Requires MCP write opt-in.', inputSchema: { type: 'object', required: ['id', 'reviewOutcome', 'reviewProvenance'], properties: {
    id: { type: 'string' },
    reviewOutcome: { type: 'string', enum: ['pass', 'partial', 'fail'] },
    reviewProvenance: { type: 'string', enum: ['human', 'agent'] },
    falsePositiveFindings: { type: 'integer', minimum: 0 },
    missedFindings: { type: 'integer', minimum: 0 },
    nextActionRating: { type: 'string', enum: ['useful', 'not-useful', 'unknown'] },
    handoffRating: { type: 'string', enum: ['useful', 'not-useful', 'unknown'] },
  } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
];
const evaluationResources = [
"""
if needle not in t: raise SystemExit('MCP evaluationWriteTools close anchor missing')
p.write_text(t.replace(needle,replacement,1))
old="""  if (name === 'capture_project_evaluation') {
    writable();
"""
# Locate call block then insert review block before unknown local tool. Do simple replacement after capture block return using known function call.
# First just ensure anchor exists; later insertion uses exact tail.
if old not in Path('src/mcp-entry.js').read_text(): raise SystemExit('MCP capture call anchor missing')
p=Path('src/mcp-entry.js'); t=p.read_text()
needle="""    const result = await captureEvaluation(root, args);
    return textResult(formatEvaluationRecord(result), result);
  }
  throw new Error(`Unknown session/evaluation tool: ${name}`);
"""
replacement="""    const result = await captureEvaluation(root, args);
    return textResult(formatEvaluationRecord(result), result);
  }
  if (name === 'review_project_evaluation') {
    writable();
    const result = await reviewEvaluation(root, args.id || '', args);
    return textResult(formatEvaluationRecord(result), result);
  }
  throw new Error(`Unknown session/evaluation tool: ${name}`);
"""
if needle not in t: raise SystemExit('MCP local call tail anchor missing')
p.write_text(t.replace(needle,replacement,1))

# Graph cache regression.
Path('tests/generated-cache.test.js').write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanProject, status } from '../src/core.js';
import { loadProjectGraph } from '../src/graph.js';
import { safeWriteMemoryFile, DEFAULT_MAX_DURABLE_BYTES, DEFAULT_MAX_GENERATED_CACHE_BYTES } from '../src/storage.js';

test('generated graph cache above durable-record limit remains readable under a separate bounded cache ceiling', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-large-cache-'));
  await fs.writeFile(path.join(root, 'package.json'), '{\"type\":\"module\"}');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const value = 1;\\n');
  await scanProject(root);
  const graph = await loadProjectGraph(root);
  graph.externalDependencies = Array.from({ length: 42000 }, (_, index) => `generated-dependency-${index.toString().padStart(5, '0')}-xxxxxxxx`);
  graph.summary.externalDependencies = graph.externalDependencies.length;
  const serialized = `${JSON.stringify(graph, null, 2)}\\n`;
  assert.ok(Buffer.byteLength(serialized) > DEFAULT_MAX_DURABLE_BYTES);
  assert.ok(Buffer.byteLength(serialized) < DEFAULT_MAX_GENERATED_CACHE_BYTES);
  await safeWriteMemoryFile(root, 'project-graph.json', serialized);
  const loaded = await loadProjectGraph(root);
  assert.equal(loaded.summary.externalDependencies, 42000);
  const current = await status(root);
  assert.equal(current.graphHealth.available, true);
  assert.equal(current.graphHealth.current, true);
  assert.equal(current.evidenceHealth.state, 'healthy');
});
""")

# Review mutation regression + CLI behavior.
Path('tests/evaluation-review.test.js').write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scanProject } from '../src/core.js';
import { captureEvaluation, reviewEvaluation, getEvaluation, buildEvaluationReport } from '../src/evaluation.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-eval-review-'));
  await fs.writeFile(path.join(root, 'package.json'), '{\"type\":\"module\"}');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const value = 1;\\n');
  await scanProject(root);
  return root;
}

function immutableSnapshot(record) {
  return JSON.stringify({ subject: record.subject, source: record.source, protocol: record.protocol, repository: record.repository, task: record.task, measurements: record.measurements, stress: record.stress, policy: record.policy });
}

test('post-hoc human review changes only review evidence and contributes to human usefulness metrics', async () => {
  const root = await fixture();
  const captured = await captureEvaluation(root, { sourceKind: 'external-real', repositoryClass: 'library', taskKind: 'review', session: 'none' });
  const before = immutableSnapshot(captured);
  const reviewed = await reviewEvaluation(root, captured.id.slice(0, 12), {
    reviewOutcome: 'pass', reviewProvenance: 'human', falsePositiveFindings: 0, missedFindings: 0,
    nextActionRating: 'useful', handoffRating: 'unknown',
  });
  assert.equal(immutableSnapshot(reviewed), before);
  assert.equal(reviewed.review.provenance, 'human');
  assert.equal(reviewed.review.nextActionRating, 'useful');
  assert.match(reviewed.review.reviewedAt, /^\\d{4}-/);
  const stored = await getEvaluation(root, captured.id);
  assert.equal(stored.review.provenance, 'human');
  const report = await buildEvaluationReport(root);
  assert.equal(report.reviewedUsefulness.provenance.human, 1);
  assert.equal(report.reviewedUsefulness.human.nextActionUsefulRate, 1);
});

test('post-hoc review is one-time and concurrent writers cannot overwrite reviewer provenance', async () => {
  const root = await fixture();
  const captured = await captureEvaluation(root, { sourceKind: 'external-real', repositoryClass: 'library', taskKind: 'audit', session: 'none' });
  const results = await Promise.allSettled([
    reviewEvaluation(root, captured.id, { reviewOutcome: 'pass', reviewProvenance: 'human' }),
    reviewEvaluation(root, captured.id, { reviewOutcome: 'partial', reviewProvenance: 'agent' }),
  ]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(results.filter((item) => item.status === 'rejected').length, 1);
  const stored = await getEvaluation(root, captured.id);
  assert.ok(['human', 'agent'].includes(stored.review.provenance));
  await assert.rejects(() => reviewEvaluation(root, captured.id, { reviewOutcome: 'pass', reviewProvenance: 'human' }), /already reviewed/i);
});

test('CLI evaluate review performs explicit post-hoc review', async () => {
  const root = await fixture();
  const captured = await captureEvaluation(root, { sourceKind: 'external-real', repositoryClass: 'library', taskKind: 'review', session: 'none' });
  const cli = path.resolve('src/cli-entry.js');
  const result = spawnSync(process.execPath, [cli, 'evaluate', 'review', captured.id.slice(0, 12), '--review-outcome', 'pass', '--review-provenance', 'agent', '--next-action-rating', 'useful', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const reviewed = JSON.parse(result.stdout);
  assert.equal(reviewed.review.outcome, 'pass');
  assert.equal(reviewed.review.provenance, 'agent');
  assert.equal(reviewed.review.nextActionRating, 'useful');
});
""")

# Extend MCP tests for review surface and one-time provenance mutation.
p=Path('tests/evaluation-mcp.test.js'); t=p.read_text()
t=t.replace("    assert.ok(!tools.some((tool) => tool.name === 'capture_project_evaluation'));\n", "    assert.ok(!tools.some((tool) => tool.name === 'capture_project_evaluation'));\n    assert.ok(!tools.some((tool) => tool.name === 'review_project_evaluation'));\n",1)
t=t.replace("    assert.ok(tools.some((tool) => tool.name === 'capture_project_evaluation'));\n", "    assert.ok(tools.some((tool) => tool.name === 'capture_project_evaluation'));\n    assert.ok(tools.some((tool) => tool.name === 'review_project_evaluation'));\n",1)
needle="""    const invalidReview = await server.waitFor((message) => message.id === 7);
    assert.equal(invalidReview.result.isError, true);
    assert.match(invalidReview.result.content[0].text, /review-provenance human or agent/i);
"""
replacement=needle+"""
    server.send({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'review_project_evaluation', arguments: {
      id: captured.result.structuredContent.id.slice(0, 12), reviewOutcome: 'pass', reviewProvenance: 'agent', nextActionRating: 'useful',
    } } });
    const reviewed = await server.waitFor((message) => message.id === 8);
    assert.equal(reviewed.result.structuredContent.review.provenance, 'agent');
    assert.equal(reviewed.result.structuredContent.review.nextActionRating, 'useful');

    server.send({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'review_project_evaluation', arguments: {
      id: captured.result.structuredContent.id, reviewOutcome: 'pass', reviewProvenance: 'human',
    } } });
    const duplicateReview = await server.waitFor((message) => message.id === 9);
    assert.equal(duplicateReview.result.isError, true);
    assert.match(duplicateReview.result.content[0].text, /already reviewed/i);
"""
if needle not in t: raise SystemExit('MCP test review anchor missing')
p.write_text(t.replace(needle,replacement,1))

# Update CLI test help expectation.
p=Path('tests/evaluation.test.js'); t=p.read_text().replace('/evaluate <capture\\|list\\|show\\|report>/i','/evaluate <capture\\|review\\|list\\|show\\|report>/i')
p.write_text(t)

# Documentation and changelog.
p=Path('docs/EVALUATION.md'); t=p.read_text()
marker='\n## Runtime contract\n'
insert="""
## Post-hoc usefulness review

Capture and review are separate operations. Field runs should normally be captured as `unreviewed`, then rated later by an explicit reviewer:

```bash
cmi evaluate review <id> \\
  --review-outcome pass \\
  --review-provenance human \\
  --next-action-rating useful \\
  --handoff-rating useful \\
  --false-positive-findings 0 \\
  --missed-findings 0
```

A review is one-time. CMI serializes competing review writers with an owner-tagged lease and refuses to overwrite an existing review. The review operation changes only the `review` block; captured repository measurements, source/protocol class, stress evidence, subject revision, and task identity remain immutable. Human and agent review metrics continue to aggregate separately.

Generated project index/graph caches use a larger bounded read ceiling than 1 MB durable evaluation/change/session records. This prevents large repositories from writing a graph that CMI cannot subsequently read while preserving finite cache reads.
"""
if marker not in t: raise SystemExit('evaluation docs runtime marker missing')
p.write_text(t.replace(marker,insert+marker,1))

p=Path('docs/MCP.md'); t=p.read_text()
old='- `capture_project_evaluation` — persist one bounded anonymized evaluation record with explicit source/protocol/reviewer provenance.\n'
if old in t:
    t=t.replace(old,old+'- `review_project_evaluation` — attach one explicit human or agent post-hoc review to an unreviewed evaluation without changing captured measurements.\n',1)
else:
    # Append near evaluation write mention if exact bullet text differs.
    marker='Session-continuation write tools add:\n'
    if marker in t: t=t.replace(marker,'Evaluation write tools add `capture_project_evaluation` and one-time `review_project_evaluation` when write mode is enabled.\n\n'+marker,1)
p.write_text(t)

p=Path('ROADMAP.md'); t=p.read_text()
needle='- [ ] Collect human-reviewed usefulness data for next actions, handoffs, false positives, and missed findings.\n'
if needle in t:
    t=t.replace(needle,'- [x] Add one-time post-hoc human/agent evaluation review with serialized provenance-safe mutation.\n'+needle,1)
p.write_text(t)

p=Path('CHANGELOG.md'); t=p.read_text(); marker='## [Unreleased]\n'
bullet='\n- Fixed large generated graph caches being unreadable through the 1 MB durable-record ceiling; generated project caches now use a separate finite read ceiling.\n- Added one-time post-hoc evaluation review so human/agent usefulness can be rated after capture without mutating captured measurements or overwriting reviewer provenance.\n'
if marker not in t: raise SystemExit('changelog marker missing')
if 'large generated graph caches being unreadable' not in t: t=t.replace(marker,marker+bullet,1)
p.write_text(t)

from pathlib import Path

source = Path('.github/workflows/v081-hardening-apply.yml').read_text()
start = source.index("          from pathlib import Path\n", source.index("python3 - <<'PY'"))
end = source.index("\n          PY\n", start)
patch = source[start:end]
patch = '\n'.join(line[10:] if line.startswith('          ') else line for line in patch.splitlines())

quotes = chr(39) * 3
bad = quotes + ').replace("{ recursive: True } if False else { recursive: true }", "{ recursive: true }")'
good = quotes + '.replace("{ recursive: True } if False else { recursive: true }", "{ recursive: true }"))'
if bad not in patch:
    raise SystemExit('expected lease-lock recovery anchor not found')
patch = patch.replace(bad, good, 1)

old_regex = "out, n = re.subn(pattern, repl, text, count=1, flags=flags)"
new_regex = "out, n = re.subn(pattern, lambda _match: repl, text, count=1, flags=flags)"
if old_regex not in patch:
    raise SystemExit('expected regex helper anchor not found')
patch = patch.replace(old_regex, new_regex, 1)

status_start = patch.index('text = regex(text, r"async function countEntries')
status_pattern_end = patch.index('", r', status_start)
replacement_prefix = 'text = regex(text, r"async function countEntries\\(filePath\\).*?\\n\\nexport async function doctor'
patch = patch[:status_start] + replacement_prefix + patch[status_pattern_end:]

patch = patch.replace("Path('.github/workflows/v081-hardening-apply.yml').unlink()", "Path('.github/workflows/v081-hardening-apply.yml').unlink(missing_ok=True)")
Path('/tmp/v081-apply.py').write_text(patch)
exec(compile(patch, '/tmp/v081-apply.py', 'exec'), {'__name__': '__main__'})

def replace_once(path, old, new, label):
    text = Path(path).read_text()
    if old not in text:
        raise SystemExit(f'missing migration anchor: {label}')
    Path(path).write_text(text.replace(old, new, 1))

replace_once(
    'src/stale.js',
    """    const metadata = await replaceMetadata(root, target, async (meta) => ({
      ...meta,
      schemaVersion: 1,
      lifecycle: {
        state: normalizedState,
        changedAt,
        changedBy,
        reason,
        ...(supersededBy ? { supersededBy } : {}),
      },
    }));""",
    """    const metadata = await replaceMetadata(root, target, async (meta) => ({
      ...meta,
      schemaVersion: 1,
      ...(normalizedState === 'active' ? { reviewedAt: changedAt, reviewedBy: changedBy, reviewReason: reason } : {}),
      lifecycle: {
        state: normalizedState,
        changedAt,
        changedBy,
        reason,
        ...(supersededBy ? { supersededBy } : {}),
      },
    }));""",
    'active lifecycle semantic review',
)

replace_once(
    'tests/core.test.js',
    "import { checkStaleMemory, refreshMemory } from '../src/stale.js';",
    "import { checkStaleMemory, refreshMemory, loadTrackedMemory, setMemoryLifecycle } from '../src/stale.js';",
    'core stale imports',
)

replace_once(
    'tests/core.test.js',
    """  const refreshed = await refreshMemory(root, metadata.id.slice(0, 8), { reviewedBy: 'tester', reason: 'Verified change.' });
  assert.equal(refreshed.updated, 1);
  health = await checkStaleMemory(root);
  assert.equal(health.entries[0].reviewedBy, 'tester');
  assert.equal(health.counts.fresh, 1);""",
    """  const refreshed = await refreshMemory(root, metadata.id.slice(0, 8), { reviewedBy: 'tester', reason: 'Refresh source fingerprint only.' });
  assert.equal(refreshed.updated, 1);
  assert.equal(refreshed.semanticReview, false);
  health = await checkStaleMemory(root);
  assert.equal(health.entries[0].reviewedBy, null);
  assert.equal(health.counts.fresh, 1);
  const tracked = (await loadTrackedMemory(root)).find((entry) => entry.metadata?.id === metadata.id);
  assert.equal(tracked.metadata.sourceRefreshedBy, 'tester');
  assert.equal(tracked.metadata.reviewedBy, undefined);""",
    'source refresh contract',
)

replace_once(
    'tests/core.test.js',
    """  await refreshMemory(root, 'all');
  assert.equal((await status(root)).healthy, true);""",
    """  await refreshMemory(root, 'all');
  assert.equal((await status(root)).healthy, false);
  const legacy = (await loadTrackedMemory(root)).find((entry) => entry.text === 'Legacy fact.');
  assert.ok(legacy?.metadata?.id);
  await setMemoryLifecycle(root, legacy.metadata.id, 'active', { changedBy: 'tester', reason: 'Explicitly reviewed legacy fact.' });
  assert.equal((await status(root)).healthy, true);""",
    'legacy explicit review contract',
)

test_path = Path('tests/v081-trust-security.test.js')
test_text = test_path.read_text()
old_import = "import { refreshMemory, loadTrackedMemory } from '../src/stale.js';"
new_import = "import { refreshMemory, loadTrackedMemory, checkStaleMemory, setMemoryLifecycle } from '../src/stale.js';"
if old_import not in test_text:
    raise SystemExit('missing v081 stale import anchor')
test_text = test_text.replace(old_import, new_import, 1)
marker = "test('lease heartbeat prevents live lock reclamation and old owner cannot delete replacement lock', async () => {"
if marker not in test_text:
    raise SystemExit('missing v0.8.1 semantic-review test insertion anchor')
extra = """test('explicit active lifecycle review updates semantic review provenance separately from source refresh', async () => {
  const root = await project('cmi-v081-semantic-review-');
  const source = path.join(root, 'src', 'policy.js');
  await fs.writeFile(source, 'export const policy = 1;\\n');
  await scanProject(root);
  const entry = await remember(root, 'fact', 'Policy remains reviewed only after explicit attestation.', { sources: ['src/policy.js'] });
  await fs.writeFile(source, 'export const policy = 2;\\n');
  await refreshMemory(root, entry.id, { refreshedBy: 'scanner', reason: 'Refresh fingerprints.' });
  let tracked = (await loadTrackedMemory(root)).find((item) => item.metadata?.id === entry.id);
  assert.equal(tracked.metadata.reviewedAt, undefined);
  const review = await setMemoryLifecycle(root, entry.id, 'active', { changedBy: 'reviewer', reason: 'Reviewed semantics after source update.' });
  assert.equal(review.state, 'active');
  tracked = (await loadTrackedMemory(root)).find((item) => item.metadata?.id === entry.id);
  assert.equal(tracked.metadata.reviewedBy, 'reviewer');
  assert.equal(tracked.metadata.reviewReason, 'Reviewed semantics after source update.');
  const health = await checkStaleMemory(root);
  assert.equal(health.counts.fresh, 1);
});

"""
test_path.write_text(test_text.replace(marker, extra + marker, 1))

replace_once(
    'CHANGELOG.md',
    "- `refresh-memory` now refreshes source fingerprints without asserting semantic review metadata.\n",
    "- `refresh-memory` now refreshes source fingerprints without asserting semantic review metadata; an explicit `memory-state <id> active --reason ...` review records `reviewedAt`, `reviewedBy`, and `reviewReason`.\n",
    'changelog review wording',
)

for helper in [
    '.github/workflows/v081-hardening-apply.yml',
    '.github/workflows/v081-hardening-recover.yml',
    '.github/workflows/v081-hardening-recover2.yml',
    '.github/workflows/v081-hardening-recover3.yml',
    '.github/workflows/v081-hardening-recover4.yml',
    '.github/workflows/v081-hardening-recover5.yml',
    '.github/workflows/v081-hardening-recover6.yml',
    '.github/workflows/v081-hardening-recover7.yml',
    '.github/scripts/v081-finalize.py',
]:
    Path(helper).unlink(missing_ok=True)

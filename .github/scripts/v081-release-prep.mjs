import fs from 'node:fs/promises';

async function replaceExact(file, oldText, newText, label) {
  const current = await fs.readFile(file, 'utf8');
  if (!current.includes(oldText)) throw new Error(`Missing release-prep anchor: ${label}`);
  await fs.writeFile(file, current.replace(oldText, newText), 'utf8');
}

const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (packageJson.version !== '0.8.0') throw new Error(`Expected package version 0.8.0, got ${packageJson.version}`);
packageJson.version = '0.8.1';
await fs.writeFile('package.json', `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

await replaceExact('src/version.js', "export const VERSION = '0.8.0';", "export const VERSION = '0.8.1';", 'source version');

await replaceExact(
  'CHANGELOG.md',
  '## [Unreleased]\n\n### Fixed\n',
  '## [Unreleased]\n\nNo unreleased changes yet.\n\n## [0.8.1] - 2026-08-08\n\n### Fixed\n',
  'v0.8.1 changelog heading',
);

await replaceExact(
  'README.md',
  '`v0.8.0` is the current source release line for **Behavioral Change Intelligence, trust hardening, and Session Continuation Intelligence**. It builds on the Change Intelligence Loop with stale-aware retrieval, graph freshness checks, reviewed memory lifecycle, runtime-validated change records, local writer serialization, verification provenance, sample-sensitive behavioral calibration, persistent cross-session findings, prioritized next actions, and durable handoffs. The npm badge above is the authoritative indicator of the version currently published to the registry.',
  '`v0.8.1` is the current source release line. It hardens the v0.8 intelligence layer with complete-vs-truncated graph health, stale-impact fail-closed behavior, project-local durable-storage guards, owner-tagged lease locking, broader best-effort secret detection, and a strict separation between source-fingerprint refresh and semantic review. It retains the Behavioral Change Intelligence and Session Continuation capabilities introduced in v0.8.0. The npm badge above is the authoritative indicator of the version currently published to the registry.',
  'README current status',
);

await replaceExact(
  'README.md',
  'In v0.8.0, durable memory separates **lifecycle** from **freshness**.',
  'In v0.8.1, durable memory keeps **lifecycle**, **source freshness**, and **semantic review provenance** distinct.',
  'README memory semantics',
);

await replaceExact(
  'README.md',
  '`demote` is the default: stale/review evidence remains visible but is strongly down-ranked and labeled. `exclude` is strict-current mode. `include` is intended for explicit historical inspection. See [Durable Memory Lifecycle](docs/MEMORY_LIFECYCLE.md).',
  '`demote` is the default: stale/review evidence remains visible but is strongly down-ranked and labeled. `exclude` is strict-current mode. `include` is intended for explicit historical inspection. `cmi refresh-memory` refreshes source/project fingerprints only; use an explicit `cmi memory-state <id> active --reason ... --changed-by ...` attestation when knowledge has actually been semantically reviewed. See [Durable Memory Lifecycle](docs/MEMORY_LIFECYCLE.md).',
  'README refresh distinction',
);

await replaceExact(
  'README.md',
  'cmi refresh-memory <id|all> [--reviewed-by name] [--reason text]',
  'cmi refresh-memory <id|all> [--refreshed-by name] [--reason text]',
  'README refresh CLI',
);

await replaceExact(
  'README.md',
  '- Durable memory append/refresh/lifecycle mutations share a local write lock to reduce concurrent-writer loss.',
  '- Durable storage rejects a symlinked `.codex-memory` root and unsafe durable read/write targets; bounded reads use opened-handle identity checks where applicable.\n- Durable memory append/refresh/lifecycle mutations share owner-tagged heartbeat leases with owner-checked cleanup to reduce concurrent-writer loss.',
  'README storage security',
);

await replaceExact(
  'README.md',
  '- User-supplied session/finding/change durable text is secret-pattern guarded, but CMI is not a complete secret scanner.',
  '- User-supplied durable text receives best-effort secret-pattern/credential-shape checks, but CMI is not DLP, a complete secret scanner, or a security boundary.',
  'README secret guard wording',
);

await replaceExact(
  'docs/MEMORY_LIFECYCLE.md',
  '`cmi refresh-memory <id>` is for an **active entry that was actually reviewed against current evidence**.\n\nRefreshing does not mean “make this true again.” It updates source/project fingerprints and review metadata after review.\n\nCMI refuses to refresh one inactive entry. Reactivate it explicitly first if review determines that it should again drive current work.',
  '`cmi refresh-memory <id>` refreshes **source/project freshness evidence only**. It updates source/project fingerprints plus `sourceRefreshedAt`, `sourceRefreshedBy`, and `sourceRefreshReason`; it does not assert that the knowledge was semantically reviewed.\n\nSemantic review is explicit. After a reviewer has checked the meaning of an active entry against current evidence, use `cmi memory-state <id> active --reason "..." --changed-by reviewer` to record `reviewedAt`, `reviewedBy`, and `reviewReason`.\n\nCMI refuses to refresh one inactive entry. Reactivate it explicitly only when review determines that it should again drive current work.',
  'memory lifecycle refresh semantics',
);

await replaceExact(
  'docs/MEMORY_LIFECYCLE.md',
  '`remember`, reviewed refresh, and lifecycle mutation share one local project write lock. This prevents one writer from replacing a Markdown file using an older read while another writer is appending new durable knowledge.\n\nThe lock lives under the already ignored `.codex-memory/snapshots/` directory, is process-local metadata only, and is removed after the mutation. A lock older than the implementation\'s fixed short safety window can be reclaimed so a crashed writer does not permanently block the project.',
  '`remember`, source-fingerprint refresh, and lifecycle mutation share one local project write lease. This prevents one writer from replacing a Markdown file using an older read while another writer is appending new durable knowledge.\n\nThe lease lives under the already ignored `.codex-memory/snapshots/` directory, carries an owner ID, is heartbeat-refreshed while live, and is removed only by the matching owner. Stale reclamation rechecks owner identity so an old writer cannot delete a replacement lease.',
  'memory lifecycle lease semantics',
);

await replaceExact(
  'docs/MEMORY_LIFECYCLE.md',
  'observed current project evidence\n→ human or explicitly reviewed agent reasoning\n→ refresh active knowledge\n   OR deprecate / reject / supersede it\n→ future retrieval follows the reviewed state',
  'observed current project evidence\n→ refresh source fingerprints when needed\n→ human or explicitly reviewed agent reasoning\n→ explicitly attest active semantic review\n   OR deprecate / reject / supersede it\n→ future retrieval follows freshness + reviewed lifecycle evidence',
  'memory lifecycle review flow',
);

await fs.rm('.github/scripts/v081-release-prep.mjs', { force: true });
await fs.rm('.github/workflows/v081-release-prep.yml', { force: true });

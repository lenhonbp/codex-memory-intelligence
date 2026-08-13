import crypto from 'node:crypto';

export const LEGACY_PORTABLE_SCHEMA_VERSION = 2;
export const PORTABLE_SCHEMA_VERSION = 3;
export const PORTABLE_MANIFEST_INTEGRITY_COVERAGE = 'manifest-provenance-v1';
export const PORTABLE_MANIFEST_TRUST_BOUNDARY = 'observed identity and compatibility evidence; not authenticated provenance';

const SUPPORTED = new Set([LEGACY_PORTABLE_SCHEMA_VERSION, PORTABLE_SCHEMA_VERSION]);
const LEGACY_UNBOUND_FIELDS = [
  'cmi.invocationKind',
  'cmi.packageRoot',
  'project.location',
  'evidence.health',
  'creation',
  'provenance',
];

function canonical(value) { return JSON.stringify(value); }
function digestText(value) { return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`; }

export function isSupportedPortableSchemaVersion(value) {
  return SUPPORTED.has(value);
}

export function portableManifestIntegrityMaterial(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    kind: manifest.kind,
    format: manifest.format,
    cmi: manifest.cmi,
    project: manifest.project,
    evidence: manifest.evidence,
    creation: manifest.creation,
    provenance: manifest.provenance,
  };
}

export function createPortableManifestIntegrity(manifest) {
  if (manifest.schemaVersion !== PORTABLE_SCHEMA_VERSION) return null;
  return {
    algorithm: 'sha256',
    coverage: PORTABLE_MANIFEST_INTEGRITY_COVERAGE,
    digest: digestText(canonical(portableManifestIntegrityMaterial(manifest))),
  };
}

export function validatePortableManifestIntegrity(manifest) {
  if (manifest.schemaVersion === LEGACY_PORTABLE_SCHEMA_VERSION) {
    if (manifest.integrity !== undefined) return { valid: false, code: 'CMI_PORTABLE_MANIFEST_INVALID', reason: 'Portable Evidence v2 does not define a manifest integrity block.' };
    return { valid: true, legacy: true };
  }
  if (manifest.schemaVersion !== PORTABLE_SCHEMA_VERSION) return { valid: false, code: 'CMI_PORTABLE_SCHEMA_UNSUPPORTED', reason: `Unsupported portable manifest schema ${manifest.schemaVersion || 'unknown'}.` };
  const expected = createPortableManifestIntegrity(manifest);
  if (!manifest.integrity || manifest.integrity.algorithm !== 'sha256' || manifest.integrity.coverage !== PORTABLE_MANIFEST_INTEGRITY_COVERAGE || manifest.integrity.digest !== expected.digest) {
    return { valid: false, code: 'CMI_PORTABLE_MANIFEST_CORRUPT', reason: 'Portable manifest provenance integrity digest does not verify.' };
  }
  return { valid: true, legacy: false };
}

export function portableManifestIntegrityView(manifest) {
  if (manifest.schemaVersion === LEGACY_PORTABLE_SCHEMA_VERSION) {
    return {
      state: 'legacy-partial',
      coverage: 'core-identity-v2',
      manifestProvenanceBound: false,
      originBound: false,
      authenticated: false,
      unboundFields: [...LEGACY_UNBOUND_FIELDS],
      statement: 'Portable Evidence v2 verifies core evidence identity and artifact digests, but manifest provenance metadata outside the v2 identity material is not integrity-bound.',
    };
  }
  return {
    state: 'verified',
    coverage: PORTABLE_MANIFEST_INTEGRITY_COVERAGE,
    manifestProvenanceBound: true,
    originBound: true,
    authenticated: false,
    unboundFields: [],
    statement: 'Portable Evidence v3 integrity-binds manifest provenance metadata in addition to deterministic core evidence identity; neither digest authenticates source authorship.',
  };
}

export function portableManifestOriginBound(manifest) {
  return manifest.schemaVersion === PORTABLE_SCHEMA_VERSION;
}

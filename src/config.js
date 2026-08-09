import { safeReadMemoryJson } from './storage.js';

export const CONFIG_SCHEMA_VERSION = 4;
export const DEFAULT_CONFIG = {
  version: CONFIG_SCHEMA_VERSION,
  maxFileBytes: 1_000_000,
  maxSourceBytes: 512_000,
  maxGraphFiles: 5_000,
  staleAfterDays: 90,
  includeHidden: false,
  incrementalScan: true,
  workspaceDetection: true,
  ignorePatterns: [],
};

export function normalizeConfig(current = {}) {
  if (current === null || current === undefined) current = {};
  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    const error = new Error('Project configuration must be a JSON object.');
    error.code = 'CMI_CONFIG_INVALID';
    throw error;
  }
  if (current.version !== undefined) {
    if (!Number.isInteger(current.version) || current.version < 1) {
      const error = new Error('Project configuration version must be a positive integer.');
      error.code = 'CMI_CONFIG_INVALID';
      throw error;
    }
    if (current.version > CONFIG_SCHEMA_VERSION) {
      const error = new Error(`Unsupported project configuration version ${current.version}; this CMI version supports up to ${CONFIG_SCHEMA_VERSION}. Use a compatible/newer CMI version, or preserve and explicitly remove the configuration before reinitializing.`);
      error.code = 'CMI_CONFIG_VERSION_UNSUPPORTED';
      throw error;
    }
  }
  const ignorePatterns = Array.isArray(current.ignorePatterns) ? current.ignorePatterns.map(String) : [];
  return {
    ...DEFAULT_CONFIG,
    ...current,
    ignorePatterns,
    version: Math.max(DEFAULT_CONFIG.version, Number(current.version) || 0),
  };
}

export async function readStoredConfig(root) {
  try {
    return await safeReadMemoryJson(root, 'config.json', { optional: true });
  } catch (cause) {
    if (cause?.code === 'CMI_UNSAFE_STORAGE') throw cause;
    const error = new Error('Project configuration exists but is not valid JSON or cannot be safely read; no defaults were written.');
    error.code = 'CMI_CONFIG_INVALID';
    error.causeCode = cause?.code || 'invalid-json';
    throw error;
  }
}

export async function inspectProjectConfig(root) {
  let stored = null;
  try {
    stored = await readStoredConfig(root);
    const config = normalizeConfig(stored);
    return {
      available: stored !== null,
      state: stored === null ? 'defaulted' : 'current',
      healthy: true,
      usable: true,
      current: true,
      storedVersion: Number.isInteger(stored?.version) ? stored.version : null,
      supportedVersion: CONFIG_SCHEMA_VERSION,
      code: null,
      reason: stored === null ? 'Project configuration is absent; current defaults apply.' : 'Project configuration is valid and supported.',
      config,
    };
  } catch (error) {
    return {
      available: true,
      state: error?.code === 'CMI_CONFIG_VERSION_UNSUPPORTED' ? 'unsupported' : 'invalid',
      healthy: false,
      usable: false,
      current: false,
      storedVersion: Number.isInteger(stored?.version) ? stored.version : null,
      supportedVersion: CONFIG_SCHEMA_VERSION,
      code: error?.code || 'CMI_CONFIG_INVALID',
      reason: error.message,
      config: null,
    };
  }
}

export async function readProjectConfig(root) {
  return normalizeConfig(await readStoredConfig(root));
}

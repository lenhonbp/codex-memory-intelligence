import fs from 'node:fs/promises';
import path from 'node:path';

export const CMI_PACKAGE_NAME = 'codex-memory-intelligence';
export const CMI_LOCAL_ENTRYPOINT = `node_modules/${CMI_PACKAGE_NAME}/src/cli-entry.js`;

function slash(value) {
  return String(value).replace(/\\/g, '/');
}

async function readPackage(target) {
  try {
    const value = JSON.parse(await fs.readFile(target, 'utf8'));
    const bin = typeof value.bin === 'string' ? value.bin : value.bin?.cmi;
    if (value.name !== CMI_PACKAGE_NAME || bin !== 'src/cli-entry.js') return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * Resolve only a CMI package installed in, or above, the activated project.
 * This intentionally does not inspect PATH, npm's cache, or a registry.
 */
export async function findLocalCliEntrypoint(projectRoot) {
  let current = path.resolve(projectRoot);
  while (true) {
    const packageRoot = path.join(current, 'node_modules', CMI_PACKAGE_NAME);
    const packageInfo = await readPackage(path.join(packageRoot, 'package.json'));
    if (packageInfo) {
      const entrypoint = path.join(packageRoot, 'src', 'cli-entry.js');
      try {
        const stat = await fs.stat(entrypoint);
        if (stat.isFile()) {
          return {
            packageName: packageInfo.name,
            packageVersion: packageInfo.version || null,
            packageRoot,
            entrypoint,
            relativeEntrypoint: slash(path.relative(path.resolve(projectRoot), entrypoint)),
          };
        }
      } catch {
        // Continue searching parent node_modules directories.
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function localCliInvocation(relativeEntrypoint = CMI_LOCAL_ENTRYPOINT) {
  const relative = slash(relativeEntrypoint).replace(/^\.\//, '');
  return `node "./${relative}"`;
}

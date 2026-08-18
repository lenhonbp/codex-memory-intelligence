import fs from 'node:fs/promises';
import path from 'node:path';

export const CMI_PACKAGE_NAME = 'codex-memory-intelligence';
export const CMI_LOCAL_ENTRYPOINT = `node_modules/${CMI_PACKAGE_NAME}/src/cli-entry.js`;
export const CMI_LOCAL_MCP_ENTRYPOINT = `node_modules/${CMI_PACKAGE_NAME}/src/mcp-entry.js`;

function slash(value) {
  return String(value).replace(/\\/g, '/');
}

async function lstatIfPresent(target) {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function assertSafeLocalPath(target, kind, label) {
  const stat = await lstatIfPresent(target);
  if (!stat) throw new Error(`Local CMI package is malformed: missing ${label}.`);
  if (stat.isSymbolicLink() || (kind === 'directory' ? !stat.isDirectory() : !stat.isFile())) {
    throw new Error(`Local CMI package has an unsafe ${label}; activation will not follow or execute it.`);
  }
}

async function readPackage(packageRoot) {
  const packagePath = path.join(packageRoot, 'package.json');
  await assertSafeLocalPath(packagePath, 'file', 'package.json');
  let value;
  try {
    value = JSON.parse(await fs.readFile(packagePath, 'utf8'));
  } catch {
    throw new Error('Local CMI package has a malformed package.json; activation will not fall back to registry CMI.');
  }
  if (value.name !== CMI_PACKAGE_NAME
    || typeof value.bin !== 'object'
    || value.bin?.cmi !== 'src/cli-entry.js'
    || value.bin?.['cmi-mcp'] !== 'src/mcp-entry.js') {
    throw new Error('Local CMI package identity or executable metadata is invalid; activation will not fall back to registry CMI.');
  }
  return value;
}

/**
 * Resolve only a CMI package installed in, or above, the activated project.
 * This intentionally does not inspect PATH, npm's cache, or a registry.
 */
export async function findLocalCliEntrypoint(projectRoot) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  let current = resolvedProjectRoot;
  while (true) {
    const nodeModulesRoot = path.join(current, 'node_modules');
    const packageRoot = path.join(nodeModulesRoot, CMI_PACKAGE_NAME);
    const packageStat = await lstatIfPresent(packageRoot);
    if (packageStat) {
      const nodeModulesStat = await lstatIfPresent(nodeModulesRoot);
      if (!nodeModulesStat || nodeModulesStat.isSymbolicLink() || !nodeModulesStat.isDirectory()) {
        throw new Error('Local node_modules location is unsafe; activation will not search it or fall back to registry CMI.');
      }
      if (packageStat.isSymbolicLink() || !packageStat.isDirectory()) {
        throw new Error('Local CMI package location is unsafe; activation will not follow it or fall back to registry CMI.');
      }
      const packageInfo = await readPackage(packageRoot);
      const sourceRoot = path.join(packageRoot, 'src');
      const entrypoint = path.join(sourceRoot, 'cli-entry.js');
      const mcpEntrypoint = path.join(sourceRoot, 'mcp-entry.js');
      await assertSafeLocalPath(sourceRoot, 'directory', 'src directory');
      await assertSafeLocalPath(entrypoint, 'file', 'CLI entrypoint');
      await assertSafeLocalPath(mcpEntrypoint, 'file', 'MCP entrypoint');
      return {
        packageName: packageInfo.name,
        packageVersion: packageInfo.version || null,
        packageRoot,
        entrypoint,
        mcpEntrypoint,
        relativeEntrypoint: slash(path.relative(resolvedProjectRoot, entrypoint)),
        relativeMcpEntrypoint: slash(path.relative(resolvedProjectRoot, mcpEntrypoint)),
      };
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

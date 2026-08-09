import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const releaseScript = path.join(root, 'scripts', 'verify-release.js');

function runReleaseCheck(cwd, tag) {
  return spawnSync(process.execPath, [path.join(cwd, 'scripts', 'verify-release.js'), tag], { cwd, encoding: 'utf8' });
}

function makeCandidate() {
  const candidate = fs.mkdtempSync(path.join(os.tmpdir(), 'cmi-release-check-'));
  fs.mkdirSync(path.join(candidate, 'scripts'));
  fs.mkdirSync(path.join(candidate, 'src'));
  fs.copyFileSync(path.join(root, 'package.json'), path.join(candidate, 'package.json'));
  fs.copyFileSync(path.join(root, 'src', 'version.js'), path.join(candidate, 'src', 'version.js'));
  fs.copyFileSync(path.join(root, 'CHANGELOG.md'), path.join(candidate, 'CHANGELOG.md'));
  fs.copyFileSync(releaseScript, path.join(candidate, 'scripts', 'verify-release.js'));
  return candidate;
}

test('release metadata check accepts the candidate and rejects tag/version/changelog drift', () => {
  const candidate = makeCandidate();
  try {
    const pass = runReleaseCheck(candidate, `v${packageJson.version}`);
    assert.equal(pass.status, 0, pass.stderr);
    assert.match(pass.stdout, new RegExp(`Release metadata verified for v${packageJson.version}`));

    const tagMismatch = runReleaseCheck(candidate, 'v0.10.1');
    assert.notEqual(tagMismatch.status, 0);
    assert.match(`${tagMismatch.stdout}\n${tagMismatch.stderr}`, /does not match package version/);

    const packageMismatch = JSON.parse(fs.readFileSync(path.join(candidate, 'package.json'), 'utf8'));
    packageMismatch.version = '0.10.1';
    fs.writeFileSync(path.join(candidate, 'package.json'), `${JSON.stringify(packageMismatch, null, 2)}\n`);
    const versionMismatch = runReleaseCheck(candidate, 'v0.10.1');
    assert.notEqual(versionMismatch.status, 0);
    assert.match(`${versionMismatch.stdout}\n${versionMismatch.stderr}`, /does not match package\.json/);
    fs.copyFileSync(path.join(root, 'package.json'), path.join(candidate, 'package.json'));

    const changelog = fs.readFileSync(path.join(candidate, 'CHANGELOG.md'), 'utf8');
    fs.writeFileSync(path.join(candidate, 'CHANGELOG.md'), changelog.replace(`## [${packageJson.version}]`, '## [0.10.0-removed]'));
    const missingSection = runReleaseCheck(candidate, `v${packageJson.version}`);
    assert.notEqual(missingSection.status, 0);
    assert.match(`${missingSection.stdout}\n${missingSection.stderr}`, /does not contain/);
  } finally {
    fs.rmSync(candidate, { recursive: true, force: true });
  }
});

test('publish workflow keeps trusted publishing and live-ref guards explicit', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'publish.yml'), 'utf8');
  assert.match(workflow, /tags:\s*\n\s+- "v\*\.\*\.\*"/);
  assert.match(workflow, /branches:\s*\n\s+- "release\/v\*\.\*\.\*"/);
  assert.match(workflow, /contents:\s+write/);
  assert.match(workflow, /id-token:\s+write/);
  assert.match(workflow, /github\.repository == 'lenhonbp\/codex-memory-intelligence'/);
  assert.match(workflow, /github\.ref_type == 'tag' \|\| github\.actor == 'lenhonbp'/);
  assert.match(workflow, /Release branch must point exactly at current main/);
  assert.match(workflow, /npm run release:check/);
  assert.match(workflow, /npm run package:smoke/);
  assert.match(workflow, /npm publish --access public/);
  assert.match(workflow, /git push origin --delete "\$GITHUB_REF_NAME"/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN|npm_[a-z_]*token/i);
});

test('release metadata check has a stable npm-script entry point', () => {
  const scripts = packageJson.scripts;
  assert.equal(scripts['release:check'], 'node scripts/verify-release.js');
  const result = execFileSync(process.execPath, [releaseScript, `v${packageJson.version}`], { cwd: root, encoding: 'utf8' });
  assert.match(result, new RegExp(`Release metadata verified for v${packageJson.version}`));
});

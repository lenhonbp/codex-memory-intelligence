import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const versionSource = fs.readFileSync(new URL('../src/version.js', import.meta.url), 'utf8');
const changelog = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const sourceVersion = versionSource.match(/VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
const tag = process.argv[2] || process.env.GITHUB_REF_NAME || '';

if (!sourceVersion) throw new Error('Unable to read VERSION from src/version.js.');
if (sourceVersion !== packageJson.version) throw new Error(`src/version.js (${sourceVersion}) does not match package.json (${packageJson.version}).`);
if (!changelog.includes(`## [${packageJson.version}]`)) throw new Error(`CHANGELOG.md does not contain a ${packageJson.version} release heading.`);
if (!tag) throw new Error('Release tag is required through GITHUB_REF_NAME or the first argument.');
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) throw new Error(`Release tag is not semantic: ${tag}`);
if (tag !== `v${packageJson.version}`) throw new Error(`Release tag ${tag} does not match package version ${packageJson.version}.`);
console.log(`Release metadata verified for ${tag}.`);

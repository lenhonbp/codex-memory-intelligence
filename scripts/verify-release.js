import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tag = process.argv[2] || process.env.GITHUB_REF_NAME || '';
if (!tag) throw new Error('Release tag is required through GITHUB_REF_NAME or the first argument.');
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) throw new Error(`Release tag is not semantic: ${tag}`);
if (tag !== `v${packageJson.version}`) throw new Error(`Release tag ${tag} does not match package version ${packageJson.version}.`);
console.log(`Release metadata verified for ${tag}.`);

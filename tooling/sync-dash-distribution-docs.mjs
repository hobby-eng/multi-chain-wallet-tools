import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_PROFILES, getToolBuild, profileToolIds } from './build-profiles.mjs';
import { parseKeyDerivationFeatures } from './key-derivation-features.mjs';
import { readReleaseMetadata } from './project-metadata.mjs';
import { TOOL_MANIFESTS } from './tool-manifests.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRepository = 'https://github.com/hobby-eng/multi-chain-wallet-tools';

export function renderDashDistributionDocs(sourceRoot, sourceSha) {
  if (!/^[0-9a-f]{40}$/u.test(sourceSha)) throw new Error('Documentation source must be a full Git commit SHA.');
  const release = readReleaseMetadata(sourceRoot);
  const profile = BUILD_PROFILES['dash-community'];
  const modules = profileToolIds(profile).map((toolId) => {
    const features =
      toolId === 'key-derivation' ? parseKeyDerivationFeatures(profile, []).selected : TOOL_MANIFESTS[toolId].features;
    return `| ${getToolBuild(profile, toolId).documentTitle} | ${features.length === 0 ? 'Base coin support' : features.map((feature) => `\`${feature}\``).join(', ')} |`;
  });
  const values = {
    VERSION: release.version,
    RELEASE_DATE: release.releaseDate,
    SOURCE_SHA: sourceSha,
    MODULE_TABLE: ['| Tool | Build modules |', '| --- | --- |', ...modules].join('\n'),
  };
  const files = new Map();
  for (const name of ['README.md', 'SECURITY.md']) {
    const template = readFileSync(resolve(sourceRoot, 'docs/distributions/dash-community', name), 'utf8');
    const content = template.replace(/\{\{([A-Z_]+)\}\}/gu, (_, key) => {
      if (!Object.hasOwn(values, key)) throw new Error(`Unknown documentation placeholder: ${key}`);
      return values[key];
    });
    files.set(name, content);
  }
  for (const name of ['ATTRIBUTION.md', 'THIRD_PARTY_NOTICES.md', 'LICENSE']) {
    const source = readFileSync(resolve(sourceRoot, name), 'utf8');
    const content = source.replace(/\]\(([^\s)]+)\)/gu, (match, target) => {
      if (target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/iu.test(target)) return match;
      const path = posix.normalize(target);
      return `](${sourceRepository}/blob/${sourceSha}/${path})`;
    });
    files.set(name, content);
  }
  const evidence = {
    sourceRepository,
    sourceCommit: sourceSha,
    sourceVersion: release.version,
    files: Object.fromEntries(
      [...files].map(([name, content]) => [name, createHash('sha256').update(content).digest('hex')]),
    ),
  };
  files.set('documentation-source.json', `${JSON.stringify(evidence, null, 2)}\n`);
  return files;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output' || !args[1]) {
    throw new Error('Usage: node tooling/sync-dash-distribution-docs.mjs --output <distribution-directory>');
  }
  const output = resolve(args[1]);
  if (output === root) throw new Error('Distribution output must not overwrite the canonical source root.');
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const files = renderDashDistributionDocs(root, sourceSha);
  mkdirSync(output, { recursive: true });
  for (const [name, content] of files) writeFileSync(resolve(output, name), content);
  console.log(`Synchronized ${files.size} Dash documentation files from ${sourceSha}.`);
}

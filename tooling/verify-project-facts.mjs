import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_PROFILES, getToolBuild } from './build-profiles.mjs';
import { formatEnglishList, PRODUCT_FACTS, readReleaseMetadata } from './project-metadata.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const release = readReleaseMetadata(root);
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const requireText = (text, expected, label) => {
  if (!text.includes(expected)) throw new Error(`${label} is out of sync; expected: ${expected}`);
};
const integerConstant = (text, name) => {
  const match = text.match(new RegExp(`export const ${name} = (\\d+);`, 'u'));
  if (match === null) throw new Error(`Missing canonical constant ${name}.`);
  return Number(match[1]);
};

const protocol = read('apps/discovery-scanner/src/network-protocol.ts');
const identity = read('apps/discovery-scanner/src/coins/dash/identity-scanner.ts');
const networkOperationCount = [...protocol.matchAll(/^\s*\| \{ operation: '[^']+';/gmu)].length;
const coreBatch = integerConstant(protocol, 'RECOVERY_CORE_ADDRESS_BATCH');
const platformBatch = integerConstant(protocol, 'RECOVERY_PLATFORM_ADDRESS_BATCH');
const identityConcurrency = Number(identity.match(/^const IDENTITY_QUERY_CONCURRENCY = (\d+);/mu)?.[1]);
if (!Number.isSafeInteger(identityConcurrency)) throw new Error('Missing canonical Identity concurrency.');

const rootReadme = read('README.md');
const audit = read('SECURITY_AUDIT.md');
const architecture = read('docs/ARCHITECTURE.md');
const dashReport = read('DASH_IMPLEMENTATION.md');
const scannerSecurity = read('apps/discovery-scanner/SECURITY.md');
const scannerView = read('apps/discovery-scanner/src/view.ts');
const scannerRegistry = read('apps/discovery-scanner/src/coins/index.ts');
const derivationRegistry = read('packages/coin-protocols/src/coins/registry.ts');
const buildProfiles = read('tooling/build-profiles.mjs');

requireText(rootReadme, formatEnglishList(PRODUCT_FACTS.multiChainCoins), 'README Multi-Chain coin list');
for (const capability of PRODUCT_FACTS.dashCommunityCapabilities) {
  requireText(audit, capability, 'Dash Community capability list');
}
for (const [index, coinId] of PRODUCT_FACTS.multiChainCoinIds.entries()) {
  const adapterName = `${coinId.toUpperCase()}_RECOVERY_ADAPTER`;
  requireText(scannerRegistry, adapterName, `Multi-Chain discovery registry coin ${index + 1}`);
  requireText(derivationRegistry, `${coinId.toUpperCase()}_COIN_ADAPTERS`, `Multi-Chain derivation registry coin ${index + 1}`);
  requireText(buildProfiles, `<option value="${coinId}"`, `Multi-Chain Activity Viewer coin ${index + 1}`);
}
for (const tool of PRODUCT_FACTS.tools) requireText(audit, tool, 'Security audit tool list');
requireText(scannerSecurity, `only ${networkOperationCount} fixed read operations`, 'Discovery network-operation count');
requireText(dashReport, `batches of ${coreBatch}`, 'Dash Core batch size');
requireText(dashReport, `batches of ${platformBatch}`, 'Dash Platform batch size');
requireText(dashReport, `At most ${identityConcurrency} Identity proof requests`, 'Identity concurrency');
requireText(scannerView, 'about ${identities.toLocaleString()} identity proof calls per seed phrase', 'Identity request estimate');

for (const profile of Object.values(BUILD_PROFILES)) {
  for (const toolId of ['key-derivation', 'activity-viewer', 'discovery-scanner']) {
    const relative = `dist/${getToolBuild(profile, toolId).artifactRelativePath}`;
    const documentation = `${rootReadme}\n${architecture}\n${read(`apps/${toolId}/README.md`)}`;
    requireText(documentation, relative, `${profile.editionName} ${toolId} artifact path`);
  }
}

const forbiddenCurrentText = [
  'Taproot_Key_Deriver.html',
  'Historical Bitcoin-only baseline',
  'Mnemonic recovery scanner',
  'currently its only adapter',
  'batches of 50',
  'only ten fixed read operations',
  'prior Recovery artifact',
];
for (const [path, text] of [
  ['README.md', rootReadme],
  ['SECURITY_AUDIT.md', audit],
  ['DASH_IMPLEMENTATION.md', dashReport],
  ['docs/ARCHITECTURE.md', architecture],
  ['apps/activity-viewer/README.md', read('apps/activity-viewer/README.md')],
  ['apps/discovery-scanner/README.md', read('apps/discovery-scanner/README.md')],
]) {
  for (const forbidden of forbiddenCurrentText) {
    if (text.includes(forbidden)) throw new Error(`${path} contains stale current-release text: ${forbidden}`);
  }
}

function markdownFiles(directory, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['.git', '.pnpm-store', 'dist', 'node_modules', 'target'].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) markdownFiles(path, output);
    else if (entry.name.endsWith('.md')) output.push(path);
  }
  return output;
}
for (const path of markdownFiles(root)) {
  const text = readFileSync(path, 'utf8');
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
    const target = match[1].split('#')[0];
    if (target === '' || /^[a-z]+:/iu.test(target)) continue;
    if (!existsSync(resolve(dirname(path), target))) throw new Error(`Broken relative Markdown link in ${path}: ${target}`);
  }
}

requireText(read(`docs/releases/${release.tag}.md`), `# Multi-Chain Wallet Tools ${release.tag}`, 'Current release notes');
console.log(`Verified current project facts for ${release.tag}: ${networkOperationCount} network operations, Core/Platform batches ${coreBatch}/${platformBatch}, Identity concurrency ${identityConcurrency}.`);

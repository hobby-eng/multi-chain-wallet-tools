import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_PROFILES, getToolBuild, profileToolIds } from './build-profiles.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const profile = BUILD_PROFILES['dash-community'];
export const DASH_FORBIDDEN_ARTIFACT_PATTERNS = [
  [/\bbitcoin(?:\s+cash)?\b/iu, 'Bitcoin'],
  [/\blitecoin\b/iu, 'Litecoin'],
  [/\bdogecoin\b/iu, 'Dogecoin'],
  [/\bethereum\b/iu, 'Ethereum'],
  [/bitcoin-(?:legacy|nested-segwit|native-segwit|taproot)/u, 'Bitcoin adapter registration'],
  [/\bethereum\b/u, 'Ethereum adapter registration'],
  [/\b(?:BIP49|BIP84|BIP86|EIP-55|P2SH-P2WPKH|P2WPKH|P2TR|Ethereum EOA)\b/u, 'non-Dash protocol copy'],
  [/Multi-Chain (?:Wallet Tools|Edition)/u, 'Multi-Chain branding'],
];

const DASH_DERIVATION_ADAPTER_IDS = new Set([
  'dash-core',
  'dash-legacy-mobile',
  'dash-platform',
  'dash-identity',
  'dash-multisig-p2sh',
  'dash-shielded',
]);
const DASH_RECOVERY_ADAPTER_IDS = new Set(['dash']);

function registeredAdapterViolations(html) {
  const violations = [];
  const normalized = html.replaceAll('\\"', '"');
  for (const match of normalized.matchAll(/\bid:"([^"]+)",group:"([^"]+)"/gu)) {
    if (!DASH_DERIVATION_ADAPTER_IDS.has(match[1]) || match[2] !== 'Dash') {
      violations.push(`non-Dash derivation adapter registration: ${match[1]}`);
    }
  }
  for (const match of normalized.matchAll(/\bid:"([^"]+)",label:"([^"]+)",networks:\[/gu)) {
    if (!DASH_RECOVERY_ADAPTER_IDS.has(match[1]) || match[2] !== 'Dash') {
      violations.push(`non-Dash recovery adapter registration: ${match[1]}`);
    }
  }
  return violations;
}

export function findDashArtifactViolations(html) {
  const protocolNeutralHtml = html.replace(/(['"`])Bitcoin seed\1/gu, '');
  const lexicalViolations = DASH_FORBIDDEN_ARTIFACT_PATTERNS
    .filter(([pattern]) => pattern.test(protocolNeutralHtml))
    .map(([, label]) => label);
  return [...new Set([
    ...lexicalViolations,
    ...registeredAdapterViolations(protocolNeutralHtml),
  ])];
}

const DASH_INSPECTOR_SHARED_DECODER_ALLOWLIST = [
  [/\bbitcoin\b/giu, 71, 'Bitcoin shared-decoder terms'],
  [/\bP2WPKH\b/gu, 2, 'P2WPKH shared-decoder terms'],
  [/\bP2TR\b/gu, 3, 'P2TR shared-decoder terms'],
  [/\bTaproot\b/gu, 48, 'Taproot shared-decoder terms'],
  [/\bMuSig(?:2)?\b/gu, 41, 'MuSig shared-decoder terms'],
  [/\brawtr\b/gu, 13, 'rawtr shared-decoder terms'],
  [/\bmulti_a\b/gu, 43, 'multi_a shared-decoder terms'],
];

export function findDashInspectorArtifactViolations(html) {
  const scriptStart = html.indexOf('<script>');
  const scriptEnd = html.lastIndexOf('</script>');
  if (scriptStart < 0 || scriptEnd <= scriptStart) return ['missing Inspector inline script boundary'];
  const markup = html.slice(0, scriptStart) + html.slice(scriptEnd + '</script>'.length);
  const allowedScopeCopy = markup
    .replaceAll('SegWit, Taproot, Schnorr, and MuSig2 are excluded', '')
    .replaceAll('SegWit, Taproot, Schnorr, MuSig2, and their PSBT fields are rejected', '');
  const violations = findDashArtifactViolations(allowedScopeCopy);
  for (const [pattern, maximum, label] of DASH_INSPECTOR_SHARED_DECODER_ALLOWLIST) {
    const count = [...html.matchAll(pattern)].length;
    if (count > maximum) violations.push(`${label} exceed reviewed allowlist: ${count} > ${maximum}`);
  }
  for (const [pattern, label] of [
    [/btcutil-js/u, 'Bitcoin BIP322 implementation'],
    [/BIP0322-signed-message/u, 'Bitcoin BIP322 message framing'],
    [/TapTweak/u, 'Bitcoin Taproot tweak implementation'],
    [/keyAggregate/u, 'Bitcoin MuSig2 aggregation implementation'],
    [/\bethereum\b/iu, 'Ethereum code or copy'],
    [/\b(?:BIP49|BIP84|BIP86|EIP-55|P2SH-P2WPKH|Ethereum EOA)\b/u, 'non-Dash protocol implementation'],
  ]) if (pattern.test(html)) violations.push(label);
  return [...new Set(violations)];
}

export function verifyDashCommunityArtifacts(projectRoot = root) {
  for (const toolId of profileToolIds(profile)) {
    const tool = getToolBuild(profile, toolId);
    const path = resolve(projectRoot, 'dist', tool.artifactRelativePath);
    const html = readFileSync(path, 'utf8');
    for (const marker of [
      profile.editionName,
      `profile:"${profile.id}"`,
      `edition:"${profile.editionName}"`,
      `<title>${tool.documentTitle}</title>`,
      '.primary{background:#008de4',
      '--bg:#0b0f3b',
      'var(--dash-deep-blue)',
    ]) {
      if (!html.includes(marker)) {
        throw new Error(`${tool.artifactName} is missing Dash Community marker: ${marker}`);
      }
    }
    const violations = toolId === 'psbt-inspector'
      ? findDashInspectorArtifactViolations(html)
      : findDashArtifactViolations(html);
    if (violations.length > 0) {
      throw new Error(
        `${tool.artifactName} contains forbidden non-Dash adapter, registration, or user-facing copy: ${violations.join(', ')}`,
      );
    }
    const digest = createHash('sha256').update(html).digest('hex');
    const sidecar = readFileSync(`${path}.sha256`, 'utf8').trim();
    if (sidecar !== `${digest}  ${tool.artifactName}`) {
      throw new Error(`${tool.artifactName} metadata sidecar does not use the Dash Community filename.`);
    }
  }

  const keyTool = getToolBuild(profile, 'key-derivation');
  const keyArtifact = readFileSync(resolve(projectRoot, 'dist', keyTool.artifactRelativePath), 'utf8');
  for (const adapterId of ['dash-core', 'dash-legacy-mobile', 'dash-platform', 'dash-identity', 'dash-multisig-p2sh', 'dash-shielded']) {
    if (!keyArtifact.includes(adapterId)) {
      throw new Error(`Dash Community key derivation artifact omitted ${adapterId}.`);
    }
  }
  console.log('Verified Dash Community artifact branding, filenames, metadata, and non-Dash code/copy exclusion.');
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyDashCommunityArtifacts();
}

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const PRODUCT_FACTS = Object.freeze({
  multiChainCoins: Object.freeze(['Bitcoin', 'Ethereum', 'Dash']),
  multiChainCoinIds: Object.freeze(['bitcoin', 'ethereum', 'dash']),
  dashCommunityCapabilities: Object.freeze([
    'Dash Core',
    'Dash Platform payments',
    'Dash Platform Identity',
    'Dash Purpose48 P2SH multisig cosigner',
    'Dash Orchard',
  ]),
  tools: Object.freeze([
    'Wallet Key Derivation Tool',
    'Wallet Activity Viewer',
    'Wallet Discovery Scanner',
    'PSBT & Multisig Inspector',
  ]),
});

export function formatEnglishList(values) {
  if (values.length < 2) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

export function readReleaseMetadata(root) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const version = String(manifest.version ?? '');
  const releaseDate = String(manifest.releaseDate ?? '');
  if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error('package.json version must use x.y.z.');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(releaseDate) || Number.isNaN(Date.parse(`${releaseDate}T00:00:00Z`))) {
    throw new Error('package.json releaseDate must be a valid YYYY-MM-DD date.');
  }
  return Object.freeze({ version, releaseDate, tag: `v${version}` });
}

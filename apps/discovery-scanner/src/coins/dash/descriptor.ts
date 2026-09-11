import { HDKey } from '@scure/bip32';
import { getDashNetwork } from '@ckd/core/networks.js';
import { descriptorChecksum } from '@ckd/export/descriptor.js';
import type { DetectedWatchOnlyMaterial } from '../../types.js';
import { WatchOnlyNotRecognizedError } from '../../watch-only.js';

/** Restricted Core L1 account descriptors; the xpub is normalized to the specified public branch. */
export function detectDashDescriptor(text: string, explicit = false): DetectedWatchOnlyMaterial {
  const match = /^pkh\(\[([0-9a-f]{8})((?:\/\d+[h'])+)\]([xt]pub[1-9A-HJ-NP-Za-km-z]+)\/([01])\/\*\)#([0-9a-z]{8})$/iu.exec(text);
  if (match === null) {
    if (explicit) throw new Error('Expected a checksummed Dash pkh([fingerprint/path]xpub/0/*) or /1/* public descriptor.');
    throw new WatchOnlyNotRecognizedError();
  }
  const [, , suffix, xpub, branchText, checksum] = match;
  const parts = suffix!.slice(1).split('/').map(part => Number(part.slice(0, -1)));
  const network = xpub!.startsWith('tpub') ? 'testnet' : 'mainnet';
  const coin = getDashNetwork(network).coinType;
  const legacy = parts.length === 1;
  const core = parts.length === 3 && parts[0] === 44 && parts[1] === coin;
  const coinjoin = parts.length === 4 && parts[0] === 9 && parts[1] === coin && parts[2] === 4;
  if ((!legacy && !core && !coinjoin) || parts.some(part => !Number.isSafeInteger(part) || part < 0 || part > 0x7fffffff)) {
    if (explicit) throw new Error('Descriptor origin must identify a supported Dash Core, legacy mobile or DIP9 CoinJoin account on its encoded network.');
    throw new WatchOnlyNotRecognizedError();
  }
  if (descriptorChecksum(text.slice(0, text.lastIndexOf('#'))) !== checksum) throw new Error('Dash descriptor checksum does not match its content.');
  const account = HDKey.fromExtendedKey(xpub!, getDashNetwork(network).versions);
  if (account.depth !== parts.length || account.index !== parts.at(-1)! + 0x80000000) {
    throw new Error('Dash descriptor account depth or child index disagrees with its origin.');
  }
  const branch = Number(branchText);
  return { coinId: 'dash', kind: legacy ? 'dash-legacy-xpub' : coinjoin ? 'dash-coinjoin-xpub' : 'dash-core-xpub',
    value: account.deriveChild(branch).publicExtendedKey, bundleNetwork: network,
    descriptorPath: `m${suffix!.replaceAll('h', "'")}/${branch}`,
    detectionLabel: `Dash ${legacy ? 'legacy mobile' : coinjoin ? 'Mobile CoinJoin · DIP9' : 'Core BIP44'} descriptor · ${branch === 0 ? 'receive' : 'change'}` };
}

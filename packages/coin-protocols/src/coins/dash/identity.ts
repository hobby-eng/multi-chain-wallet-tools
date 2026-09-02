import type { HDKey } from '@scure/bip32';
import { assertIndex, requirePrivate, requirePublic } from '@ckd/core/bip32.js';
import { hash160, wipe } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import type { NetworkName } from '@ckd/core/types.js';

export interface DashIdentityAuthenticationKey {
  path: string;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  publicKeyHash: Uint8Array;
}

/**
 * Derives the ECDSA_HASH160 authentication key described by DIP13.
 *
 * The path deliberately has no wallet-account component. DIP13 assigns the
 * final two hardened levels to the identity index and identity key index:
 * m/9'/coin_type'/5'/0'/0'/identity_index'/key_index'.
 */
export function deriveDashIdentityAuthenticationKey(
  root: HDKey,
  networkName: NetworkName,
  identityIndex: number,
  keyIndex = 0,
): DashIdentityAuthenticationKey {
  assertIndex(identityIndex, 'Identity index');
  assertIndex(keyIndex, 'Identity key index');
  const network = getDashNetwork(networkName);
  const path = `m/9'/${network.coinType}'/5'/0'/0'/${identityIndex}'/${keyIndex}'`;
  const node = root.derive(path);
  const privateSource = requirePrivate(node, path);
  const publicSource = requirePublic(node, path);
  const privateKey = Uint8Array.from(privateSource);
  const publicKey = Uint8Array.from(publicSource);
  const publicKeyHash = hash160(publicKey);
  wipe(privateSource, publicSource);
  node.wipePrivateData();
  return { path, privateKey, publicKey, publicKeyHash };
}

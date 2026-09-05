import { bech32m } from '@scure/base';
import { assertBatch, assertIndex, requirePrivate, requirePublic, rootFromSeed } from '@ckd/core/bip32.js';
import { bytesToHex, concatBytes, encodeWif, hash160, wipe } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import { field, paymentAddressField, type Bip32BatchOptions, type DerivationResult } from '@ckd/core/types.js';
import { bip32SummaryFields } from '../../bip32-summary.js';

export const PLATFORM_P2PKH_TYPE = 0xb0;

export function encodePlatformP2pkh(publicKeyHash: Uint8Array, hrp: string): string {
  if (publicKeyHash.length !== 20) throw new Error('Platform P2PKH hash must be 20 bytes.');
  const payload = concatBytes(Uint8Array.of(PLATFORM_P2PKH_TYPE), publicKeyHash);
  return bech32m.encode(hrp, bech32m.toWords(payload));
}

/** Dash Platform payment keys and addresses per DIP17 + DIP18. */
export function deriveDashPlatform(options: Bip32BatchOptions): DerivationResult {
  const network = getDashNetwork(options.network);
  assertIndex(options.account, 'Account');
  assertIndex(options.branch, 'Key class');
  assertBatch(options.start, options.count);

  const root = rootFromSeed(options.seed, network.versions);
  const keyClassPath = `m/9'/${network.coinType}'/17'/${options.account}'/${options.branch}'`;
  const keyClass = root.derive(keyClassPath);
  const { fields: summary } = bip32SummaryFields(root, keyClass, keyClassPath, {
    accountPath: 'DIP17 account path',
    accountXprv: 'DIP17 key-class xprv',
    accountXpub: 'DIP17 key-class xpub',
  });
  const rows = [];

  try {
    for (let offset = 0; offset < options.count; offset += 1) {
      const index = options.start + offset;
      const path = `${keyClassPath}/${index}`;
      const child = keyClass.deriveChild(index);
      const privateKey = requirePrivate(child, path);
      const publicKey = requirePublic(child, path);
      const publicKeyHash = hash160(publicKey);
      const address = encodePlatformP2pkh(publicKeyHash, network.platformHrp);
      const storagePayload = concatBytes(Uint8Array.of(0x00), publicKeyHash);
      const displayPayload = concatBytes(Uint8Array.of(PLATFORM_P2PKH_TYPE), publicKeyHash);

      rows.push({
        index,
        path,
        title: `Platform address #${index}`,
        basic: [
          paymentAddressField('address', 'Dash Platform address', address),
          field('publicKey', 'Compressed secp256k1 public key', bytesToHex(publicKey)),
          field(
            'privateKey',
            'Private key (raw 32-byte hex)',
            bytesToHex(privateKey),
            true,
            'DIP17 specifies the raw child private key and does not define a Platform-specific WIF format.',
          ),
        ],
        advanced: [
          field('path', 'DIP17 derivation path', path),
          field('privateKeyHex', 'Private key (hex)', bytesToHex(privateKey), true),
          field(
            'privateKeyWif',
            'Dash-compatible WIF transport encoding',
            encodeWif(privateKey, network.wif),
            true,
            'This losslessly encodes the secp256k1 secret but does not identify a Platform address or derivation path.',
          ),
          field('publicKeyHash', 'HASH160(public key)', bytesToHex(publicKeyHash)),
          field('addressType', 'DIP18 display type byte', '0xb0 (P2PKH)'),
          field('displayPayload', 'DIP18 display payload', bytesToHex(displayPayload)),
          field('storagePayload', 'DPP storage payload', bytesToHex(storagePayload)),
          field('humanReadablePart', 'Bech32m HRP', network.platformHrp),
          field('childXprv', 'Child xprv', child.privateExtendedKey, true),
          field('childXpub', 'Child xpub', child.publicExtendedKey),
        ],
      });
      wipe(privateKey, publicKey, publicKeyHash, storagePayload, displayPayload);
      child.wipePrivateData();
    }

    return {
      id: 'dash-platform',
      title: 'Dash Platform payments (DIP17 / DIP18)',
      networkLabel: `${network.label} Platform`,
      pathTemplate: `${keyClassPath}/i`,
      basicSummary: [],
      summary,
      rows,
      notices: [
        'Platform addresses are not Dash Core addresses. DIP17 uses a hardened key-class level and a non-hardened leaf index; it has no BIP44 change level.',
      ],
    };
  } finally {
    keyClass.wipePrivateData();
    root.wipePrivateData();
  }
}

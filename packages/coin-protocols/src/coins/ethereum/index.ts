import { keccak_256 } from '@noble/hashes/sha3.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { assertBatch, assertIndex, requirePrivate, requirePublic, rootFromSeed } from '@ckd/core/bip32.js';
import { bytesToHex, secp256k1, wipe } from '@ckd/core/crypto.js';
import { field, paymentAddressField, type Bip32BatchOptions, type DerivationResult } from '@ckd/core/types.js';
import { bip32SummaryFields } from '../../bip32-summary.js';

const BIP32_MAIN_VERSIONS = { private: 0x0488ade4, public: 0x0488b21e } as const;

export function toEip55(lowercaseAddress: string): string {
  const raw = lowercaseAddress.toLowerCase().replace(/^0x/u, '');
  if (!/^[0-9a-f]{40}$/u.test(raw)) throw new Error('Ethereum address must contain 40 hex characters.');
  const checksumHash = bytesToHex(keccak_256(utf8ToBytes(raw)));
  let checksummed = '0x';
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index] as string;
    const hashNibble = Number.parseInt(checksumHash[index] as string, 16);
    checksummed += /[a-f]/u.test(character) && hashNibble >= 8 ? character.toUpperCase() : character;
  }
  return checksummed;
}

export function ethereumAddressFromPublicKey(uncompressedPublicKey: Uint8Array): {
  raw: string;
  checksummed: string;
} {
  if (uncompressedPublicKey.length !== 65 || uncompressedPublicKey[0] !== 0x04) {
    throw new Error('Ethereum address derivation requires a 65-byte uncompressed secp256k1 key.');
  }
  const digest = keccak_256(uncompressedPublicKey.slice(1));
  const raw = bytesToHex(digest.slice(-20));
  return { raw, checksummed: toEip55(raw) };
}

export function deriveEthereum(options: Bip32BatchOptions): DerivationResult {
  assertIndex(options.account, 'Account');
  assertIndex(options.branch, 'Branch', 1);
  assertBatch(options.start, options.count);

  const root = rootFromSeed(options.seed, BIP32_MAIN_VERSIONS);
  const accountPath = `m/44'/60'/${options.account}'`;
  const branchPath = `${accountPath}/${options.branch}`;
  const account = root.derive(accountPath);
  const branch = root.derive(branchPath);
  const { fields: summary } = bip32SummaryFields(root, account, accountPath);
  const rows = [];

  try {
    for (let offset = 0; offset < options.count; offset += 1) {
      const index = options.start + offset;
      const path = `${branchPath}/${index}`;
      const child = branch.deriveChild(index);
      const privateKey = requirePrivate(child, path);
      const compressedPublicKey = requirePublic(child, path);
      const uncompressedPublicKey = secp256k1.getPublicKey(privateKey, false);
      const address = ethereumAddressFromPublicKey(uncompressedPublicKey);

      rows.push({
        index,
        path,
        title: `Account #${index}`,
        basic: [
          paymentAddressField('address', 'Ethereum address (EIP55)', address.checksummed, 'ethereum'),
          field('publicKey', 'Uncompressed public key', bytesToHex(uncompressedPublicKey)),
          field('privateKey', 'Private key (32-byte hex)', bytesToHex(privateKey), true),
        ],
        advanced: [
          field('path', 'Derivation path', path),
          field('rawAddress', 'Raw lowercase address', `0x${address.raw}`),
          field('compressedPublicKey', 'Compressed public key', bytesToHex(compressedPublicKey)),
          field('publicKeyPayload', 'Uncompressed X || Y (without 0x04)', bytesToHex(uncompressedPublicKey.slice(1))),
          field('childXprv', 'Child xprv', child.privateExtendedKey, true),
          field('childXpub', 'Child xpub', child.publicExtendedKey),
        ],
      });
      wipe(privateKey, compressedPublicKey, uncompressedPublicKey);
      child.wipePrivateData();
    }

    return {
      id: 'ethereum',
      title: 'Ethereum EOA (BIP44)',
      networkLabel: 'Ethereum EOA · address format is chain-independent',
      pathTemplate: `${branchPath}/i`,
      basicSummary: [],
      summary,
      rows,
      notices: ['Ethereum private keys are canonical 32-byte hexadecimal values, not WIF.'],
    };
  } finally {
    branch.wipePrivateData();
    account.wipePrivateData();
    root.wipePrivateData();
  }
}

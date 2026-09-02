import { assertBatch, assertIndex, requirePrivate, requirePublic, rootFromSeed } from '@ckd/core/bip32.js';
import { bytesToHex, encodeWif, wipe } from '@ckd/core/crypto.js';
import { getBitcoinNetwork } from '@ckd/core/networks.js';
import { field, type Bip32BatchOptions, type DerivationResult, type ResultField } from '@ckd/core/types.js';
import { addDescriptorChecksum } from '@ckd/export/descriptor.js';
import { deriveLegacyAddress } from './legacy.js';
import { deriveNativeSegwitAddress } from './native-segwit.js';
import { deriveNestedSegwitAddress } from './nested-segwit.js';
import { deriveTaprootDetails } from './taproot.js';
import { bip32SummaryFields } from '../../bip32-summary.js';

export type BitcoinMode = 'legacy' | 'nested-segwit' | 'native-segwit' | 'taproot';

const MODES = {
  legacy: { purpose: 44, label: 'Bitcoin Legacy (BIP44 / P2PKH)' },
  'nested-segwit': { purpose: 49, label: 'Bitcoin Nested SegWit (BIP49 / P2SH-P2WPKH)' },
  'native-segwit': { purpose: 84, label: 'Bitcoin Native SegWit (BIP84 / P2WPKH)' },
  taproot: { purpose: 86, label: 'Bitcoin Taproot (BIP86 / P2TR)' },
} as const;

function descriptorForAccount(
  mode: BitcoinMode,
  accountXpub: string,
  fingerprint: string,
  purpose: number,
  coinType: number,
  account: number,
  branch: number,
): string {
  const key = `[${fingerprint}/${purpose}h/${coinType}h/${account}h]${accountXpub}/${branch}/*`;
  const body = mode === 'legacy'
    ? `pkh(${key})`
    : mode === 'nested-segwit'
      ? `sh(wpkh(${key}))`
      : mode === 'native-segwit'
        ? `wpkh(${key})`
        : `tr(${key})`;
  return addDescriptorChecksum(body);
}

export function deriveBitcoin(mode: BitcoinMode, options: Bip32BatchOptions): DerivationResult {
  const network = getBitcoinNetwork(options.network);
  const config = MODES[mode];
  assertIndex(options.account, 'Account');
  assertIndex(options.branch, 'Branch', 1);
  assertBatch(options.start, options.count);

  const root = rootFromSeed(options.seed, network.versions);
  const accountPath = `m/${config.purpose}'/${network.coinType}'/${options.account}'`;
  const branchPath = `${accountPath}/${options.branch}`;
  const account = root.derive(accountPath);
  const branch = root.derive(branchPath);
  const { fields: summary, masterFingerprint } = bip32SummaryFields(root, account, accountPath);
  const descriptor = descriptorForAccount(
    mode,
    account.publicExtendedKey,
    masterFingerprint,
    config.purpose,
    network.coinType,
    options.account,
    options.branch,
  );
  const rows = [];

  try {
    for (let offset = 0; offset < options.count; offset += 1) {
      const index = options.start + offset;
      const path = `${branchPath}/${index}`;
      const child = branch.deriveChild(index);
      const privateKey = requirePrivate(child, path);
      const publicKey = requirePublic(child, path);
      const privateKeyHex = bytesToHex(privateKey);
      const publicKeyHex = bytesToHex(publicKey);
      const privateKeyWif = encodeWif(privateKey, network.wif);
      let address: string;
      let advanced: ResultField[];

      if (mode === 'legacy') {
        const details = deriveLegacyAddress(publicKey, network);
        address = details.address;
        advanced = [
          field('publicKeyHash', 'HASH160(public key)', details.publicKeyHashHex),
          field('scriptPubKey', 'scriptPubKey', details.scriptPubKeyHex),
        ];
      } else if (mode === 'nested-segwit') {
        const details = deriveNestedSegwitAddress(publicKey, network);
        address = details.address;
        advanced = [
          field('publicKeyHash', 'HASH160(public key)', details.publicKeyHashHex),
          field('redeemScript', 'P2WPKH redeem script', details.redeemScriptHex),
          field('scriptHash', 'HASH160(redeem script)', details.scriptHashHex),
          field('scriptPubKey', 'scriptPubKey', details.scriptPubKeyHex),
        ];
      } else if (mode === 'native-segwit') {
        const details = deriveNativeSegwitAddress(publicKey, network);
        address = details.address;
        advanced = [
          field('publicKeyHash', 'HASH160(public key)', details.publicKeyHashHex),
          field('witnessProgram', 'Witness program', details.witnessProgramHex),
          field('scriptPubKey', 'scriptPubKey', details.scriptPubKeyHex),
        ];
      } else {
        const details = deriveTaprootDetails(privateKey, network);
        address = details.address;
        advanced = [
          field('internalPublicKey', 'Internal public key (x-only)', details.internalKeyHex),
          field('tapTweak', 'TapTweak hash', details.tapTweakHex),
          field('taprootOutputPublicKey', 'Taproot output public key (x-only)', details.outputKeyHex),
          field('taprootOutputCompressedPublicKey', 'Taproot output compressed public key', details.outputCompressedPublicKeyHex),
          field('taprootOutputPrivateKey', 'Taproot output private key (hex)', details.outputPrivateKeyHex, true),
          field('taprootOutputPrivateKeyWif', 'Taproot output private key (WIF)', details.outputPrivateKeyWif, true),
          field('scriptPubKey', 'scriptPubKey', details.scriptPubKeyHex),
        ];
      }

      rows.push({
        index,
        path,
        title: `Address #${index}`,
        basic: [
          field('address', 'Address', address),
          field('publicKey', 'Compressed public key', publicKeyHex),
          field(
            'privateKey',
            mode === 'taproot' ? 'BIP32 child private key (WIF)' : 'Private key (WIF)',
            privateKeyWif,
            true,
            mode === 'taproot'
              ? 'WIF does not encode the P2TR descriptor or Taproot tweak; importing it into an arbitrary wallet may produce a different address.'
              : undefined,
          ),
        ],
        advanced: [
          field('path', 'Derivation path', path),
          field('childPrivateKey', 'BIP32 child private key (hex)', privateKeyHex, true),
          field('childXprv', 'Child xprv', child.privateExtendedKey, true),
          field('childXpub', 'Child xpub', child.publicExtendedKey),
          ...advanced,
        ],
      });
      wipe(privateKey, publicKey);
      child.wipePrivateData();
    }

    return {
      id: `bitcoin-${mode}`,
      title: config.label,
      networkLabel: network.label,
      pathTemplate: `${branchPath}/i`,
      basicSummary: [],
      summary,
      watchOnly: {
        label: 'Copy Bitcoin watch-only descriptor',
        description: `Checksummed ranged ${config.label} output descriptor for branch ${options.branch}. It contains the account xpub and can reveal every address on that branch, but cannot spend.`,
        text: descriptor,
        fileName: `bitcoin-${mode}-${options.network}-account-${options.account}-branch-${options.branch}.descriptor.txt`,
        mimeType: 'text/plain',
        privacySensitive: true,
      },
      rows,
      notices: mode === 'taproot'
        ? ['The basic WIF is the BIP32 child key. Advanced mode also exposes the BIP341-tweaked output key. WIF alone carries no Taproot descriptor metadata.']
        : [],
    };
  } finally {
    branch.wipePrivateData();
    account.wipePrivateData();
    root.wipePrivateData();
  }
}

import { assertBatch, assertIndex, requirePrivate, requirePublic, rootFromSeed } from '@ckd/core/bip32.js';
import { bytesToHex, encodeP2pkh, encodeWif, hash160, wipe } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import { field, type Bip32BatchOptions, type DerivationResult } from '@ckd/core/types.js';
import { bip32SummaryFields } from '../../bip32-summary.js';

export function deriveDashCore(options: Bip32BatchOptions): DerivationResult {
  const network = getDashNetwork(options.network);
  assertIndex(options.account, 'Account');
  assertIndex(options.branch, 'Branch', 1);
  assertBatch(options.start, options.count);

  const root = rootFromSeed(options.seed, network.versions);
  const accountPath = `m/44'/${network.coinType}'/${options.account}'`;
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
      const publicKey = requirePublic(child, path);
      const publicKeyHash = hash160(publicKey);
      const address = encodeP2pkh(publicKeyHash, network.p2pkh);

      rows.push({
        index,
        path,
        title: `Address #${index}`,
        basic: [
          field('address', 'Dash Core address', address),
          field('publicKey', 'Compressed public key', bytesToHex(publicKey)),
          field('privateKey', 'Private key (WIF)', encodeWif(privateKey, network.wif), true),
        ],
        advanced: [
          field('path', 'Derivation path', path),
          field('privateKeyHex', 'Private key (hex)', bytesToHex(privateKey), true),
          field('publicKeyHash', 'HASH160(public key)', bytesToHex(publicKeyHash)),
          field('scriptPubKey', 'scriptPubKey', `76a914${bytesToHex(publicKeyHash)}88ac`),
          field('childXprv', 'Child xprv', child.privateExtendedKey, true),
          field('childXpub', 'Child xpub', child.publicExtendedKey),
        ],
      });
      wipe(privateKey, publicKey, publicKeyHash);
      child.wipePrivateData();
    }

    return {
      id: 'dash-core',
      title: 'Dash Core (BIP44 / P2PKH)',
      networkLabel: network.label,
      pathTemplate: `${branchPath}/i`,
      basicSummary: [],
      summary,
      rows,
      notices: [],
    };
  } finally {
    branch.wipePrivateData();
    account.wipePrivateData();
    root.wipePrivateData();
  }
}

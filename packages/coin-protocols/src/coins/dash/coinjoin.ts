import { assertBatch, assertIndex, requirePrivate, requirePublic, rootFromSeed } from '@ckd/core/bip32.js';
import { bytesToHex, encodeP2pkh, encodeWif, hash160, wipe } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import { field, paymentAddressField, type Bip32BatchOptions, type DerivationResult } from '@ckd/core/types.js';
import { bip32SummaryFields } from '../../bip32-summary.js';

/**
 * DIP-0009 CoinJoin chain: m/9'/coin_type'/4'/account'/branch/index. Purpose,
 * coin type, feature, and account are hardened; branch and index are not.
 * This is a separate chain from BIP44 (Dash Core receive/change) and from
 * DIP17/DIP18 (Platform); branch 0 is the external chain (the commonly used
 * mobile/DashSync CoinJoin branch) and branch 1 is the internal chain
 * (a compatibility/defensive branch that is rarely used in practice). Legacy
 * compressed-key P2PKH addresses only -- no Bech32, no DIP18 here.
 */
export function deriveDashCoinJoin(options: Bip32BatchOptions): DerivationResult {
  const network = getDashNetwork(options.network);
  assertIndex(options.account, 'Account');
  assertIndex(options.branch, 'Branch', 1);
  assertBatch(options.start, options.count);

  const root = rootFromSeed(options.seed, network.versions);
  const accountPath = `m/9'/${network.coinType}'/4'/${options.account}'`;
  const branchPath = `${accountPath}/${options.branch}`;
  const account = root.derive(accountPath);
  const branch = root.derive(branchPath);
  const { fields: summary } = bip32SummaryFields(root, account, accountPath, {
    accountPath: 'DIP9 account path',
    accountXprv: 'DIP9 account xprv',
    accountXpub: 'DIP9 account xpub',
  });
  const rows = [];
  const chainLabel = options.branch === 0 ? 'External' : 'Internal';

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
          paymentAddressField('address', 'Dash CoinJoin address', address, 'dash'),
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
      id: 'dash-core-coinjoin',
      title: `Dash Mobile CoinJoin · DIP9 · ${chainLabel} chain`,
      networkLabel: network.label,
      pathTemplate: `${branchPath}/i`,
      basicSummary: [],
      summary,
      rows,
      notices: [
        'DIP-0009 CoinJoin chain, separate from the standard BIP44 receive/change branches used by Dash Core. Legacy compressed-key P2PKH addresses only.',
      ],
    };
  } finally {
    branch.wipePrivateData();
    account.wipePrivateData();
    root.wipePrivateData();
  }
}

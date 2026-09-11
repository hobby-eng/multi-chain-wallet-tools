import { assertBatch, assertIndex, requirePrivate, requirePublic, rootFromSeed } from '@ckd/core/bip32.js';
import { bytesToHex, encodeP2pkh, encodeWif, hash160, wipe } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import { field, paymentAddressField, type Bip32BatchOptions, type DerivationResult } from '@ckd/core/types.js';
import { accountDescriptorExport } from '../../account-descriptors.js';
import { bip32SummaryFields } from '../../bip32-summary.js';

/** Historical Dash Wallet/DashSync mobile path: m/account'/branch/index. */
export function deriveDashLegacyMobile(options: Bip32BatchOptions): DerivationResult {
  const network = getDashNetwork(options.network);
  assertIndex(options.account, 'Account');
  assertIndex(options.branch, 'Branch', 1);
  assertBatch(options.start, options.count);

  const root = rootFromSeed(options.seed, network.versions);
  const accountPath = `m/${options.account}'`;
  const branchPath = `${accountPath}/${options.branch}`;
  const account = root.derive(accountPath);
  const branch = root.derive(branchPath);
  const { fields: summary, masterFingerprint } = bip32SummaryFields(root, account, accountPath, {
    accountPath: 'Legacy mobile account path',
    accountXprv: 'Legacy mobile account xprv',
    accountXpub: 'Legacy mobile account xpub',
  });
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
          paymentAddressField('address', 'Dash legacy mobile address', address, 'dash'),
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
      id: 'dash-legacy-mobile',
      title: 'Dash Core · legacy mobile',
      networkLabel: network.label,
      pathTemplate: `${branchPath}/i`,
      basicSummary: [],
      summary,
      accountDescriptors: accountDescriptorExport({
        script: 'pkh', fingerprint: masterFingerprint, accountPath,
        publicKey: account.publicExtendedKey, privateKey: account.privateExtendedKey,
        fileStem: `dash-legacy-mobile-${options.network}-account-${options.account}`,
        scannerPrefix: 'dash-legacy-xpub',
      }),
      rows,
      watchOnly: {
        label: 'Copy public scan key',
        description: 'Import this labelled public key into Discovery Scanner to scan this legacy mobile branch. It cannot spend, but exposes branch addresses and activity.',
        text: `dash-legacy-xpub:${branch.publicExtendedKey}`,
        fileName: `dash-legacy-${options.network}-account-${options.account}-branch-${options.branch}.txt`,
        mimeType: 'text/plain', privacySensitive: true,
      },
      notices: [
        "Historical Dash Wallet/DashSync mobile path m/account'/branch/index. Account 0 is the historical default. Use it only for recovery of wallets that predate the BIP44 mobile default.",
      ],
    };
  } finally {
    branch.wipePrivateData();
    account.wipePrivateData();
    root.wipePrivateData();
  }
}

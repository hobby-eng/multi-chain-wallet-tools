import { assertBatch, assertIndex, requirePrivate, requirePublic, rootFromSeed } from '@ckd/core/bip32.js';
import { bytesToHex, encodeWif, hash160, wipe } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import { field, type Bip32BatchOptions, type DerivationResult } from '@ckd/core/types.js';
import { bip32SummaryFields } from '../../bip32-summary.js';

export function deriveDashMultisig(options: Bip32BatchOptions): DerivationResult {
  const network = getDashNetwork(options.network);
  assertIndex(options.account, 'Account');
  assertIndex(options.branch, 'Branch', 1);
  assertBatch(options.start, options.count);

  const root = rootFromSeed(options.seed, network.versions);
  const accountPath = `m/48'/${network.coinType}'/${options.account}'/0'`;
  const branchPath = `${accountPath}/${options.branch}`;
  const account = root.derive(accountPath);
  const branch = account.deriveChild(options.branch);
  const { fields: summary, masterFingerprint } = bip32SummaryFields(root, account, accountPath, {
    accountPath: 'Multisig cosigner account path',
    accountXprv: 'Multisig cosigner account xprv',
    accountXpub: 'Multisig cosigner account xpub',
  });
  const origin = `[${masterFingerprint}${accountPath.slice(1).replaceAll("'", 'h')}]`;
  const rows = [];

  try {
    for (let offset = 0; offset < options.count; offset += 1) {
      const index = options.start + offset;
      const path = `${branchPath}/${index}`;
      const child = branch.deriveChild(index);
      const privateKey = requirePrivate(child, path);
      const publicKey = requirePublic(child, path);
      const publicKeyHash = hash160(publicKey);

      rows.push({
        index,
        path,
        title: `Cosigner key #${index}`,
        basic: [
          field('publicKey', 'Compressed public key for multisig', bytesToHex(publicKey)),
          field('originPath', 'Origin path', path),
        ],
        advanced: [
          field('privateKey', 'Child private key (WIF)', encodeWif(privateKey, network.wif), true),
          field('privateKeyHex', 'Child private key (hex)', bytesToHex(privateKey), true),
          field('publicKeyHash', 'HASH160(public key)', bytesToHex(publicKeyHash)),
          field('childXprv', 'Child xprv', child.privateExtendedKey, true),
          field('childXpub', 'Child xpub', child.publicExtendedKey),
          field('descriptorKey', 'Descriptor key expression', `${origin}${account.publicExtendedKey}/${options.branch}/${index}`),
        ],
      });
      wipe(privateKey, publicKey, publicKeyHash);
      child.wipePrivateData();
    }

    return {
      id: 'dash-multisig-p2sh',
      title: 'Dash multisig cosigner (Purpose48 / P2SH)',
      networkLabel: network.label,
      pathTemplate: `${branchPath}/i`,
      basicSummary: [
        field('descriptorAccountKey', 'Descriptor account key', `${origin}${account.publicExtendedKey}`),
      ],
      summary,
      watchOnly: {
        label: 'Copy multisig cosigner xpub',
        description: 'Exports the origin-tagged Purpose48 account xpub used by the Multisig wallet utility. It cannot spend by itself, but it reveals this cosigner address graph.',
        text: `${origin}${account.publicExtendedKey}\n`,
        fileName: `dash-multisig-p2sh-${options.network}-account-${options.account}-cosigner-xpub.txt`,
        mimeType: 'text/plain',
        privacySensitive: true,
      },
      rows,
      notices: [
        "Use this account xpub with the same path for every cosigner in one Dash P2SH multisig wallet. Do not mix it with BIP44 m/44'/5'/account' single-sig xpubs or legacy m/45'/0 multisig xpubs.",
        'This mode derives cosigner public keys only. Shared 2-of-N P2SH addresses require all cosigner xpubs and are built in the Multisig wallet utility.',
      ],
    };
  } finally {
    branch.wipePrivateData();
    account.wipePrivateData();
    root.wipePrivateData();
  }
}

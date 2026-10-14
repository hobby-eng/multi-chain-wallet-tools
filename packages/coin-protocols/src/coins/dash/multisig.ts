import { bytesToHex, encodeWif, hash160, wipe } from "@ckd/core/crypto.js";
import { getDashNetwork } from "@ckd/core/networks.js";
import { addDescriptorChecksum } from "@ckd/core/descriptor-checksum.js";
import { field, type Bip32BatchOptions, type DerivationResult } from "@ckd/core/types.js";
import { withAccountBranch } from "../../account-branch.js";
import { descriptorOrigin } from "../../account-descriptors.js";
import { DASH_CORE_PATHS, DASH_MULTISIG_PATHS } from "./profiles.js";

type DashMultisigDerivation = "purpose48" | "core-pkh";

function deriveDashMultisigMode(
  options: Bip32BatchOptions,
  mode: DashMultisigDerivation,
): DerivationResult {
  const network = getDashNetwork(options.network);
  const layout = {
    versions: network.versions,
    paths: mode === "purpose48" ? DASH_MULTISIG_PATHS : DASH_CORE_PATHS,
    summaryLabels: {
      accountPath: "Multisig cosigner account path",
      accountXprv: "Multisig cosigner account xprv",
      accountXpub: "Multisig cosigner account xpub",
    },
  };
  return withAccountBranch(options, layout, (chain) => {
    const origin = descriptorOrigin(chain.masterFingerprint, chain.accountPath);
    const descriptorAccountKey = `${origin}${chain.account.publicExtendedKey}`;
    const signerDescriptor = (branch: 0 | 1): string =>
      addDescriptorChecksum(`pkh(${descriptorAccountKey}/${branch}/*)`);
    const rows = chain.rows(({ index, path, node, privateKey, publicKey }) => {
      const publicKeyHash = hash160(publicKey);
      try {
        return {
          index,
          path,
          title: `Cosigner key #${index}`,
          basic: [
            field("publicKey", "Compressed public key for multisig", bytesToHex(publicKey)),
            field("originPath", "Origin path", path),
          ],
          advanced: [
            field(
              "privateKey",
              "Child private key (WIF)",
              encodeWif(privateKey, network.wif),
              true,
            ),
            field("privateKeyHex", "Child private key (hex)", bytesToHex(privateKey), true),
            field("publicKeyHash", "HASH160(public key)", bytesToHex(publicKeyHash)),
            field("childXprv", "Child xprv", node.privateExtendedKey, true),
            field("childXpub", "Child xpub", node.publicExtendedKey),
            field(
              "descriptorKey",
              "Descriptor key expression",
              `${descriptorAccountKey}/${options.branch}/${index}`,
            ),
          ],
        };
      } finally {
        wipe(publicKeyHash);
      }
    });

    return {
      id: mode === "purpose48" ? "dash-multisig-p2sh" : "dash-multisig-core-pkh",
      title:
        mode === "purpose48"
          ? "Dash multisig cosigner (Purpose48 / P2SH)"
          : options.account === 0
            ? "Dash multisig cosigner (Dash Core pkh signer)"
            : "Dash multisig cosigner (custom BIP44 pkh account)",
      networkLabel: network.label,
      pathTemplate: `${chain.branchPath}/i`,
      basicSummary: [
        field("descriptorAccountKey", "Origin-tagged cosigner account xpub", descriptorAccountKey),
        ...(mode === "core-pkh"
          ? [
              field(
                "receivePkhDescriptor",
                "Dash Core public pkh descriptor · receive",
                signerDescriptor(0),
              ),
              field(
                "changePkhDescriptor",
                "Dash Core public pkh descriptor · change",
                signerDescriptor(1),
              ),
            ]
          : []),
      ],
      summary: chain.summary,
      watchOnly: {
        label: "Copy multisig cosigner xpub",
        description:
          mode === "purpose48"
            ? "Exports the origin-tagged Purpose48 account xpub used by the Multisig wallet utility. It cannot spend by itself, but it reveals this cosigner address graph."
            : "Exports the origin-tagged account xpub extracted from the Dash Core pkh signer path. Combine it with the other cosigners in shared sh(sortedmulti(...)) descriptors.",
        text: `${descriptorAccountKey}\n`,
        fileName: `dash-multisig-${mode}-${options.network}-account-${options.account}-cosigner-xpub.txt`,
        mimeType: "text/plain",
        privacySensitive: true,
      },
      rows,
      notices: [
        mode === "purpose48"
          ? "Purpose48 is a wallet-specific P2SH convention. Use the same path for every cosigner and do not mix it with Dash Core pkh signer or legacy m/45'/0 keys."
          : options.account === 0
            ? "This is the public account key from the ordinary Dash Core pkh signer branch, presented for the official descriptor multisig workflow. It is not a shared multisig address."
            : "This is a custom BIP44 account. The default Dash Core signer workflow uses account 0; confirm that your signer has this exact account and origin before funding. It is not a shared multisig address.",
        "This mode derives cosigner public keys only. Shared 2-of-N P2SH addresses require all cosigner xpubs and are built in the Multisig wallet utility.",
      ],
    };
  });
}

export function deriveDashMultisig(options: Bip32BatchOptions): DerivationResult {
  return deriveDashMultisigMode(options, "purpose48");
}

export function deriveDashCoreMultisig(options: Bip32BatchOptions): DerivationResult {
  return deriveDashMultisigMode(options, "core-pkh");
}

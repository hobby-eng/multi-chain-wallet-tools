// The Dash chains of compressed-key P2PKH addresses: Dash Core's BIP44 account, the DIP9 CoinJoin
// chain and the historical mobile path. They derive the same rows and descriptors and differ only
// in where the account lies and how the result names itself, which each chain's profile says.
import { bytesToHex, encodeP2pkh, encodeWif, hash160, wipe } from "@ckd/core/crypto.js";
import { getDashNetwork } from "@ckd/core/networks.js";
import {
  field,
  paymentAddressField,
  type Bip32BatchOptions,
  type DerivationResult,
} from "@ckd/core/types.js";
import { accountDescriptorExport, type DashScannerPrefix } from "../../account-descriptors.js";
import { withAccountBranch, type AccountBranch, type AccountLayout } from "../../account-branch.js";
import type { DerivationPathProfile } from "../../derivation-path.js";

/** What sets one Dash P2PKH chain apart. */
export interface DashP2pkhChain {
  readonly id: string;
  readonly title: (branch: number) => string;
  readonly addressLabel: string;
  readonly paths: DerivationPathProfile;
  readonly summaryLabels?: AccountLayout["summaryLabels"];
  /** The start of the descriptor file's name and of the Scanner's public-key label. */
  readonly fileStem: string;
  readonly scannerPrefix: DashScannerPrefix;
  readonly watchOnly?: (
    chain: AccountBranch,
    options: Bip32BatchOptions,
  ) => DerivationResult["watchOnly"];
  readonly notices: readonly string[];
}

export function deriveDashP2pkhChain(
  profile: DashP2pkhChain,
  options: Bip32BatchOptions,
): DerivationResult {
  const network = getDashNetwork(options.network);
  const layout: AccountLayout = {
    versions: network.versions,
    paths: profile.paths,
    ...(profile.summaryLabels === undefined ? {} : { summaryLabels: profile.summaryLabels }),
  };
  return withAccountBranch(options, layout, (chain) => {
    const rows = chain.rows(({ index, path, node, privateKey, publicKey }) => {
      const publicKeyHash = hash160(publicKey);
      try {
        return {
          index,
          path,
          title: `Address #${index}`,
          basic: [
            paymentAddressField(
              "address",
              profile.addressLabel,
              encodeP2pkh(publicKeyHash, network.p2pkh),
              "dash",
            ),
            field("publicKey", "Compressed public key", bytesToHex(publicKey)),
            field("privateKey", "Private key (WIF)", encodeWif(privateKey, network.wif), true),
          ],
          advanced: [
            field("path", "Derivation path", path),
            field("privateKeyHex", "Private key (hex)", bytesToHex(privateKey), true),
            field("publicKeyHash", "HASH160(public key)", bytesToHex(publicKeyHash)),
            field("scriptPubKey", "scriptPubKey", `76a914${bytesToHex(publicKeyHash)}88ac`),
            field("childXprv", "Child xprv", node.privateExtendedKey, true),
            field("childXpub", "Child xpub", node.publicExtendedKey),
          ],
        };
      } finally {
        wipe(publicKeyHash);
      }
    });
    const watchOnly = profile.watchOnly?.(chain, options);
    return {
      id: profile.id,
      title: profile.title(options.branch),
      networkLabel: network.label,
      pathTemplate: `${chain.branchPath}/i`,
      basicSummary: [],
      summary: chain.summary,
      accountDescriptors: accountDescriptorExport({
        script: "pkh",
        fingerprint: chain.masterFingerprint,
        accountPath: chain.accountPath,
        publicKey: chain.account.publicExtendedKey,
        privateKey: chain.account.privateExtendedKey,
        fileStem: `${profile.fileStem}-${options.network}-account-${options.account}`,
        scannerPrefix: profile.scannerPrefix,
      }),
      rows,
      ...(watchOnly === undefined ? {} : { watchOnly }),
      notices: [...profile.notices],
    };
  });
}

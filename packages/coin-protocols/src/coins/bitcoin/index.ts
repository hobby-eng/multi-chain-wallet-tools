import { bytesToHex, encodeWif } from "@ckd/core/crypto.js";
import { getBitcoinNetwork } from "@ckd/core/networks.js";
import {
  field,
  paymentAddressField,
  type Bip32BatchOptions,
  type DerivationResult,
  type ResultField,
} from "@ckd/core/types.js";
import { addDescriptorChecksum } from "@ckd/core/descriptor-checksum.js";
import { deriveLegacyAddress } from "./legacy.js";
import { deriveNativeSegwitAddress } from "./native-segwit.js";
import { deriveNestedSegwitAddress } from "./nested-segwit.js";
import { deriveTaprootDetails } from "./taproot.js";
import { accountDescriptorExport, descriptorOrigin } from "../../account-descriptors.js";
import { withAccountBranch } from "../../account-branch.js";
import { BitcoinPurposeProfile, type BitcoinMode } from "./profiles.js";

export type { BitcoinMode } from "./profiles.js";

function descriptorForAccount(
  mode: BitcoinMode,
  accountXpub: string,
  fingerprint: string,
  accountPath: string,
  branch: number,
): string {
  const key = `${descriptorOrigin(fingerprint, accountPath)}${accountXpub}/${branch}/*`;
  return addDescriptorChecksum(BitcoinPurposeProfile.forMode(mode).descriptorForKey(key));
}

export function deriveBitcoin(mode: BitcoinMode, options: Bip32BatchOptions): DerivationResult {
  const network = getBitcoinNetwork(options.network);
  const config = BitcoinPurposeProfile.forMode(mode);
  const layout = {
    versions: network.versions,
    paths: config.paths,
  };
  return withAccountBranch(options, layout, (chain) => {
    const descriptor = descriptorForAccount(
      mode,
      chain.account.publicExtendedKey,
      chain.masterFingerprint,
      chain.accountPath,
      options.branch,
    );
    const rows = chain.rows(({ index, path, node, privateKey, publicKey }) => {
      let address: string;
      let advanced: ResultField[];

      if (mode === "legacy") {
        const details = deriveLegacyAddress(publicKey, network);
        address = details.address;
        advanced = [
          field("publicKeyHash", "HASH160(public key)", details.publicKeyHashHex),
          field("scriptPubKey", "scriptPubKey", details.scriptPubKeyHex),
        ];
      } else if (mode === "nested-segwit") {
        const details = deriveNestedSegwitAddress(publicKey, network);
        address = details.address;
        advanced = [
          field("publicKeyHash", "HASH160(public key)", details.publicKeyHashHex),
          field("redeemScript", "P2WPKH redeem script", details.redeemScriptHex),
          field("scriptHash", "HASH160(redeem script)", details.scriptHashHex),
          field("scriptPubKey", "scriptPubKey", details.scriptPubKeyHex),
        ];
      } else if (mode === "native-segwit") {
        const details = deriveNativeSegwitAddress(publicKey, network);
        address = details.address;
        advanced = [
          field("publicKeyHash", "HASH160(public key)", details.publicKeyHashHex),
          field("witnessProgram", "Witness program", details.witnessProgramHex),
          field("scriptPubKey", "scriptPubKey", details.scriptPubKeyHex),
        ];
      } else {
        const details = deriveTaprootDetails(privateKey, network);
        address = details.address;
        advanced = [
          field("internalPublicKey", "Internal public key (x-only)", details.internalKeyHex),
          field("tapTweak", "TapTweak hash", details.tapTweakHex),
          field(
            "taprootOutputPublicKey",
            "Taproot output public key (x-only)",
            details.outputKeyHex,
          ),
          field(
            "taprootOutputCompressedPublicKey",
            "Taproot output compressed public key",
            details.outputCompressedPublicKeyHex,
          ),
          field(
            "taprootOutputPrivateKey",
            "Taproot output private key (hex)",
            details.outputPrivateKeyHex,
            true,
          ),
          field(
            "taprootOutputPrivateKeyWif",
            "Taproot output private key (WIF)",
            details.outputPrivateKeyWif,
            true,
          ),
          field("scriptPubKey", "scriptPubKey", details.scriptPubKeyHex),
        ];
      }

      return {
        index,
        path,
        title: `Address #${index}`,
        basic: [
          paymentAddressField("address", "Address", address, "bitcoin"),
          field("publicKey", "Compressed public key", bytesToHex(publicKey)),
          field(
            "privateKey",
            mode === "taproot" ? "BIP32 child private key (WIF)" : "Private key (WIF)",
            encodeWif(privateKey, network.wif),
            true,
            mode === "taproot"
              ? "WIF does not encode the P2TR descriptor or Taproot tweak; importing it into an arbitrary wallet may produce a different address."
              : undefined,
          ),
        ],
        advanced: [
          field("path", "Derivation path", path),
          field("childPrivateKey", "BIP32 child private key (hex)", bytesToHex(privateKey), true),
          field("childXprv", "Child xprv", node.privateExtendedKey, true),
          field("childXpub", "Child xpub", node.publicExtendedKey),
          ...advanced,
        ],
      };
    });

    return {
      id: `bitcoin-${mode}`,
      title: config.derivationLabel,
      networkLabel: network.label,
      pathTemplate: `${chain.branchPath}/i`,
      basicSummary: [],
      summary: chain.summary,
      accountDescriptors: accountDescriptorExport({
        script: config.descriptorScript,
        fingerprint: chain.masterFingerprint,
        accountPath: chain.accountPath,
        publicKey: chain.account.publicExtendedKey,
        privateKey: chain.account.privateExtendedKey,
        fileStem: `bitcoin-${mode}-${options.network}-account-${options.account}`,
      }),
      watchOnly: {
        label: "Copy Bitcoin watch-only descriptor",
        description: `Checksummed ranged ${config.derivationLabel} output descriptor for branch ${options.branch}. It contains the account xpub and can reveal every address on that branch, but cannot spend.`,
        text: descriptor,
        fileName: `bitcoin-${mode}-${options.network}-account-${options.account}-branch-${options.branch}.descriptor.txt`,
        mimeType: "text/plain",
        privacySensitive: true,
      },
      rows,
      notices: [],
    };
  });
}

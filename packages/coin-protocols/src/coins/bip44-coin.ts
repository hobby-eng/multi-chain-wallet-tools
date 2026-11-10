// The derivation of a BIP44 coin (bip44-coin-profile.ts): each child key of the requested
// branch becomes a row with the coin's address, its public key and its private key in the form the
// coin's wallets import. withAccountBranch checks the request and wipes every key afterwards; this
// module only adds the coin's encodings, so each coin brings nothing but those.
import { bytesToHex, encodeWif, secp256k1 } from "@ckd/core/crypto.js";
import type { Bip32Versions } from "@ckd/core/networks.js";
import type { Bip32SummaryLabels } from "../bip32-summary.js";
import {
  field,
  paymentAddressField,
  type Bip32BatchOptions,
  type DerivationResult,
  type ResultField,
} from "@ckd/core/types.js";
import { withAccountBranch, type BranchChild } from "../account-branch.js";
import type { Bip44CoinProfile } from "./bip44-coin-profile.js";
import { variantDerivation, type VariantDerivation } from "./coin-variant.js";

/** The address of one public key, as the coin's wallets show it. */
export interface Bip44CoinAddress {
  readonly address: string;
  /** The payment URI scheme, only where the coin has a standard one. */
  readonly scheme?: ResultField["paymentUriScheme"];
  /** Further facts of the address, shown in Advanced mode. */
  readonly details?: readonly ResultField[];
}

/** How a coin encodes its keys and addresses. */
export interface Bip44CoinKeys {
  /** The result's network line, such as "Litecoin mainnet". */
  readonly networkLabel: string;
  /** The serialization versions of the coin's extended keys. */
  readonly versions: Bip32Versions;
  /** The summary's key labels, where the coin's extended keys have names of their own. */
  readonly summaryLabels?: Partial<Bip32SummaryLabels>;
  /** The WIF version byte of the coin's private keys; without it, a 32-byte hex private key. */
  readonly wif?: number;
  /** Whether the coin's wallets show the uncompressed public key, as Ethereum's do. */
  readonly uncompressedPublicKey?: boolean;
  readonly notices?: readonly string[];
  /** The address of a compressed public key. */
  address(publicKey: Uint8Array): Bip44CoinAddress;
}

/** The uncompressed SEC1 form of a compressed public key, for the coins whose wallets show it. */
function uncompressedKey(publicKey: Uint8Array): Uint8Array {
  return secp256k1.Point.fromHex(bytesToHex(publicKey)).toBytes(false);
}

/** The fields of one child key. */
function childFields(
  child: BranchChild,
  keys: Bip44CoinKeys,
): { basic: ResultField[]; advanced: ResultField[] } {
  const { address, scheme, details = [] } = keys.address(child.publicKey);
  const shownKey = keys.uncompressedPublicKey === true ? uncompressedKey(child.publicKey) : null;
  const privateKey =
    keys.wif === undefined
      ? field("privateKey", "Private key (32-byte hex)", bytesToHex(child.privateKey), true)
      : field("privateKey", "Private key (WIF)", encodeWif(child.privateKey, keys.wif), true);
  const publicKey =
    shownKey === null
      ? field("publicKey", "Compressed public key", bytesToHex(child.publicKey))
      : field("publicKey", "Uncompressed public key", bytesToHex(shownKey));
  const childPrivateKey =
    keys.wif === undefined
      ? []
      : [
          field(
            "childPrivateKey",
            "BIP32 child private key (hex)",
            bytesToHex(child.privateKey),
            true,
          ),
        ];
  const compressedKey =
    shownKey === null
      ? []
      : [field("compressedPublicKey", "Compressed public key", bytesToHex(child.publicKey))];
  return {
    basic: [paymentAddressField("address", "Address", address, scheme), publicKey, privateKey],
    advanced: [
      field("path", "Derivation path", child.path),
      ...childPrivateKey,
      ...compressedKey,
      field("childXprv", "Child extended private key", child.node.privateExtendedKey, true),
      field("childXpub", "Child extended public key", child.node.publicExtendedKey),
      ...details,
    ],
  };
}

/** The rows of `options` under `profile`, encoded by `keys`. */
export function deriveBip44Coin(
  profile: Bip44CoinProfile,
  keys: Bip44CoinKeys,
  options: Bip32BatchOptions,
): DerivationResult {
  const rowName = profile.branches === "receive-change" ? "Address" : "Account";
  const layout = {
    versions: keys.versions,
    paths: profile.paths,
    ...(keys.summaryLabels === undefined ? {} : { summaryLabels: keys.summaryLabels }),
  };
  return withAccountBranch(options, layout, (chain) => ({
    id: profile.adapterId,
    title: profile.label,
    networkLabel: keys.networkLabel,
    pathTemplate: `${chain.branchPath}/i`,
    basicSummary: [],
    summary: chain.summary,
    rows: chain.rows((child) => ({
      index: child.index,
      path: child.path,
      title: `${rowName} #${child.index}`,
      ...childFields(child, keys),
    })),
    notices: [...(keys.notices ?? [])],
  }));
}

/** The derivation of every profile of a coin, by adapter id; undefined for another coin's id. */
export function bip44CoinDerivation(
  profiles: readonly Bip44CoinProfile[],
  keys: (profile: Bip44CoinProfile) => Bip44CoinKeys,
  id: string,
): VariantDerivation | undefined {
  return variantDerivation(profiles, id, (profile, options) =>
    deriveBip44Coin(profile, keys(profile), options),
  );
}

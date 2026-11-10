// The derivation of a BIP44 coin (bip44-coin-profile.ts): each child key of the requested
// branch becomes a row with the coin's address, its public key and its private key in the form the
// coin's wallets import. withAccountBranch checks the request and wipes every key afterwards; this
// module only adds the coin's encodings, so each coin brings nothing but those.
import type { HDKey } from "@scure/bip32";
import { requirePublic, rootFromSeed } from "@ckd/core/bip32.js";
import { BIP32_BRANCH_SIZE, BIP32_HARDENED_OFFSET } from "@ckd/core/bip32-limits.js";
import { bytesToHex, encodeWif, secp256k1, wipe } from "@ckd/core/crypto.js";
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
import type { AddressLayout, CoinAddressScheme, SeedAddresses } from "./address-scheme.js";

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

/** The receive branch of a BIP44 account, the one whose addresses the connected tools look up. */
const RECEIVE_BRANCH = 0;

/** A layout of a BIP44 variant, with where index i of a scan at account a sits: its account and index. */
interface Bip44Layout {
  readonly profile: Bip44CoinProfile;
  at(account: number, index: number): { readonly account: number; readonly index: number };
}

/**
 * The layouts of one BIP44 variant: its addresses m/purpose'/coin'/account'/0/i under the scan's
 * account, and Ledger Live's account form m/purpose'/coin'/i'/0/0, its accounts counted from the
 * scan's account.
 */
function bip44Layouts(profile: Bip44CoinProfile): [AddressLayout, Bip44Layout][] {
  const head = `m/${profile.purpose}'/${profile.coinType}'`;
  const pathOf = (at: { account: number; index: number }) =>
    profile.paths.addressPath(
      { network: "mainnet", account: at.account, branch: RECEIVE_BRANCH },
      at.index,
    );
  const layout = (
    id: string,
    label: string,
    at: Bip44Layout["at"],
    maximumCount: AddressLayout["maximumCount"],
  ): [AddressLayout, Bip44Layout] => [
    Object.freeze({
      id,
      label,
      path: (account: number, index: number) => pathOf(at(account, index)),
      maximumCount,
    }),
    { profile, at },
  ];
  return [
    layout(
      profile.adapterId,
      `${profile.variantLabel} · ${head}/a'/0/i`,
      (account, index) => ({ account, index }),
      () => BIP32_BRANCH_SIZE,
    ),
    layout(
      `${profile.adapterId}-accounts`,
      `Ledger Live accounts · ${head}/i'/0/0`,
      (account, index) => ({ account: account + index, index: 0 }),
      (account) => BIP32_BRANCH_SIZE - account,
    ),
  ];
}

/**
 * The addresses of one seed under a BIP44 coin's layouts. The root, each variant's coin-type node
 * m/purpose'/coin' and the receive branch of the account in use are derived once and held until
 * wipe(); every other node, the account's included, is wiped as soon as its child is derived.
 */
class Bip44SeedAddresses implements SeedAddresses {
  readonly #root: HDKey;
  readonly #keys: Bip44CoinKeys;
  readonly #layouts: ReadonlyMap<AddressLayout, Bip44Layout>;
  readonly #coinNodes = new Map<Bip44CoinProfile, HDKey>();
  #branch: { profile: Bip44CoinProfile; account: number; node: HDKey } | null = null;

  constructor(
    seed: Uint8Array,
    keys: Bip44CoinKeys,
    layouts: ReadonlyMap<AddressLayout, Bip44Layout>,
  ) {
    this.#root = rootFromSeed(seed, keys.versions);
    this.#keys = keys;
    this.#layouts = layouts;
  }

  address(layout: AddressLayout, account: number, index: number): string {
    const own = this.#layouts.get(layout);
    if (own === undefined) throw new Error(`${layout.id} is not a layout of this coin.`);
    const at = own.at(account, index);
    const path = layout.path(account, index);
    const child = this.#branchOf(own.profile, at.account).deriveChild(at.index);
    let publicKey: Uint8Array | null = null;
    try {
      publicKey = requirePublic(child, path);
      return this.#keys.address(publicKey).address;
    } finally {
      wipe(publicKey);
      child.wipePrivateData();
    }
  }

  /** Erases the root and every node held, as far as the runtime allows. */
  wipe(): void {
    this.#branch?.node.wipePrivateData();
    this.#branch = null;
    for (const node of this.#coinNodes.values()) node.wipePrivateData();
    this.#coinNodes.clear();
    this.#root.wipePrivateData();
  }

  /** The coin-type node m/purpose'/coin' of `profile`; the purpose node is wiped at once. */
  #coinNode(profile: Bip44CoinProfile): HDKey {
    const held = this.#coinNodes.get(profile);
    if (held !== undefined) return held;
    const purpose = this.#root.deriveChild(profile.purpose + BIP32_HARDENED_OFFSET);
    try {
      const node = purpose.deriveChild(profile.coinType + BIP32_HARDENED_OFFSET);
      this.#coinNodes.set(profile, node);
      return node;
    } finally {
      purpose.wipePrivateData();
    }
  }

  /**
   * The receive branch of `account` under `profile`, held while that account is scanned; the
   * branch held before is wiped, and so is the account node.
   */
  #branchOf(profile: Bip44CoinProfile, account: number): HDKey {
    const held = this.#branch;
    if (held !== null && held.profile === profile && held.account === account) return held.node;
    held?.node.wipePrivateData();
    this.#branch = null;
    const accountNode = this.#coinNode(profile).deriveChild(account + BIP32_HARDENED_OFFSET);
    try {
      const node = accountNode.deriveChild(profile.paths.branchIndex(RECEIVE_BRANCH));
      this.#branch = { profile, account, node };
      return node;
    } finally {
      accountNode.wipePrivateData();
    }
  }
}

/**
 * The public addresses of a BIP44 coin for the connected tools: each variant's address index and
 * Ledger Live's account index (bip44Layouts), each address `keys` makes of the child's public key,
 * as the Deriver's rows show it; only public keys are read, and every private node is wiped.
 */
export function bip44CoinAddresses(
  profiles: readonly Bip44CoinProfile[],
  keys: Bip44CoinKeys,
): CoinAddressScheme {
  const layouts = new Map(profiles.flatMap(bip44Layouts));
  return Object.freeze({
    layouts: Object.freeze([...layouts.keys()]),
    open: (seed: Uint8Array) => new Bip44SeedAddresses(seed, keys, layouts),
  });
}

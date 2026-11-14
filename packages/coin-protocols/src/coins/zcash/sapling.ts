// Zcash's shielded Sapling rows: the ZIP-32 account m_Sapling/32'/133'/account' (zip32-sapling.ts),
// one row per diversifier index j. A row of an index with an address shows it as zs1… (Bech32,
// "Sapling Payment Addresses") and as ZIP-316 unified addresses (unified.ts): one of the Sapling
// receiver alone, and, in Advanced mode, one that adds the transparent P2PKH receiver at the same
// j, m/44'/133'/account'/0/j. About half of the indexes have no address; their rows have no address
// field and say so in their note, so that a row's index is always j. The account's viewing keys
// (the UFVK, the UIVK and ZIP-32's zxviews) show every payment of its shielded addresses, so they
// are secrets like its spending key. Every key and working copy is wiped when the result is built,
// as far as the runtime allows.
import { bech32 } from "@scure/base";
import { MAX_BIP32_INDEX } from "@ckd/core/bip32-limits.js";
import { BIP32_MAINNET_VERSIONS } from "@ckd/core/networks.js";
import { bytesToHex, concatBytes, hash160, wipe } from "@ckd/core/crypto.js";
import {
  field,
  paymentAddressField,
  type Bip32BatchOptions,
  type DerivationResult,
  type DerivedRow,
  type ResultField,
} from "@ckd/core/types.js";
import type { HDKey } from "@scure/bip32";
import { withAccountBranch, type BranchChild } from "../../account-branch.js";
import { SAPLING_DIVERSIFIER_BYTES, SaplingExtendedSpendingKey } from "../../zip32-sapling.js";
import { variantDerivation, type VariantDerivation } from "../coin-variant.js";
import type { OwnedAddressRow, RuntimeCoinAdapter } from "../runtime-types.js";
import {
  ZCASH_COIN_TYPE,
  ZCASH_SAPLING_PROFILE,
  ZCASH_TRANSPARENT_PROFILE,
  ZIP32_PURPOSE,
  type ZcashSaplingProfile,
} from "./profiles.js";
import { readSaplingAddress, saplingAddressText } from "./sapling-address.js";
import { zcashTransparentAddress } from "./transparent.js";
import { encodeUnified } from "./unified.js";

/** Bech32 HRPs on mainnet of ZIP-32's encodings; a Sapling address's is in sapling-address.ts. */
const HRP = Object.freeze({
  fullViewingKey: "zxviews",
  spendingKey: "secret-extended-key-main",
});

/** What the row of an index without a Sapling address says in the place of its addresses. */
const NO_ADDRESS_NOTE =
  "No Sapling address at this index: its diversifier is not valid (ZIP-32), and wallets skip it.";

/** The external branch of the transparent account, whose index j is the Sapling row's (ZIP-316). */
const EXTERNAL_BRANCH = 0;

const NOTICES = Object.freeze([
  "zcashd and YWallet add an Orchard receiver to their unified addresses, so their texts differ from these. Where a wallet's unified address holds a Sapling receiver, it is the row's zs1 address at the same index. A unified address with only an Orchard receiver, as Zingo shows by default, has no counterpart here.",
  "About half of the diversifier indexes have no Sapling address. Wallets skip them; here each has a row that says so, so that a row's number is always its index j. Every export leaves such a row out, except that in Advanced mode Copy selected, Copy all displayed fields and Save selected give its path and index.",
  "The unified address with a transparent receiver (Advanced mode) holds the Transparent tab's address #j, m/44'/133'/account'/0/j. Sapling addresses sign no messages: ZIP 304, Zcash's Sapling address signatures, is a Draft that this page does not offer.",
  "ZIP-32 asks for a seed of at least 256 bits of entropy, as a 24-word phrase has; a phrase of fewer words derives these keys too, below that strength.",
]);

/** Why a viewing key is hidden like the spending key: the payments it shows. */
function viewingKeyDescription(payments: "incoming" | "incoming and outgoing"): string {
  return `It shows every ${payments} payment of the account's shielded addresses, so it is hidden like the spending key.`;
}

/** The Bech32 text of `bytes` under `hrp`, without BIP-173's 90-character limit (ZIP-173). */
function bech32Text(hrp: string, bytes: Uint8Array): string {
  const words = bech32.toWords(bytes);
  try {
    return bech32.encode(hrp, words, false);
  } finally {
    words.fill(0);
  }
}

/** `bytes` written by `write`, then wiped. */
function written<T>(bytes: Uint8Array, write: (bytes: Uint8Array) => T): T {
  try {
    return write(bytes);
  } finally {
    wipe(bytes);
  }
}

/** ZIP-316's P2PKH viewing item of a BIP32 key, c ‖ ser_P(pk); the caller wipes it. */
function transparentItem(node: HDKey): Uint8Array {
  const chainCode = node.chainCode;
  const publicKey = node.publicKey;
  try {
    if (chainCode === null || publicKey === null)
      throw new Error("No transparent viewing key was derived.");
    return concatBytes(chainCode, publicKey);
  } finally {
    wipe(chainCode, publicKey);
  }
}

/**
 * The label of a row's transparent receiver, the same in every row of the account, since the
 * exports' column headers take it from one row.
 */
function transparentReceiverLabel(account: number): string {
  const branch = ZCASH_TRANSPARENT_PROFILE.paths.branchPath({
    network: "mainnet",
    account,
    branch: EXTERNAL_BRANCH,
  });
  return `Its transparent receiver (t1, ${branch}/j)`;
}

/** The row of diversifier index j: its addresses, or the statement that it has none. */
function rowOf(
  profile: ZcashSaplingProfile,
  key: SaplingExtendedSpendingKey,
  account: number,
  child: BranchChild,
): DerivedRow {
  const index = child.index;
  const path = profile.path(account, index);
  const indexField = field("diversifierIndex", "Diversifier index j", String(index));
  const address = key.addressAt(BigInt(index));
  if (address === null)
    return {
      index,
      path,
      title: `Index #${index} · no Sapling address`,
      note: NO_ADDRESS_NOTE,
      basic: [],
      advanced: [field("path", "Derivation path", path), indexField],
    };
  const raw = concatBytes(address.diversifier, address.transmissionKey);
  const receiver = hash160(child.publicKey);
  try {
    return {
      index,
      path,
      title: `Address #${index}`,
      basic: [
        paymentAddressField("address", "Sapling address", saplingAddressText(raw), "zcash"),
        paymentAddressField(
          "unifiedAddress",
          "Unified address (Sapling only)",
          encodeUnified("address", { sapling: raw }),
          "zcash",
        ),
      ],
      advanced: [
        field("path", "Derivation path", path),
        paymentAddressField(
          "unifiedTransparentAddress",
          "Unified address (Sapling and transparent)",
          encodeUnified("address", { p2pkh: receiver, sapling: raw }),
          "zcash",
        ),
        field(
          "transparentReceiver",
          transparentReceiverLabel(account),
          zcashTransparentAddress(receiver),
        ),
        indexField,
        field("diversifier", "Diversifier d (hex)", bytesToHex(address.diversifier)),
      ],
    };
  } finally {
    wipe(raw, receiver);
  }
}

/** The account's viewing keys and spending key, all secrets. */
function summaryOf(
  key: SaplingExtendedSpendingKey,
  transparentAccount: HDKey,
  transparentExternal: HDKey,
  accountPath: string,
): { basicSummary: ResultField[]; summary: ResultField[] } {
  const fullViewingKey = written(transparentItem(transparentAccount), (p2pkh) =>
    written(key.fullViewingKeyEncoding(), (sapling) =>
      encodeUnified("full-viewing-key", { p2pkh, sapling }),
    ),
  );
  const incomingViewingKey = written(transparentItem(transparentExternal), (p2pkh) =>
    written(key.incomingViewingKeyEncoding(), (sapling) =>
      encodeUnified("incoming-viewing-key", { p2pkh, sapling }),
    ),
  );
  return {
    basicSummary: [
      field(
        "unifiedFullViewingKey",
        "Unified full viewing key (Sapling and transparent)",
        fullViewingKey,
        true,
        viewingKeyDescription("incoming and outgoing"),
      ),
    ],
    summary: [
      field(
        "saplingFullViewingKey",
        "Sapling extended full viewing key (zxviews)",
        written(key.extendedFullViewingKey(), (bytes) => bech32Text(HRP.fullViewingKey, bytes)),
        true,
        viewingKeyDescription("incoming and outgoing"),
      ),
      field(
        "unifiedIncomingViewingKey",
        "Unified incoming viewing key",
        incomingViewingKey,
        true,
        viewingKeyDescription("incoming"),
      ),
      field(
        "saplingSpendingKey",
        "Sapling extended spending key (secret-extended-key-main)",
        written(key.bytes(), (bytes) => bech32Text(HRP.spendingKey, bytes)),
        true,
      ),
      field(
        "derivation",
        "Derivation",
        `ZIP-32 Sapling (BLAKE2b "ZcashIP32Sapling"), ${accountPath}`,
      ),
    ],
  };
}

/** The account's Sapling key below the seed's ZIP-32 master; the caller wipes it. */
function accountKey(seed: Uint8Array, account: number): SaplingExtendedSpendingKey {
  const master = SaplingExtendedSpendingKey.fromSeed(seed);
  try {
    return master.deriveHardened([ZIP32_PURPOSE, ZCASH_COIN_TYPE, account]);
  } finally {
    master.wipe();
  }
}

/** The rows of `options`: diversifier indexes from `options.start`, of the account `options.account`. */
export function deriveZcashSapling(
  profile: ZcashSaplingProfile,
  options: Bip32BatchOptions,
): DerivationResult {
  const accountPath = profile.accountPath(options);
  // The transparent account checks the batch and lends each row its key m/44'/133'/a'/0/j.
  return withAccountBranch(
    { ...options, branch: EXTERNAL_BRANCH },
    { versions: BIP32_MAINNET_VERSIONS, paths: ZCASH_TRANSPARENT_PROFILE.paths },
    (chain) => {
      const key = accountKey(options.seed, options.account);
      try {
        return {
          id: profile.adapterId,
          title: profile.label,
          networkLabel: "Zcash mainnet",
          pathTemplate: `${accountPath} · diversifier index j`,
          ...summaryOf(key, chain.account, chain.branch, accountPath),
          rows: chain.rows((child) => rowOf(profile, key, options.account, child)),
          notices: [...NOTICES],
        };
      } finally {
        key.wipe();
      }
    },
  );
}

/**
 * The row of `account` whose Sapling address is `address` (zs1…), found by the account's own keys
 * `key` (ownsAddress, then diversifierIndexOf) at any diversifier index, so beyond the indexes a
 * search derives; null when the account does not own it, and when its index is 2^31 or more, past
 * every row's index (ZcashSaplingProfile.path), so that the rows' bound of 2^31 − 1 is also the
 * Matcher's.
 */
function ownedRow(
  profile: ZcashSaplingProfile,
  key: SaplingExtendedSpendingKey,
  account: number,
  address: string,
): OwnedAddressRow | null {
  const raw = readSaplingAddress(address);
  if (raw === undefined || raw === "malformed" || !key.ownsAddress(raw)) return null;
  const index = key.diversifierIndexOf(raw.subarray(0, SAPLING_DIVERSIFIER_BYTES));
  if (index > BigInt(MAX_BIP32_INDEX)) return null;
  return { index: Number(index), path: profile.path(account, Number(index)) };
}

/** The ownership test of the Zcash Sapling adapter id (RuntimeCoinAdapter.ownedAddresses). */
export function zcashSaplingOwnership(id: string): RuntimeCoinAdapter["ownedAddresses"] {
  if (id !== ZCASH_SAPLING_PROFILE.adapterId) return undefined;
  return (input, addresses) => {
    // The account's keys once, for every address asked about.
    const key = accountKey(input.seed, input.account);
    try {
      return addresses.map((address) =>
        ownedRow(ZCASH_SAPLING_PROFILE, key, input.account, address),
      );
    } finally {
      key.wipe();
    }
  };
}

/** The derivation of the Zcash Sapling adapter id; undefined for another id. */
export function zcashSaplingDerivation(id: string): VariantDerivation | undefined {
  return variantDerivation([ZCASH_SAPLING_PROFILE], id, deriveZcashSapling);
}

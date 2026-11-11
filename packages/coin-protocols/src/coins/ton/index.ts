import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, concatBytes, wipe } from "@ckd/core/crypto.js";
import { tonKeySeed } from "@ckd/core/ton-mnemonic.js";
import {
  field,
  paymentAddressField,
  type Bip32BatchOptions,
  type DerivationResult,
  type ResultField,
} from "@ckd/core/types.js";
import type { VariantDerivation } from "../coin-variant.js";
import {
  ed25519CoinAddresses,
  ed25519CoinDerivation,
  type Ed25519CoinKeys,
} from "../ed25519-coin.js";
import { tonFriendlyAddress } from "./address.js";
import { tonWalletAccountId, type TonWalletVersion } from "./contracts.js";
import { TON_BIP39_PROFILES, TON_STANDARD_ADAPTER, TON_STANDARD_PATH } from "./profiles.js";

const VERSION_NAMES: Readonly<Record<TonWalletVersion, string>> = Object.freeze({
  w5: "W5",
  v4r2: "v4R2",
  v3r2: "v3R2",
});

/** The address fields of `versions` for `publicKey`: the first is the row's address. */
function addressFields(
  versions: readonly TonWalletVersion[],
  publicKey: Uint8Array,
): { basic: ResultField[]; advanced: ResultField[] } {
  const accounts = versions.map((version) => ({
    name: VERSION_NAMES[version],
    accountId: tonWalletAccountId(version, publicKey),
  }));
  const [first, ...others] = accounts;
  const payment = (key: string, { name, accountId }: (typeof accounts)[number]) =>
    paymentAddressField(key, `Address (${name})`, tonFriendlyAddress(accountId));
  return {
    basic: first === undefined ? [] : [payment("address", first)],
    advanced: [
      ...others.map((account) => payment(`address${account.name}`, account)),
      ...accounts.map(({ name, accountId }) =>
        field(
          `bounceable${name}`,
          `Bounceable form (${name})`,
          tonFriendlyAddress(accountId, true),
        ),
      ),
    ],
  };
}

/** The fields of a TON key: its addresses, its public key and the 64-byte secret key TON uses. */
function keyFields(
  versions: readonly TonWalletVersion[],
  privateKey: Uint8Array,
  publicKey: Uint8Array,
): { basic: ResultField[]; advanced: ResultField[] } {
  const secretKey = concatBytes(privateKey, publicKey);
  try {
    const addresses = addressFields(versions, publicKey);
    return {
      basic: [
        ...addresses.basic,
        field("publicKey", "Public key (hex)", bytesToHex(publicKey)),
        field(
          "privateKey",
          "Secret key (64-byte hex, seed and public key)",
          bytesToHex(secretKey),
          true,
        ),
      ],
      advanced: addresses.advanced,
    };
  } finally {
    wipe(secretKey);
  }
}

const WALLETS_DIFFER =
  "One key gives a different address for each wallet contract; a wallet shows the one it deployed or holds funds in. Trust Wallet, Ledger and the Telegram wallet derive different keys from the same words.";

/** The TON keys of a BIP39 phrase, as Trust Wallet and Ledger derive them (v4R2 first). */
export const TON_BIP39_KEYS: Ed25519CoinKeys = {
  networkLabel: "TON mainnet (basechain)",
  notices: [WALLETS_DIFFER],
  fields: (privateKey, publicKey) => keyFields(["v4r2", "w5", "v3r2"], privateKey, publicKey),
};

/**
 * The key of a TON phrase, as the Telegram wallet and TON's standard wallets derive it: `seed` is
 * the phrase's 64-byte TON entropy (@ckd/core/ton-mnemonic.js), not a BIP39 seed. One phrase has one
 * key, so the only range is its first row (the adapter's limits).
 */
export function deriveTonStandard(options: Bip32BatchOptions): DerivationResult {
  if (options.start !== 0 || options.count !== 1)
    throw new RangeError("A TON phrase has one key: derive its first row only.");
  if (options.seed.length !== 64) throw new RangeError("A TON phrase's entropy has 64 bytes.");
  const privateKey = tonKeySeed(options.seed);
  try {
    const publicKey = ed25519.getPublicKey(privateKey);
    const { basic, advanced } = keyFields(["w5", "v4r2", "v3r2"], privateKey, publicKey);
    return {
      id: TON_STANDARD_ADAPTER,
      title: "TON · Telegram wallet and TON phrase",
      networkLabel: "TON mainnet (basechain)",
      pathTemplate: TON_STANDARD_PATH,
      basicSummary: [],
      summary: [],
      rows: [
        { index: 0, path: TON_STANDARD_PATH, title: "Key of the TON phrase", basic, advanced },
      ],
      notices: [
        "The Telegram wallet shows the W5 address; older TON wallets show v4R2. A BIP39 passphrase is not part of a TON phrase's key.",
        WALLETS_DIFFER,
      ],
    };
  } finally {
    wipe(privateKey);
  }
}

/** The derivation of a TON adapter id; undefined for another coin's. */
export function tonDerivation(id: string): VariantDerivation | undefined {
  if (id === TON_STANDARD_ADAPTER) return deriveTonStandard;
  return ed25519CoinDerivation(TON_BIP39_PROFILES, TON_BIP39_KEYS, id);
}

/** The v4R2 wallet address of a key, non-bounceable (UQ…), as the BIP39 variants' rows show it first. */
function tonV4R2Address(publicKey: Uint8Array): string {
  return tonFriendlyAddress(tonWalletAccountId("v4r2", publicKey));
}

/**
 * TON's public v4R2 wallet addresses of a BIP39 seed for the connected tools, Trust Wallet's and
 * Ledger's keys, as the rows show them first; the same keys' W5 and v3R2 wallets are not looked up.
 * The Telegram wallet's key comes from a TON phrase, which is not a BIP39 phrase, so no layout
 * reaches it.
 */
export const TON_ADDRESSES = ed25519CoinAddresses(
  TON_BIP39_PROFILES,
  tonV4R2Address,
  "Only each key's v4R2 wallet is read: the W5 and v3R2 wallets of the same key, which the Deriver also shows, are not looked up. The Telegram wallet (W5) is not scanned: its key comes from a TON phrase, which is not a BIP39 phrase; the Deriver derives a TON phrase's key and the Activity Viewer reads its address.",
);

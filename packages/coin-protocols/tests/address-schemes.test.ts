// The connected tools' public addresses of the account coins against the Deriver's own rows of the
// public "abandon … about" phrase: the same address at the same path, by construction, with no
// private key form made.
import { afterEach, describe, expect, it, vi } from "vitest";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { BIP32_BRANCH_SIZE } from "@ckd/core/bip32-limits.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import type { Bip32BatchOptions, DerivationResult } from "@ckd/core/types.js";
import { combinedAddressScheme, type CoinAddressScheme } from "@ckd/coins/address-scheme.js";
import { COSMOS_ADDRESSES, cosmosDerivation } from "@ckd/coins/cosmos/index.js";
import { HEDERA_ADDRESSES, hederaDerivation } from "@ckd/coins/hedera/index.js";
import { INJECTIVE_ADDRESSES, injectiveDerivation } from "@ckd/coins/injective/index.js";
import { NEAR_ADDRESSES, nearDerivation } from "@ckd/coins/near/index.js";
import { SOLANA_ADDRESSES, solanaDerivation } from "@ckd/coins/solana/index.js";
import { STELLAR_ADDRESSES, stellarDerivation } from "@ckd/coins/stellar/index.js";
import { TON_ADDRESSES, tonDerivation } from "@ckd/coins/ton/index.js";
import { TRON_ADDRESSES, tronDerivation } from "@ckd/coins/tron/index.js";
import { XRP_ADDRESSES, xrpDerivation } from "@ckd/coins/xrp/index.js";

afterEach(() => vi.restoreAllMocks());

type Derivation = (id: string) => ((options: Bip32BatchOptions) => DerivationResult) | undefined;

const SEED = mnemonicToSeed(`${"abandon ".repeat(11)}about`);

/**
 * The Deriver's row `start` of adapter `id` under `account`: its path and address, or the value of
 * its field `key` where the connected tools look up another of the row's values.
 */
function row(derivation: Derivation, id: string, account: number, start: number, key = "address") {
  const derive = derivation(id);
  if (derive === undefined) throw new Error(`${id} has no derivation.`);
  const result = derive({
    seed: SEED.slice(),
    network: "mainnet",
    account,
    branch: 0,
    start,
    count: 1,
  });
  try {
    const [first] = result.rows;
    const address = [...(first?.basic ?? []), ...(first?.advanced ?? [])].find(
      (field) => field.key === key,
    )?.value;
    if (first === undefined || address === undefined) throw new Error(`${id} gave no row.`);
    return { path: first.path, address };
  } finally {
    clearDerivationResult(result);
  }
}

/** The scheme's address and path at index `index` of layout `id` under `account`. */
function scanned(scheme: CoinAddressScheme, id: string, account: number, index: number) {
  const layout = scheme.layouts.find((candidate) => candidate.id === id);
  if (layout === undefined) throw new Error(`No layout ${id}.`);
  const opened = scheme.open(SEED);
  try {
    return { path: layout.path(account, index), address: opened.address(layout, account, index) };
  } finally {
    opened.wipe();
  }
}

const ED25519: readonly [string, CoinAddressScheme, Derivation, readonly string[]][] = [
  ["Solana", SOLANA_ADDRESSES, solanaDerivation, ["solana", "solana-ledger"]],
  ["Stellar", STELLAR_ADDRESSES, stellarDerivation, ["stellar"]],
  ["NEAR", NEAR_ADDRESSES, nearDerivation, ["near"]],
  ["TON", TON_ADDRESSES, tonDerivation, ["ton-trust", "ton-ledger"]],
  ["Hedera's Ed25519 keys", HEDERA_ADDRESSES, hederaDerivation, ["hedera"]],
];
const BIP44: readonly [string, CoinAddressScheme, Derivation, string][] = [
  ["XRP", XRP_ADDRESSES, xrpDerivation, "xrp"],
  ["Tron", TRON_ADDRESSES, tronDerivation, "tron"],
  ["Cosmos", COSMOS_ADDRESSES, cosmosDerivation, "cosmos"],
  ["Injective", INJECTIVE_ADDRESSES, injectiveDerivation, "injective"],
];

describe("the account coins' public address layouts", () => {
  it("name each Deriver variant and BIP44's account index with its path template", () => {
    expect(SOLANA_ADDRESSES.layouts.map(({ id, label }) => [id, label])).toEqual([
      ["solana", "Phantom, Solflare · m/44'/501'/i'/0'"],
      ["solana-ledger", "Ledger · m/44'/501'/i'"],
    ]);
    expect(XRP_ADDRESSES.layouts.map(({ id, label }) => [id, label])).toEqual([
      ["xrp", "BIP44 · m/44'/144'/a'/0/i"],
      ["xrp-accounts", "Ledger Live accounts · m/44'/144'/i'/0/0"],
    ]);
    expect(TRON_ADDRESSES.layouts.map(({ id }) => id)).toEqual(["tron", "tron-accounts"]);
    expect(STELLAR_ADDRESSES.layouts.map(({ id }) => id)).toEqual(["stellar"]);
    expect(NEAR_ADDRESSES.layouts.map(({ id }) => id)).toEqual(["near"]);
    expect(COSMOS_ADDRESSES.layouts.map(({ id, label }) => [id, label])).toEqual([
      ["cosmos", "BIP44 · m/44'/118'/a'/0/i"],
      ["cosmos-accounts", "Ledger Live accounts · m/44'/118'/i'/0/0"],
    ]);
    expect(INJECTIVE_ADDRESSES.layouts.map(({ id, label }) => [id, label])).toEqual([
      ["injective", "BIP44 · coin type 60 · m/44'/60'/a'/0/i"],
      ["injective-accounts", "Ledger Live accounts · m/44'/60'/i'/0/0"],
    ]);
    // Hedera's Ed25519 variant first, then its ECDSA keys, without an account-index layout.
    expect(HEDERA_ADDRESSES.layouts.map(({ id, label }) => [id, label])).toEqual([
      ["hedera", "Ed25519 · m/44'/3030'/0'/0'/i'"],
      ["hedera-ecdsa", "ECDSA · BIP44 · m/44'/3030'/a'/0/i"],
    ]);
    // Trust Wallet's and Ledger's keys; the Telegram wallet's TON phrase is no BIP39 seed.
    expect(TON_ADDRESSES.layouts.map(({ id, label }) => [id, label])).toEqual([
      ["ton-trust", "Trust Wallet · m/44'/607'/i'"],
      ["ton-ledger", "Ledger · m/44'/607'/0'/0'/i'/0'"],
    ]);
  });

  it("say what their layouts cannot reach where a coin's wallets hold more", () => {
    expect(TON_ADDRESSES.notCovered).toMatch(/Telegram wallet \(W5\) is not scanned/u);
    expect(HEDERA_ADDRESSES.notCovered).toMatch(/key list or a threshold key/u);
    for (const scheme of [SOLANA_ADDRESSES, XRP_ADDRESSES, COSMOS_ADDRESSES, INJECTIVE_ADDRESSES])
      expect(scheme.notCovered).toBeUndefined();
  });

  it("start from the published first addresses of the phrase", () => {
    expect(scanned(SOLANA_ADDRESSES, "solana", 0, 0).address).toBe(
      "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk",
    );
    expect(scanned(SOLANA_ADDRESSES, "solana-ledger", 0, 0).address).toBe(
      "GjJyeC1r2RgkuoCWMyPYkCWSGSGLcz266EaAkLA27AhL",
    );
    // SEP-0005's first account ID of the phrase.
    expect(scanned(STELLAR_ADDRESSES, "stellar", 0, 0).address).toBe(
      "GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX",
    );
    expect(scanned(NEAR_ADDRESSES, "near", 0, 0).address).toBe(
      "5510e2b44cae6eb807e3e0e45d579dda058c274abcba15e5cb84636f5d1ee412",
    );
    expect(scanned(XRP_ADDRESSES, "xrp", 0, 0).address).toBe("rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3");
    expect(scanned(TRON_ADDRESSES, "tron", 0, 0).address).toBe(
      "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH",
    );
    expect(scanned(COSMOS_ADDRESSES, "cosmos", 0, 0).address).toBe(
      "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4",
    );
    expect(scanned(INJECTIVE_ADDRESSES, "injective", 0, 0).address).toBe(
      "inj1npvwllfr9dqr8erajqqr6s0vxnk2ak55re90dz",
    );
    expect(scanned(HEDERA_ADDRESSES, "hedera", 0, 0).address).toBe(
      "0.0.302a300506032b657003210010fcec8c5db29aeab62272a08be39b1ec75eba50624351fba9948ff5d3d78ecf",
    );
    // The ECDSA key's alias, its public key in DER, which names the key as its EVM address does not.
    expect(scanned(HEDERA_ADDRESSES, "hedera-ecdsa", 0, 0).address).toBe(
      "0.0.302d300706052b8104000a032200021de0d6f31872bbda0cfd1680e41a5a88af2646b8d1d015c5e1541ab21a0f4499",
    );
    expect(scanned(TON_ADDRESSES, "ton-trust", 0, 0).address).toBe(
      "UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKY",
    );
    expect(scanned(TON_ADDRESSES, "ton-ledger", 0, 0).address).toBe(
      "UQAhEnZmOZ4XCJ1BKsvvt4D1DobiFgIf8nbZdTiT0l-8mOpj",
    );
  });

  it("give Hedera's ECDSA Deriver rows on the address index, as the alias of their DER key", () => {
    for (const [account, index] of [
      [0, 0],
      [0, 4],
      [1, 2],
    ] as const) {
      const { path, address: der } = row(
        hederaDerivation,
        "hedera-ecdsa",
        account,
        index,
        "publicKeyDer",
      );
      expect(scanned(HEDERA_ADDRESSES, "hedera-ecdsa", account, index)).toEqual({
        path,
        address: `0.0.${der}`,
      });
    }
  });

  it.each(ED25519)(
    "give %s's Deriver rows, account indexes counted from the scan's account",
    (_coin, scheme, derivation, ids) => {
      for (const id of ids)
        for (const [account, index] of [
          [0, 0],
          [0, 3],
          [2, 1],
        ] as const)
          expect(scanned(scheme, id, account, index)).toEqual(
            row(derivation, id, 0, account + index),
          );
    },
  );

  it.each(BIP44)(
    "give %s's Deriver rows on the address index and on Ledger Live's account index",
    (_coin, scheme, derivation, id) => {
      for (const [account, index] of [
        [0, 0],
        [0, 4],
        [1, 2],
      ] as const) {
        expect(scanned(scheme, id, account, index)).toEqual(row(derivation, id, account, index));
        expect(scanned(scheme, `${id}-accounts`, account, index)).toEqual(
          row(derivation, id, account + index, 0),
        );
      }
    },
  );

  it("bound each layout by the BIP32 index space left after the scan's account", () => {
    const [standard, accounts] = XRP_ADDRESSES.layouts;
    expect(standard?.maximumCount(5)).toBe(BIP32_BRANCH_SIZE);
    expect(accounts?.maximumCount(5)).toBe(BIP32_BRANCH_SIZE - 5);
    expect(SOLANA_ADDRESSES.layouts[0]?.maximumCount(5)).toBe(BIP32_BRANCH_SIZE - 5);
  });

  it("refuses another coin's layout and derives nothing hardened after the root is wiped", () => {
    const opened = XRP_ADDRESSES.open(SEED);
    const [xrp] = XRP_ADDRESSES.layouts;
    const [tron] = TRON_ADDRESSES.layouts;
    const [solana] = SOLANA_ADDRESSES.layouts;
    if (xrp === undefined || tron === undefined || solana === undefined)
      throw new Error("No layout.");
    expect(() => SOLANA_ADDRESSES.open(SEED).address(xrp, 0, 0)).toThrow(/not a layout/u);
    // A BIP44 coin refuses another BIP44 coin's layout and an Ed25519 coin's alike.
    expect(() => opened.address(tron, 0, 0)).toThrow(/not a layout/u);
    expect(() => opened.address(solana, 0, 0)).toThrow(/not a layout/u);
    opened.wipe();
    expect(() => opened.address(xrp, 0, 0)).toThrow();
  });
});

describe("a combined scheme", () => {
  it("derives each layout by the scheme that owns it and wipes every scheme it opened", () => {
    const wipes: string[] = [];
    const watched = (name: string, scheme: CoinAddressScheme): CoinAddressScheme => ({
      layouts: scheme.layouts,
      open(seed) {
        const opened = scheme.open(seed);
        return {
          address: (layout, account, index) => opened.address(layout, account, index),
          wipe() {
            wipes.push(name);
            opened.wipe();
          },
        };
      },
    });
    const combined = combinedAddressScheme(
      [watched("stellar", STELLAR_ADDRESSES), watched("xrp", XRP_ADDRESSES)],
      "What none reaches.",
    );
    expect(combined.notCovered).toBe("What none reaches.");
    expect(combined.layouts.map(({ id }) => id)).toEqual(["stellar", "xrp", "xrp-accounts"]);
    const [stellar, xrp] = combined.layouts;
    const [tron] = TRON_ADDRESSES.layouts;
    if (stellar === undefined || xrp === undefined || tron === undefined)
      throw new Error("No layout.");
    const opened = combined.open(SEED);
    expect(opened.address(stellar, 0, 0)).toBe(
      "GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX",
    );
    expect(opened.address(xrp, 0, 0)).toBe("rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3");
    expect(() => opened.address(tron, 0, 0)).toThrow(/not a layout/u);
    opened.wipe();
    expect(wipes).toEqual(["stellar", "xrp"]);
  });

  it("wipes the schemes it opened when a later one fails to open", () => {
    const wipes: string[] = [];
    const opens = (name: string): CoinAddressScheme => ({
      layouts: [],
      open: () => ({
        address: () => "",
        wipe: () => wipes.push(name),
      }),
    });
    const failing: CoinAddressScheme = {
      layouts: [],
      open: () => {
        throw new Error("No root.");
      },
    };
    expect(() => combinedAddressScheme([opens("first"), failing]).open(SEED)).toThrow("No root.");
    expect(wipes).toEqual(["first"]);
  });
});

describe("a BIP44 coin's seed addresses", () => {
  it("wipe every private node they derive, held ones at wipe() and the others at once", () => {
    const derived: HDKey[] = [];
    const wiped = new Set<HDKey>();
    const deriveChild = HDKey.prototype.deriveChild;
    const wipePrivateData = HDKey.prototype.wipePrivateData;
    const fromMasterSeed = HDKey.fromMasterSeed.bind(HDKey);
    vi.spyOn(HDKey, "fromMasterSeed").mockImplementation((seed, versions) => {
      const root = fromMasterSeed(seed, versions);
      derived.push(root);
      return root;
    });
    vi.spyOn(HDKey.prototype, "deriveChild").mockImplementation(function (
      this: HDKey,
      index: number,
    ) {
      const child = deriveChild.call(this, index);
      derived.push(child);
      return child;
    });
    vi.spyOn(HDKey.prototype, "wipePrivateData").mockImplementation(function (this: HDKey) {
      wiped.add(this);
      return wipePrivateData.call(this);
    });
    const [standard, accounts] = XRP_ADDRESSES.layouts;
    if (standard === undefined || accounts === undefined) throw new Error("No XRP layouts.");
    const opened = XRP_ADDRESSES.open(SEED);
    for (const index of [0, 1, 2]) opened.address(standard, 0, index);
    for (const index of [1, 2]) opened.address(accounts, 0, index);
    // Held: the root, the coin-type node and the last account's receive branch.
    expect(derived.filter((node) => !wiped.has(node))).toHaveLength(3);
    opened.wipe();
    expect(derived.filter((node) => !wiped.has(node))).toEqual([]);
    // Root, purpose, coin type, then per account its node and branch (accounts 0, 1, 2), and the
    // five children: the account and branch nodes are derived once per account.
    expect(derived).toHaveLength(1 + 2 + 3 * 2 + 5);
  });
});

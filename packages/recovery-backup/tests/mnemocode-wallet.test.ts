import { bytesToHex } from "@noble/hashes/utils.js";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { beforeAll, describe, expect, it } from "vitest";
import { loadMnemoCode } from "../src/mnemocode-module.js";
import type { MnemoCodeBinding } from "../src/mnemocode-engine.js";
import {
  addressCoinNames,
  addressOf,
  defaultAddressCount,
  isPlacedKind,
  matchedBy,
  offeredCoins,
  walletEvidenceOf,
  walletRecovery,
  type WalletEvidence,
} from "../src/mnemocode-wallet.js";

// The public BIP39 test phrase; its master fingerprint is 73c5da0a.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OTHER = "legal winner thank year wave sausage worth useful legal winner thank yellow";

let binding: MnemoCodeBinding;
beforeAll(async () => {
  binding = await loadMnemoCode();
});

function check(evidence: WalletEvidence, phrase = PHRASE) {
  using made = walletEvidenceOf(binding, evidence);
  using result = made.check(phrase, "");
  return { matched: result.matched, path: result.path, warning: result.warning };
}

// The first Dash Core receiving address of the public test phrase, m/44'/5'/0'/0/0.
const dash = (index: number, addresses?: number): WalletEvidence =>
  addresses === undefined
    ? {
        kind: "address",
        value: "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5",
        location: { account: 0, branch: 0, index },
      }
    : {
        kind: "address",
        value: "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5",
        location: { account: 0, branch: 0, index },
        addresses,
      };

describe("MnemoCode wallet evidence in the Deriver", () => {
  it("tells evidence at a place of an account from the master's", () => {
    expect(isPlacedKind("master-fingerprint")).toBe(false);
    expect(isPlacedKind("master-xpub")).toBe(false);
    expect(isPlacedKind("address")).toBe(true);
    expect(isPlacedKind("account-xpub")).toBe(true);
    expect(matchedBy("master-fingerprint")).toBe("fingerprint");
    expect(matchedBy("address")).toBe("address");
    expect(matchedBy("wif")).toBe("key");
  });

  it("matches the master fingerprint, which is only a filter", () => {
    const fingerprint: WalletEvidence = {
      kind: "master-fingerprint",
      value: "73c5da0a",
      network: "mainnet",
    };
    expect(check(fingerprint)).toMatchObject({ matched: true, path: "m" });
    expect(check(fingerprint).warning).toMatch(/fingerprint/u);
    expect(check(fingerprint, OTHER).matched).toBe(false);
  });

  it("matches a Bitcoin address at the path its type names, with no coin or type asked", () => {
    // BIP84's first receiving address of the public test phrase.
    const address: WalletEvidence = {
      kind: "address",
      value: "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
      location: { account: 0, branch: 0, index: 0 },
    };
    expect(check(address)).toMatchObject({ matched: true, path: "m/84'/0'/0'/0/0" });
  });

  it("reads an address as every coin whose form it has, and names them", () => {
    // BIP44's first receiving address of the public test phrase, also Bitcoin Cash's form.
    const legacy = "1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA";
    expect(addressCoinNames(binding, legacy)).toEqual(["Bitcoin", "Bitcoin Cash"]);
    expect(addressOf(["Bitcoin", "Bitcoin Cash"])).toBe("an address of Bitcoin or Bitcoin Cash");
    expect(
      check({ kind: "address", value: legacy, location: { account: 0, branch: 0, index: 0 } }),
    ).toMatchObject({ matched: true, path: "m/44'/0'/0'/0/0" });
    expect(addressCoinNames(binding, "not an address")).toEqual([]);
  });

  it("looks for a public key under every address type, with no type asked", () => {
    // The public key of BIP84's first receiving address of the public test phrase.
    const publicKey = HDKey.fromMasterSeed(mnemonicToSeedSync(PHRASE)).derive(
      "m/84'/0'/0'/0/0",
    ).publicKey!;
    const key: WalletEvidence = {
      kind: "compressed-public-key",
      value: bytesToHex(publicKey),
      location: { network: "mainnet", account: 0, branch: 0, index: 0 },
    };
    expect(check(key)).toMatchObject({ matched: true, path: "m/84'/0'/0'/0/0" });
  });

  it("matches a Dash address at its place, or among the addresses from an earlier one", () => {
    expect(check(dash(0)).matched).toBe(true);
    expect(check(dash(1)).matched).toBe(false);
  });

  it("offers every coin of this file, Bitcoin first", () => {
    const coins = offeredCoins(binding).map((coin) => coin.id);
    expect(coins[0]).toBe("bitcoin");
    expect(coins).toContain("dash");
    expect(coins).toHaveLength(12);
    expect(offeredCoins(binding).find((coin) => coin.id === "dash")?.addressForms).toBe(
      "X… or dash1k…",
    );
  });

  it("refuses a count of addresses that MnemoCode refuses, before any search", () => {
    expect(() => walletEvidenceOf(binding, dash(0, 0))).toThrow();
    expect(() => walletEvidenceOf(binding, dash(0, 1_001))).toThrow();
    expect(defaultAddressCount(0)).toBe(20);
    expect(defaultAddressCount(2 ** 31 - 3)).toBe(3);
  });

  it("makes the searches of recovery with the wallet, or without one", () => {
    using without = walletRecovery(binding, undefined);
    using withWallet = walletRecovery(binding, {
      evidence: { kind: "master-fingerprint", value: "73c5da0a", network: "mainnet" },
      passphrase: "",
    });
    expect(without).toBeDefined();
    expect(withWallet).toBeDefined();
  });
});

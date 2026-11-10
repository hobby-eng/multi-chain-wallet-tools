// TON against published values: Trust Wallet wallet-core's v4R2 and W5 addresses of known keys, and
// ton-crypto's mnemonic vector; the addresses of the public phrases come from
// test/oracles/ton_oracle.py, which first reproduces those and the published code hashes.
import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { bytesToHex, hexToBytes } from "@ckd/core/crypto.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import { tonEntropy, tonKeySeed } from "@ckd/core/ton-mnemonic.js";
import { isTonPhrase, tonWords } from "@ckd/core/ton-phrase.js";
import type { DerivationResult } from "@ckd/core/types.js";
import { TON_COIN_ADAPTERS } from "@ckd/coins/adapters/ton.js";
import { tonAccountId, tonAddressesEqual, tonFriendlyAddress } from "@ckd/coins/ton/address.js";
import { tonWalletAddress } from "@ckd/coins/ton/contracts.js";
import { tonDerivation } from "@ckd/coins/ton/index.js";

const ABOUT = `${"abandon ".repeat(11)}about`;
const TON_PHRASE =
  "hospital stove relief fringe tongue always charge angry urge sentence again match nerve inquiry senior coconut label tumble carry category beauty bean road solution";
const publicKeyOf = (privateKeyHex: string) => ed25519.getPublicKey(hexToBytes(privateKeyHex));

/** Every field of the first row of adapter `id` for `seed`, by key. */
function fieldsOf(id: string, seed: Uint8Array): Record<string, string> {
  const derive = tonDerivation(id);
  if (derive === undefined) throw new Error(`${id} has no derivation.`);
  const result: DerivationResult = derive({
    seed,
    network: "mainnet",
    account: 0,
    branch: 0,
    start: 0,
    count: 1,
  });
  try {
    const row = result.rows[0];
    return Object.fromEntries(
      [...(row?.basic ?? []), ...(row?.advanced ?? [])].map(({ key, value }) => [key, value]),
    );
  } finally {
    clearDerivationResult(result);
  }
}

describe("TON", () => {
  it("gives wallet-core's v4R2 and W5 addresses of known keys", () => {
    expect(tonWalletAddress("v4r2", publicKeyOf("46".repeat(32)))).toBe(
      "UQAoYT8nMLfeNh6h0uIoK_wLm9JkvxiGxJDr6GRXJGu2Zked",
    );
    expect(
      tonWalletAddress(
        "v4r2",
        publicKeyOf("5849481021e305dfdf9f0eaf87e07f15efec3fde8d8ed639c9fcf0bc351d998b"),
      ),
    ).toBe("UQAACKJfEIfI5vkht_w3NYk8k-OU5Xl_jq9XNmmkcPaUO-tB");
    expect(
      tonWalletAddress(
        "w5",
        publicKeyOf("502d60b0f3327382e7d0585b789f1db9aa04907fe5cddc5c28818ec163ebf4ba"),
      ),
    ).toBe("UQCh41gQP1A4I0lnAn6yAfitDAIYpXG6UFIXqeSz1TVxNOJ_");
  });

  it("reads ton-crypto's mnemonic vector and refuses a BIP39 phrase as a TON phrase", () => {
    const words = tonWords(TON_PHRASE);
    if (words === null) throw new Error("The vector is 24 English words.");
    const seed = tonKeySeed(tonEntropy(words));
    expect(bytesToHex(seed) + bytesToHex(ed25519.getPublicKey(seed))).toBe(
      "9d659a6c2234db7f6e4f977e6e8653b9f5946d557163f31034011375d8f3f97df6c450a16bb1c514e22f1977e390a3025599aa1e7b00068a6aacf2119484c1bd",
    );
    expect(isTonPhrase(TON_PHRASE)).toBe(true);
    // 24 list words with BIP39's checksum, which TON's check refuses (the oracle).
    expect(isTonPhrase(`${"abandon ".repeat(23)}art`)).toBe(false);
    expect(isTonPhrase(ABOUT)).toBe(false);
    expect(tonWords("hospital stove")).toBeNull();
  });

  it("derives the TON phrase's W5, v4R2 and v3R2 addresses and the BIP39 variants' v4R2", () => {
    const words = tonWords(TON_PHRASE) ?? "";
    const standard = fieldsOf("ton", tonEntropy(words));
    expect([standard.address, standard.addressv4R2, standard.addressv3R2]).toEqual([
      "UQDSLOFVamNZzdy4LulclcCBEFkRReZ7WscBCLAw3Pg53h3h",
      "UQAYZ-rchbaHK4IUkCvcyl3V8spcAnO8IBRCNvS3are-CbyQ",
      "UQDbuMbjSKj1IkoMU-whUDd5v2Om4G6tVwrwBxlrBmBtq12L",
    ]);
    expect(fieldsOf("ton-trust", mnemonicToSeed(ABOUT)).address).toBe(
      "UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKY",
    );
    const ledger = fieldsOf("ton-ledger", mnemonicToSeed(ABOUT));
    expect([ledger.address, ledger.addressv3R2]).toEqual([
      "UQAhEnZmOZ4XCJ1BKsvvt4D1DobiFgIf8nbZdTiT0l-8mOpj",
      "UQBVq4M3qemaHSby_YVxqy9rd9LJeJ0WFGV-ikA4NnZNnhyN",
    ]);
  });

  it("derives one key from a TON phrase and refuses any other range or a short seed", () => {
    const derive = tonDerivation("ton");
    const entropy = tonEntropy(tonWords(TON_PHRASE) ?? "");
    const input = { seed: entropy, network: "mainnet" as const, account: 0, branch: 0 };
    expect(() => derive?.({ ...input, start: 1, count: 1 })).toThrow(RangeError);
    expect(() => derive?.({ ...input, start: 0, count: 2 })).toThrow(RangeError);
    expect(() => derive?.({ ...input, seed: new Uint8Array(32), start: 0, count: 1 })).toThrow(
      RangeError,
    );
  });

  it("compares TON addresses by account, whatever their form", () => {
    const uq = "UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKY";
    const accountId = tonAccountId(uq);
    expect(accountId).not.toBeNull();
    expect(tonFriendlyAddress(accountId ?? new Uint8Array(32), true)).toBe(
      "EQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-U9d",
    );
    expect(tonAddressesEqual(uq, "EQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9+U9d")).toBe(true);
    expect(tonAddressesEqual(uq, "UQAhEnZmOZ4XCJ1BKsvvt4D1DobiFgIf8nbZdTiT0l-8mOpj")).toBe(false);
    expect(tonAddressesEqual(uq, "UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKZ")).toBe(false);
    expect(tonAccountId("UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RK")).toBeNull();
    // The masterchain (workchain 0xFF, -1), with a valid checksum.
    expect(tonAccountId("Uf8zWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-e3Q")).toBeNull();
    expect(() => tonFriendlyAddress(new Uint8Array(31))).toThrow();
  });

  it("offers the Telegram wallet, Trust Wallet and Ledger tabs, Trust Wallet first chosen", () => {
    expect(
      TON_COIN_ADAPTERS.map(({ id, defaultVariant }) => [id, defaultVariant === true]),
    ).toEqual([
      ["ton", false],
      ["ton-trust", true],
      ["ton-ledger", false],
    ]);
    expect(TON_COIN_ADAPTERS.map(({ id, seedSource }) => [id, seedSource ?? "bip39"])).toEqual([
      ["ton", "ton-phrase"],
      ["ton-trust", "bip39"],
      ["ton-ledger", "bip39"],
    ]);
  });
});

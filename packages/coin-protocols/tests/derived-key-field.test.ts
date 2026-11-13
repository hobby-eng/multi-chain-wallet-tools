import { expect, it } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import { bytesToHex } from "@ckd/core/crypto.js";
import { DerivedPrivateKey, secp256k1HexKey } from "@ckd/core/derived-private-key.js";
import { SOLANA_MESSAGE_SIGNING } from "../src/coins/solana/message-signing.js";
import { NEAR_MESSAGE_SIGNING } from "../src/coins/near/message-signing.js";
import { STELLAR_MESSAGE_SIGNING } from "../src/coins/stellar/message-signing.js";
import { TON_MESSAGE_SIGNING } from "../src/coins/ton/message-signing.js";
import { getRuntimeCoinAdapter } from "../src/coins/runtime-registry.js";
import { TEST_MNEMONIC } from "@ckd/test-support/helpers.js";

/** Row 0 of an adapter for the public test phrase, and the values of its address and `key`. */
async function row(adapterId: string, key: string) {
  const seed = mnemonicToSeed(TEST_MNEMONIC);
  try {
    const result = await getRuntimeCoinAdapter(adapterId).derive({
      seed,
      network: "mainnet",
      account: 0,
      branch: 0,
      start: 0,
      count: 1,
    });
    const fields = [...result.rows[0]!.basic, ...result.rows[0]!.advanced];
    const value = (name: string) => fields.find((field) => field.key === name)?.value ?? "";
    return { result, address: value("address"), key: value(key) };
  } finally {
    seed.fill(0);
  }
}

it.each(["ethereum", "ethereum-classic", "tron"])(
  "lends %s's key from the privateKey field that the coin names",
  async (adapterId) => {
    const { result, address, key } = await row(adapterId, "privateKey");
    expect(key).toMatch(/^[0-9a-f]{64}$/u);
    using owner = new DerivedPrivateKey(result, address, "address", secp256k1HexKey("privateKey"));
    expect(owner.hex).toBe(key);
  },
);

it("finds no key on such a row without the coin's field, as before", async () => {
  const { result, address } = await row("ethereum", "privateKey");
  expect(() => new DerivedPrivateKey(result, address)).toThrow(
    expect.objectContaining({ code: "derivation.key.unavailable" }),
  );
});

it("refuses a WIF privateKey as a raw key, and keeps reading a UTXO row's own field", async () => {
  const wif = await row("bitcoin-legacy", "privateKey");
  expect(
    () => new DerivedPrivateKey(wif.result, wif.address, "address", secp256k1HexKey("privateKey")),
  ).toThrow(expect.objectContaining({ code: "derivation.key.material" }));
  const child = await row("litecoin-legacy", "childPrivateKey");
  using owner = new DerivedPrivateKey(child.result, child.address);
  expect(owner.hex).toBe(child.key);
});

it.each([
  ["solana", SOLANA_MESSAGE_SIGNING],
  ["near", NEAR_MESSAGE_SIGNING],
  ["stellar", STELLAR_MESSAGE_SIGNING],
  ["ton-trust", TON_MESSAGE_SIGNING],
  ["ton", TON_MESSAGE_SIGNING],
] as const)(
  "lends %s's Ed25519 seed, read from its row as its coin writes it, whose key is the row's",
  async (adapterId, coin) => {
    const { result, address, key: publicKey } = await row(adapterId, "publicKey");
    using owner = new DerivedPrivateKey(result, address, "address", coin.key);
    expect(owner.bytes).toHaveLength(32);
    const derived = ed25519.getPublicKey(owner.bytes);
    expect(
      publicKey.endsWith(adapterId === "near" ? base58.encode(derived) : bytesToHex(derived)),
    ).toBe(true);
  },
);

it.each([
  ["a public key", "GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L"],
  ["a seed with a broken checksum", "SAKICEVQLYWGSOJS4WW7HZJWAHZVEEBS527LHK5V4MLJALYKICQCJXMX"],
])("refuses %s in Stellar's seed field", (_name, text) => {
  expect(() => STELLAR_MESSAGE_SIGNING.key?.read(text)).toThrow(
    expect.objectContaining({ code: "derivation.key.material" }),
  );
});

it.each([
  ["Solana's 31-byte seed", SOLANA_MESSAGE_SIGNING, "00".repeat(31)],
  ["TON's 32-byte secret", TON_MESSAGE_SIGNING, "00".repeat(32)],
])("refuses %s", (_name, coin, text) => {
  expect(() => coin.key?.read(text)).toThrow(
    expect.objectContaining({ code: "derivation.key.material" }),
  );
});

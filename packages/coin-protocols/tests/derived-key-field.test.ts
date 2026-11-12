import { expect, it } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { DerivedPrivateKey } from "@ckd/core/derived-private-key.js";
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
    using owner = new DerivedPrivateKey(result, address, "address", "privateKey");
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
  expect(() => new DerivedPrivateKey(wif.result, wif.address, "address", "privateKey")).toThrow(
    expect.objectContaining({ code: "derivation.key.material" }),
  );
  const child = await row("litecoin-legacy", "childPrivateKey");
  using owner = new DerivedPrivateKey(child.result, child.address);
  expect(owner.hex).toBe(child.key);
});

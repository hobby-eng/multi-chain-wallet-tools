import { describe, expect, it } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { hexToBytes } from "@ckd/core/crypto.js";
import { DerivedPrivateKey } from "@ckd/core/derived-private-key.js";
import { BITCOIN_CASH_MESSAGE_SIGNING as bitcoinCash } from "../src/coins/bitcoin-cash/message-signing.js";
import { getRuntimeCoinAdapter } from "../src/coins/runtime-registry.js";

const request = (address: string, message: string) =>
  ({ format: "bitcoin-cash-compact", address, message, network: "mainnet" }) as const;
const verify = (address: string, message: string, signature: string) =>
  Promise.resolve().then(() => bitcoinCash.verify(request(address, message), signature));

// Electron Cash electroncash/tests/test_bitcoin.py L56-L103 (plain RFC 6979 and Bitcoin ABC
// nonce); its CashAddr is re-encoded by tmp check/a2_vectors.py.
const CHANCELLOR = "Chancellor on brink of second bailout for banks";
const CASHADDR = "bitcoincash:qqehccy89v7ftlfgr9v0zvhjzyy7eatdkqt05lt3nw";
const LEGACY = "15hETetDmcXm1mM4sEf7U2KXC9hDHFMSzz";
const SIGNATURE =
  "H/9jMOnj4MFbH3d7t4yCQ9i7DgZU/VZ278w3+ySv2F4yIsdqjsc5ng3kmN8OZAThgyfCZOQxZCWza9V5XzlVY0Y=";
const EXAMPLE = "This is an example of a signed message.";

describe("Bitcoin Cash's message signing", () => {
  it("signs Electron Cash's vector for the CashAddr and for its legacy form alike", async () => {
    const key = hexToBytes("7e96f68c3c15d6884d254c2b68356faf15b4d0f00001fc2f1e9e4f9e434ba9cd");
    for (const address of [CASHADDR, LEGACY]) {
      const signed = await bitcoinCash.sign(key, request(address, CHANCELLOR), []);
      expect(signed).toMatchObject({ signature: SIGNATURE, verified: true });
      expect(await verify(address, CHANCELLOR, SIGNATURE)).toBe(true);
      expect(await verify(address, `${CHANCELLOR}!`, SIGNATURE)).toBe(false);
    }
  });

  it.each([
    [
      "Electron Cash's Bitcoin ABC nonce",
      CASHADDR,
      CHANCELLOR,
      "IA+oq/uGz4kKA2bNgxPcM+T216abyUiBhofMg1J8fC5BLAbbIpF2toCHaO7/LQAxhQBtu5D6ROq1JjXiRwPAASg=",
    ],
    [
      "Trezor's verify vector",
      "bitcoincash:qqj22md58nm09vpwsw82fyletkxkq36zxyxh322pru",
      EXAMPLE,
      "IJ4j7fDk5H/x3sJ/Ms14xQ507wGO6Kat81rhfHqbDdlvSLST/X26sD77b0OcY4PJUjs7vF8afRWKavkKsVTpvoA=",
    ],
    [
      "Bitcoin Cash Node's vector",
      "bitcoincash:qpst4g85jjecec7fgr02vlecqnw9950mjsf0678ndh",
      "This is just a test message",
      "IPDOIFcWd8LzOr70CXaal4+uG2ZZWcbHqutyGeO7AJ0MWbqq9C+u3KP9ScjtLzsIgY3st5n8XFQvgMZ0KrDQ9vg=",
    ],
  ])("verifies %s", async (_name, address, message, signature) => {
    expect(await verify(address, message, signature)).toBe(true);
  });

  it("verifies an uncompressed key's signature (headers 27–30) for both its forms", async () => {
    // Our own answer for the key 1 (tmp check/a2_vectors.py); 1EHNa6… is its known address.
    const signature =
      "G3fcO9sr+K04dbegeXN7uU1PRgo538UFG5eawYMXK8ZxfE8LegyeCj3CKIR87lMZ0xaktP65In3kejkdZhi8da8=";
    const message = "Offline message signing self-test";
    for (const address of [
      "1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm",
      "bitcoincash:qzgmyjle755g2v5kptrg02asx5f8k8fg55zdx7hd4l",
    ])
      expect(await verify(address, message, signature)).toBe(true);
    expect(await verify("15hETetDmcXm1mM4sEf7U2KXC9hDHFMSzz", message, signature)).toBe(false);
  });

  it("reproduces Trezor's sign vector from the derived row, through either address field", async () => {
    // Trezor tests/device_tests/bitcoin/test_signmessage.py L182-L193, the "all" × 12 test seed.
    const derive = async () => {
      const seed = mnemonicToSeed(Array(12).fill("all").join(" "), "");
      try {
        return await getRuntimeCoinAdapter("bitcoin-cash").derive({
          seed,
          network: "mainnet",
          account: 0,
          branch: 0,
          start: 0,
          count: 1,
        });
      } finally {
        seed.fill(0);
      }
    };
    const signature =
      "H9p3M+ZmpKuLqG88/Dco0xjs+CSjv5lZdXApeqExYHwQMWlZE2ssUAsrR4pzxWO6MUwLeyoiBlttlZYRjyRtNg4=";
    const cashAddr = "bitcoincash:qr08q88p9etk89wgv05nwlrkm4l0urz4cyl36hh9sv";
    {
      using key = new DerivedPrivateKey(await derive(), cashAddr, "address");
      const signed = await bitcoinCash.sign(key.bytes, request(cashAddr, EXAMPLE), key.fields);
      expect(signed.signature).toBe(signature);
    }
    const row = await derive();
    const legacy =
      row.rows[0]?.advanced.find((field) => field.key === "legacyAddress")?.value ?? "";
    expect(legacy).toMatch(/^1/u);
    using key = new DerivedPrivateKey(row, legacy, "legacyAddress");
    const signed = await bitcoinCash.sign(key.bytes, request(legacy, EXAMPLE), key.fields);
    expect(signed).toMatchObject({ signature, verified: true });
  });
});

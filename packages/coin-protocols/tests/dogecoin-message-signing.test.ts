import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes } from "@ckd/core/crypto.js";
import { compactMessageDigest } from "@ckd/core/compact-message-internal.js";
import { DOGECOIN_MESSAGE_SIGNING as dogecoin } from "../src/coins/dogecoin/message-signing.js";

// bitcoinjs-message test/fixtures.json L67-L131; the uncompressed address is re-encoded by tmp
// check/a2_vectors.py.
const request = (address: string, message = "vires is numeris") =>
  ({ format: "dogecoin-compact", address, message, network: "mainnet" }) as const;
const COMPRESSED =
  "H6k+dZwJ8oOei3PCSpdj603fDvhlhQ+sqaFNIDvo/bI+Xh6zyIKGzZpyud6YhZ1a5mcrwMVtTWL+VXq/hC5Zj7s=";
const UNCOMPRESSED =
  "G6k+dZwJ8oOei3PCSpdj603fDvhlhQ+sqaFNIDvo/bI+Xh6zyIKGzZpyud6YhZ1a5mcrwMVtTWL+VXq/hC5Zj7s=";

describe("Dogecoin's message signing", () => {
  it.each([
    ["Vires is Numeris", "c0963d20d0accd0ea0df6c1020bf85a7e629a40e7b5363f2c3e9dcafd5638f12"],
    ["Virès is Numéris", "188eaf871fc659e3dd7503863fcfe051db149eb4dd8fd77ef020f099b7122b75"],
  ])("hashes %j as bitcoinjs-message does", (message, digest) => {
    expect(bytesToHex(compactMessageDigest(message, "Dogecoin Signed Message:\n"))).toBe(digest);
  });

  it("reproduces the key 1's compressed signature and verifies it", async () => {
    const address = "DFpN6QqFfUm3gKNaxN6tNcab1FArL9cZLE";
    const signed = await dogecoin.sign(hexToBytes("01".padStart(64, "0")), request(address), []);
    expect(signed).toMatchObject({ signature: COMPRESSED, verified: true });
    expect(await dogecoin.verify(request(address), COMPRESSED)).toBe(true);
    expect(await dogecoin.verify(request(address, "Vires is numeris"), COMPRESSED)).toBe(false);
    expect(await dogecoin.verify(request(address), UNCOMPRESSED)).toBe(false);
  });

  it("verifies the uncompressed signature for the uncompressed address", async () => {
    expect(await dogecoin.verify(request("DJRU7MLhcPwCTNRZ4e8gJzDebtG1H5M7pc"), UNCOMPRESSED)).toBe(
      true,
    );
  });
});

import { describe, expect, it } from "vitest";
import { encodeP2pkh, hash160, secp256k1 } from "../src/crypto.js";
import { verifyCompactP2pkhMessage } from "../src/compact-message.js";
import {
  signDashCompactP2pkhMessage,
  verifyDashCompactP2pkhMessage,
} from "../src/compact-message-dash.js";

const MESSAGE = "offline message fixture";

function fixture(network: "mainnet" | "testnet") {
  const privateKey = new Uint8Array(32);
  privateKey[31] = 1;
  const prefix = network === "mainnet" ? 0x4c : 0x8c;
  const address = encodeP2pkh(hash160(secp256k1.getPublicKey(privateKey, true)), prefix);
  return { privateKey, address };
}

describe("the Dash-only compact verifier", () => {
  for (const network of ["mainnet", "testnet"] as const) {
    it(`answers as the shared verifier on ${network}`, () => {
      const { privateKey, address } = fixture(network);
      const { signature } = signDashCompactP2pkhMessage(privateKey, address, MESSAGE, network);
      for (const message of [MESSAGE, "different message"])
        expect(verifyDashCompactP2pkhMessage(address, message, signature, network)).toBe(
          verifyCompactP2pkhMessage(address, message, signature, "dash", network),
        );
      expect(verifyDashCompactP2pkhMessage(address, MESSAGE, signature, network)).toBe(true);
    });
  }

  it("refuses a Bitcoin signature of the same key and message", () => {
    const { privateKey, address } = fixture("mainnet");
    const bitcoinAddress = encodeP2pkh(hash160(secp256k1.getPublicKey(privateKey, true)), 0x00);
    const { signature } = signDashCompactP2pkhMessage(privateKey, address, MESSAGE, "mainnet");
    expect(
      verifyCompactP2pkhMessage(bitcoinAddress, MESSAGE, signature, "bitcoin", "mainnet"),
    ).toBe(false);
  });

  it.each([
    ["not Base64 text", "*", "INVALID_BASE64"],
    ["a short signature", "AAAA", "INVALID_SIGNATURE_LENGTH"],
    ["an unknown header", `j${"A".repeat(86)}=`, "INVALID_HEADER"],
  ])("refuses %s with its code", (_name, signature, code) => {
    const { address } = fixture("mainnet");
    expect(() => verifyDashCompactP2pkhMessage(address, MESSAGE, signature, "mainnet")).toThrow(
      expect.objectContaining({ code }),
    );
  });
});

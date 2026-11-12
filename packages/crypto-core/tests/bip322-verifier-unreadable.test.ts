import { describe, expect, it } from "vitest";
import { encodeP2pkh, hash160, secp256k1 } from "../src/crypto.js";
import { verifyBip322Message } from "../src/bip322-verifier.js";
import { signCompactP2pkhMessage } from "../src/compact-message.js";
import { signDashCompactP2pkhMessage } from "../src/compact-message-dash.js";

// The real btcutil-js backend (the test WASM alias): its parse failures are pinned by their text.
const MESSAGE = "offline message fixture";
const key = Uint8Array.from([...new Uint8Array(31), 1]);
const publicKey = secp256k1.getPublicKey(key, true);
const address = encodeP2pkh(hash160(publicKey), 0x00);
const dashAddress = encodeP2pkh(hash160(publicKey), 0x4c);
// BIP-322's "Hello World" simple signature of bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l.
const SIMPLE_VECTOR =
  "smpAkcwRAIgZRfIY3p7/DoVTty6YZbWS71bc5Vct9p9Fia83eRmw2QCICK/ENGfwLtptFluMGs2KsqoNSk89pO7F29zJLUx9a/sASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI=";

describe("BIP-322 verification refuses text that is no BIP-322 signature", () => {
  it.each([
    [
      "a BIP137 compact signature",
      signCompactP2pkhMessage(key, address, MESSAGE, "bitcoin", "mainnet").signature,
    ],
    [
      "a Dash compact signature",
      signDashCompactP2pkhMessage(key, dashAddress, MESSAGE, "mainnet").signature,
    ],
    ["text that is not Base64", "not a signature"],
    ["Base64 that is no witness", "AAAA"],
    ["a full-variant prefix without a transaction", "fulAAAA"],
    ["a proof-of-funds prefix without a packet", `pof${btoa("a".repeat(100))}`],
    ["a signature too short to read", "="],
  ])("refuses %s as UNREADABLE_SIGNATURE", async (_name, signature) => {
    await expect(verifyBip322Message(MESSAGE, address, signature, "mainnet")).rejects.toMatchObject(
      {
        code: "UNREADABLE_SIGNATURE",
        message: "The signature is not a BIP-322 signature.",
      },
    );
  });

  it("still answers false for a readable witness that does not satisfy the address", async () => {
    // A two-item witness whose script check fails: an outcome, not a refusal.
    const witness = `smp${btoa(String.fromCharCode(2, 3, 1, 2, 3, 2, 9, 9))}`;
    expect(
      await verifyBip322Message(
        MESSAGE,
        "bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l",
        witness,
        "mainnet",
      ),
    ).toEqual({ valid: false });
  });

  it.each([
    ["P2PKH", "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH"],
    ["P2SH-P2WPKH", "3JvL6Ymt8MVWiCNHC7oWU6nLeHNJKLZGLN"],
  ])(
    "refuses BIP-322's simple vector for a %s address as SIMPLE_FOR_ADDRESS",
    async (_type, to) => {
      await expect(
        verifyBip322Message("Hello World", to, SIMPLE_VECTOR, "mainnet"),
      ).rejects.toMatchObject({ code: "SIMPLE_FOR_ADDRESS" });
    },
  );
});

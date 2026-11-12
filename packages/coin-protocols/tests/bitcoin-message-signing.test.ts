import { describe, expect, it } from "vitest";
import { NETWORK, TEST_NETWORK, p2pkh, p2sh, p2tr, p2wpkh } from "@scure/btc-signer";
import { bytesToHex, secp256k1 } from "@ckd/core/crypto.js";
import type { ResultField } from "@ckd/core/types.js";
import { BITCOIN_MESSAGE_SIGNING } from "../src/coins/bitcoin/message-signing.js";
import type { MessageSigningRequest } from "../src/coins/message-signing.js";

const privateKey = Uint8Array.from([...new Uint8Array(31), 1]);
const publicKey = secp256k1.getPublicKey(privateKey, true);

/** The public script fields that a derived Bitcoin row carries. */
function fields(scripts: Record<string, Uint8Array | undefined>): ResultField[] {
  return Object.entries(scripts).flatMap(([key, bytes]) =>
    bytes === undefined ? [] : [{ key, label: key, value: bytesToHex(bytes), secret: false }],
  );
}

/** Signs `request`, then checks that the signature verifies and fails for another message. */
async function roundTrip(request: MessageSigningRequest, rowFields: readonly ResultField[]) {
  const signed = await BITCOIN_MESSAGE_SIGNING.sign(privateKey, request, rowFields);
  expect(signed.verified).toBe(true);
  expect(await BITCOIN_MESSAGE_SIGNING.verify(request, signed.signature)).toBe(true);
  expect(
    await BITCOIN_MESSAGE_SIGNING.verify(
      { ...request, message: `${request.message} changed` },
      signed.signature,
    ),
  ).toBe(false);
  return signed;
}

describe("Bitcoin's message signing", () => {
  it("reproduces the compact signature of the public key 1", async () => {
    const signed = await roundTrip(
      {
        format: "bitcoin-compact",
        address: "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH",
        message: "Offline message signing self-test",
        network: "mainnet",
      },
      [],
    );
    // The self-test's pinned answer (message-signer-self-test-bitcoin.ts).
    expect(signed).toEqual({
      signature:
        "H3fcO9sr+K04dbegeXN7uU1PRgo538UFG5eawYMXK8ZxfE8LegyeCj3CKIR87lMZ0xaktP65In3kejkdZhi8da8=",
      format: "Bitcoin compact P2PKH (BIP137)",
      verified: true,
    });
  });

  it("signs legacy full messages and preserves testnet witness addresses", async () => {
    for (const [payment, format, network] of [
      [p2pkh(publicKey, NETWORK), "bitcoin-bip322-legacy", "mainnet"],
      [p2wpkh(publicKey, TEST_NETWORK), "bitcoin-bip322-native", "testnet"],
    ] as const) {
      const request = { format, address: payment.address, message: "public fixture", network };
      await roundTrip(request, fields({ scriptPubKey: payment.script }));
    }
  });

  it("signs native SegWit simple messages", async () => {
    const payment = p2wpkh(publicKey, NETWORK);
    const signed = await roundTrip(
      {
        format: "bitcoin-bip322-native",
        address: payment.address,
        message: "native SegWit fixture",
        network: "mainnet",
      },
      fields({ scriptPubKey: payment.script }),
    );
    expect(signed.format).toBe("BIP-322 simple");
  });

  it("signs nested SegWit full messages", async () => {
    const witness = p2wpkh(publicKey, NETWORK);
    const payment = p2sh(witness, NETWORK);
    const signed = await roundTrip(
      {
        format: "bitcoin-bip322-nested",
        address: payment.address,
        message: "nested SegWit fixture",
        network: "mainnet",
      },
      fields({ scriptPubKey: payment.script, redeemScript: witness.script }),
    );
    expect(signed.format).toBe("BIP-322 full");
  });

  it("signs Taproot key-path simple messages", async () => {
    const internalKey = publicKey.slice(1);
    const payment = p2tr(internalKey, undefined, NETWORK);
    const signed = await roundTrip(
      {
        format: "bitcoin-bip322-taproot",
        address: payment.address,
        message: "Taproot fixture",
        network: "mainnet",
      },
      fields({ scriptPubKey: payment.script, internalPublicKey: internalKey }),
    );
    expect(signed.format).toBe("BIP-322 simple");
  });

  it("leaves the borrowed key to its owner", async () => {
    const key = privateKey.slice();
    await BITCOIN_MESSAGE_SIGNING.sign(
      key,
      {
        format: "bitcoin-compact",
        address: "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH",
        message: "public fixture",
        network: "mainnet",
      },
      [],
    );
    expect(key).toEqual(privateKey);
  });

  it("refuses a compact signature pasted under BIP-322, and a compact one that names no key", async () => {
    const request = {
      format: "bitcoin-compact",
      address: "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH",
      message: "public fixture",
      network: "mainnet",
    } as const;
    const { signature } = await BITCOIN_MESSAGE_SIGNING.sign(privateKey, request, []);
    await expect(
      Promise.resolve().then(() =>
        BITCOIN_MESSAGE_SIGNING.verify({ ...request, format: "bitcoin-bip322-legacy" }, signature),
      ),
    ).rejects.toMatchObject({ code: "UNREADABLE_SIGNATURE" });
    // Header 31, r = 0 and s = 1: no point has x = 0.
    const zeroR = btoa(String.fromCharCode(31, ...new Uint8Array(63), 1));
    await expect(
      Promise.resolve().then(() => BITCOIN_MESSAGE_SIGNING.verify(request, zeroR)),
    ).rejects.toMatchObject({ code: "RECOVERY_FAILED" });
  });
});

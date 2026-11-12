import { describe, expect, it } from "vitest";
import { hexToBytes } from "@ckd/core/crypto.js";
import { LITECOIN_MESSAGE_SIGNING as litecoin } from "../src/coins/litecoin/message-signing.js";

// Litecoin Core test/functional/rpc_signmessage.py L20-L28; the mainnet addresses of its key and
// the typed-header signatures are tmp check/a2_vectors.py's (our own, from the published r||s).
const KEY = hexToBytes("d2b8a0116d641fe7d3036f8464628fb595b480414c13a301b3d4038c811c28b0");
const MESSAGE = "This is just a test message";
const request = (format: string, address: string, message = MESSAGE) =>
  ({ format, address, message, network: "mainnet" }) as const;
const verify = (format: string, address: string, message: string, signature: string) =>
  Promise.resolve().then(() => litecoin.verify(request(format, address, message), signature));

describe("Litecoin's message signing", () => {
  it.each([
    [
      "litecoin-compact-legacy",
      "LU3QhpXxRDuzgBH2osX9xGaWi3ihkjGdKH",
      "IGve8AOjIcu+a/nYW1PABSfmp2oQlEqLIOwPgNW5/Y5teggr8S0vy4SMdjL2Viv3iuBZjJbhvyBo0tv5m3H63b8=",
    ],
    [
      "litecoin-compact-nested",
      "MDxzgdz1A29o9XF1nXi8wwLF1Ns1jgbZL3",
      "JGve8AOjIcu+a/nYW1PABSfmp2oQlEqLIOwPgNW5/Y5teggr8S0vy4SMdjL2Viv3iuBZjJbhvyBo0tv5m3H63b8=",
    ],
    [
      "litecoin-compact-native",
      "ltc1qvza2pay5kwxw8j2qm6n87wqym3fdr7u55fd9ep",
      "KGve8AOjIcu+a/nYW1PABSfmp2oQlEqLIOwPgNW5/Y5teggr8S0vy4SMdjL2Viv3iuBZjJbhvyBo0tv5m3H63b8=",
    ],
  ])("signs %s for %s with its header", async (format, address, signature) => {
    const signed = await litecoin.sign(KEY, request(format, address), []);
    expect(signed).toMatchObject({ signature, verified: true });
    expect(await verify(format, address, MESSAGE, signature)).toBe(true);
    expect(await verify(format, address, `${MESSAGE}!`, signature)).toBe(false);
  });

  it("refuses to sign a row whose address is not the format's form of the key", async () => {
    await expect(
      Promise.resolve().then(() =>
        litecoin.sign(
          KEY,
          request("litecoin-compact-native", "LU3QhpXxRDuzgBH2osX9xGaWi3ihkjGdKH"),
          [],
        ),
      ),
    ).rejects.toMatchObject({ code: "SIGNING_FAILED" });
  });

  it("answers false for a typed header of another address type", async () => {
    const nested =
      "JGve8AOjIcu+a/nYW1PABSfmp2oQlEqLIOwPgNW5/Y5teggr8S0vy4SMdjL2Viv3iuBZjJbhvyBo0tv5m3H63b8=";
    expect(
      await verify(
        "litecoin-compact-legacy",
        "LU3QhpXxRDuzgBH2osX9xGaWi3ihkjGdKH",
        MESSAGE,
        nested,
      ),
    ).toBe(false);
  });

  it("never proves the old 3… form of a nested address, which the page does not offer", async () => {
    // The same script hash under version 5 (tmp check/a2_vectors.py's key, re-encoded).
    const oldForm = "37krNka3CuJNM1y7geio8J5qggGZjjEj8o";
    const nested =
      "JGve8AOjIcu+a/nYW1PABSfmp2oQlEqLIOwPgNW5/Y5teggr8S0vy4SMdjL2Viv3iuBZjJbhvyBo0tv5m3H63b8=";
    await expect(
      Promise.resolve().then(() =>
        litecoin.sign(KEY, request("litecoin-compact-nested", oldForm), []),
      ),
    ).rejects.toMatchObject({ code: "SIGNING_FAILED" });
    expect(await verify("litecoin-compact-nested", oldForm, MESSAGE, nested)).toBe(false);
  });

  // Electrum-LTC electrum_ltc/tests/test_bitcoin.py L190-L245: verify-only vectors. Its two typed
  // ones (headers 35 and 40) are Trezor's Bitcoin r||s, whose Litecoin keys Electrum-LTC recovered
  // under the Litecoin magic: they verify by construction, and pin only the header and address
  // handling, not an independent Litecoin signer.
  const EXAMPLE = "This is an example of a signed message.";
  const ELECTRUM_SEGWIT =
    "H3nh1AqVvauwclOAPs2serBtro9Iei1Q7vZZfmivo6ioQ6EzNYq5No90CU5RXM17d05eO+bXd0p/r/Sl5fPz390=";
  it.each([
    [
      "BIP137 header 35",
      "litecoin-compact-nested",
      "MS2NsKymog9TrEVq4wbrjn1oYS7MiPDkqR",
      EXAMPLE,
      "I3RN5FFvrFwUCAgBVmRRajL+rZTeiXdc7H4k28JP4TMHWsCTAcTMjhl76ktkgWYdW46b8Z2Le4o4Ls21PC7gdQ0=",
      true,
    ],
    [
      "its r||s under header 27",
      "litecoin-compact-nested",
      "MS2NsKymog9TrEVq4wbrjn1oYS7MiPDkqR",
      EXAMPLE,
      "G3RN5FFvrFwUCAgBVmRRajL+rZTeiXdc7H4k28JP4TMHWsCTAcTMjhl76ktkgWYdW46b8Z2Le4o4Ls21PC7gdQ0=",
      false,
    ],
    [
      "BIP137 header 40",
      "litecoin-compact-native",
      "ltc1qnw6a545d64e94r4vts80n89nmcpud5fdftvryq",
      EXAMPLE,
      "KLVddgDZ6afipJFV3fPP2455bCB/qrgzAQ+kH7eCiIm8R89iNIp6qgkjwIMqWJ+rVB6PEutU+3EckOIwfw9msZQ=",
      true,
    ],
    [
      "Electrum's untyped header on a nested address",
      "litecoin-compact-nested",
      "MKkwVip3KDUb2WFJqr8bGebGPHNAXwGG1f",
      "Electrum",
      ELECTRUM_SEGWIT,
      true,
    ],
    [
      "Electrum's untyped header on a native address",
      "litecoin-compact-native",
      "ltc1qq2tmmcngng78nllq2pvrkchcdukemtj57q7cpl",
      "Electrum",
      ELECTRUM_SEGWIT,
      true,
    ],
    [
      "a compressed legacy signature",
      "litecoin-compact-legacy",
      "LPvBisC3rGmpGa3E3NeQk3PHQN4VS237y2",
      "Chancellor on brink of second bailout for banks",
      "IHGAMaPxjrn3CD19S7J5KAq4xF6mdLznsSL8SrqhNwficUHlK5wSth6/JiZ/pEyo92nkUoA+kL9VJpjLnKJKTmM=",
      true,
    ],
    [
      "an uncompressed legacy signature",
      "litecoin-compact-legacy",
      "LacEkfqxYsPqDuS8ZCstJUc59gxVm2DQaT",
      "Electrum",
      "G14KtfFZQYjyhz4PUzX/yz8eEC1BFHsaEKZOJGLeTWJoNp/umpi5zPeCvhUcgSoMtAkmw3pATrM2bcDdYi1tqIs=",
      true,
    ],
  ])("verifies Electrum-LTC's %s", async (_name, format, address, message, signature, valid) => {
    expect(await verify(format, address, message, signature)).toBe(valid);
  });

  it("refuses a header that no format uses", async () => {
    const header24 =
      "GLVddgDZ6afipJFV3fPP2455bCB/qrgzAQ+kH7eCiIm8R89iNIp6qgkjwIMqWJ+rVB6PEutU+3EckOIwfw9msZQ=";
    await expect(
      verify(
        "litecoin-compact-native",
        "ltc1qnw6a545d64e94r4vts80n89nmcpud5fdftvryq",
        EXAMPLE,
        header24,
      ),
    ).rejects.toMatchObject({ code: "INVALID_HEADER" });
  });
});

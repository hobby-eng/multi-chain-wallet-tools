// Cosmos's and Injective's ADR-036, Injective's EIP-191 and Hedera's HIP-820, against published
// vectors and check/d_vectors.py's answers (tmp/message-signing-2026-11-11): vectors.py's RFC 6979,
// Keccak-256, SHA-256, bech32 and Ed25519 in pure Python, which first reproduce eth-account's and
// hedera-wallet-connect's signatures and verify Keplr's juno signature.
import { describe, expect, it } from "vitest";
import { base64 } from "@scure/base";
import { bytesToHex, hexToBytes, secp256k1, sha256 } from "@ckd/core/crypto.js";
import type { MessageSigningRequest } from "../src/coins/message-signing.js";
import { adr036Document } from "../src/coins/message-signing-adr036.js";
import { COSMOS_MESSAGE_SIGNING } from "../src/coins/cosmos/message-signing.js";
import { INJECTIVE_MESSAGE_SIGNING } from "../src/coins/injective/message-signing.js";
import { HEDERA_MESSAGE_SIGNING } from "../src/coins/hedera/message-signing.js";
import { ETHEREUM_MESSAGE_SIGNING } from "../src/coins/ethereum/message-signing.js";

const [INJECTIVE_ADR036, INJECTIVE_EIP191] = INJECTIVE_MESSAGE_SIGNING;
const [HEDERA_ED25519, HEDERA_ECDSA] = HEDERA_MESSAGE_SIGNING;
const KEY_1 = hexToBytes("01".padStart(64, "0"));
const PUBLIC_KEY_1 = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const MESSAGE = "Offline message signing self-test";
const request = (
  format: string,
  address: string,
  message = MESSAGE,
  inputs?: Record<string, string>,
): MessageSigningRequest => ({
  format,
  address,
  message,
  network: "mainnet",
  ...(inputs === undefined ? {} : { inputs }),
});
/** A promise of a call that may throw at once, so that a refusal reads as a rejection. */
const attempt = (run: () => unknown) => Promise.resolve().then(run);

/** The high-S twin of an r‖s signature: the same r, n − s. */
function highS(signature: Uint8Array): Uint8Array {
  const s = BigInt(`0x${bytesToHex(signature.slice(32))}`);
  const twin = signature.slice();
  twin.set(hexToBytes((secp256k1.Point.Fn.ORDER - s).toString(16).padStart(64, "0")), 32);
  return twin;
}

describe("ADR-036's sign document", () => {
  it("is Keplr's sorted, compact JSON, byte for byte", () => {
    expect(new TextDecoder().decode(adr036Document("cosmos1example", "test"))).toBe(
      '{"account_number":"0","chain_id":"","fee":{"amount":[],"gas":"0"},"memo":"","msgs":[{"type":"sign/MsgSignData","value":{"data":"dGVzdA==","signer":"cosmos1example"}}],"sequence":"0"}',
    );
    expect(
      bytesToHex(sha256(adr036Document("cosmos1w508d6qejxtdg4y5r3zarvary0c5xw7k6ah60c", MESSAGE))),
    ).toBe("dbe220fee7fe366092dd80ffb1d63e75291c1dde58b7bdfee7e453518aabcda2");
  });

  it("verifies Keplr's published juno signature under SHA-256, and refuses it under Keccak-256 or another message", () => {
    const publicKey = base64.decode("Avt8e5UqfoRAh0RBUzHCu9arv7UFEFdfcv657h6TtSZE");
    const signature = base64.decode(
      "9PrDYrTb1tv/TALC/lgRIIekfwNMBPOra0QpaAqNCbADXT8vR9n0SS7L2OSaXma3UMrOLGTbWlLDImNhcZVgzA==",
    );
    const signer = "juno105asxv7pt0fzxlz642pf4svm29u39zxzdq2ad5";
    const verify = (digest: Uint8Array) =>
      secp256k1.verify(signature, digest, publicKey, { prehash: false });
    expect(verify(sha256(adr036Document(signer, "test")))).toBe(true);
    expect(verify(sha256(adr036Document(signer, "test!")))).toBe(false);
  });

  it("refuses an empty message, as Keplr refuses empty data", () => {
    expect(() => adr036Document("cosmos1example", "")).toThrow(
      expect.objectContaining({ code: "EMPTY_MESSAGE" }),
    );
  });
});

describe("Cosmos ADR-036", () => {
  const address = "cosmos1w508d6qejxtdg4y5r3zarvary0c5xw7k6ah60c";
  const inputs = { publicKey: PUBLIC_KEY_1 };
  const answer =
    '{"pub_key":{"type":"tendermint/PubKeySecp256k1","value":"Anm+Zn753LusVaBilc6HCwcCm/zbLc4o2VnygVsW+BeY"},"signature":"i6NTtxP/0eLjKzcpMkhcbGFjzfcZlllFV+12hrkFNoZaId/L3H5cwO6poxmpkDwYY0h818vE0CI1/crBcy+1+A=="}';

  it("signs the independent implementation's response and verifies it or its bare signature", async () => {
    const signed = await COSMOS_MESSAGE_SIGNING.sign(KEY_1, request("cosmos-adr036", address), []);
    expect(signed).toMatchObject({ signature: answer, verified: true });
    const bare = (JSON.parse(answer) as { signature: string }).signature;
    for (const pasted of [answer, bare])
      expect(
        await COSMOS_MESSAGE_SIGNING.verify(
          request("cosmos-adr036", address, MESSAGE, inputs),
          pasted,
        ),
      ).toBe(true);
  });

  it.each([
    ["another message", request("cosmos-adr036", address, `${MESSAGE}!`, inputs)],
    ["no public key", request("cosmos-adr036", address)],
    [
      "another key",
      request("cosmos-adr036", address, MESSAGE, {
        publicKey: "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
      }),
    ],
  ])("answers false for %s", async (_name, asked) => {
    expect(await COSMOS_MESSAGE_SIGNING.verify(asked, answer)).toBe(false);
  });

  it("refuses the high-S twin of its signature", async () => {
    const signature = base64.decode((JSON.parse(answer) as { signature: string }).signature);
    const twin = base64.encode(highS(signature));
    expect(
      await COSMOS_MESSAGE_SIGNING.verify(request("cosmos-adr036", address, MESSAGE, inputs), twin),
    ).toBe(false);
  });

  it.each([
    "cosmos1hftz5ugqmpg9243xeegsqqav62f8hnywsjr4xr",
    "cosmos1hftz5ugqmpg9243xeegsqqav62f8hnyw3gdu30",
  ])("refuses the specification's own example for %s", async (signer) => {
    const example = request("cosmos-adr036", signer, "random", {
      publicKey: bytesToHex(base64.decode("AqnDSiRoFmTPfq97xxEb2VkQ/Hm28cPsqsZm9jEVsYK9")),
    });
    const signature =
      "8y8i34qJakkjse9pOD2De+dnlc4KvFgh0wQpes4eydN66D9kv7cmCEouRrkka9tlW9cAkIL52ErB+6ye7X5aEg==";
    expect(await COSMOS_MESSAGE_SIGNING.verify(example, signature)).toBe(false);
  });

  it.each(['{"signature":1}', '{"pub_key":{}}', "{not json", "AA=="])(
    "refuses the response %j, which holds no 64-byte Base64 signature",
    async (pasted) => {
      await expect(
        attempt(() =>
          COSMOS_MESSAGE_SIGNING.verify(request("cosmos-adr036", address, MESSAGE, inputs), pasted),
        ),
      ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    },
  );
});

describe("Injective", () => {
  const address = "inj10e0525sfrf53yh2aljmm3sn9jq5njk7lwfmzjf";
  const inputs = { publicKey: PUBLIC_KEY_1 };
  const answer =
    '{"pub_key":{"type":"tendermint/PubKeySecp256k1","value":"Anm+Zn753LusVaBilc6HCwcCm/zbLc4o2VnygVsW+BeY"},"signature":"mjr1L6L8UoX57sP0XwOdByNR9FVheFiaay3vSFa2Ji5aTgfJNDP8r3V7S5/q6XciYcE5pok37lBoIhdCtF3Rzg=="}';

  it("signs ADR-036 with Keccak-256 as the independent implementation does", async () => {
    const signed = await INJECTIVE_ADR036!.sign(KEY_1, request("injective-adr036", address), []);
    expect(signed.signature).toBe(answer);
    expect(
      await INJECTIVE_ADR036!.verify(request("injective-adr036", address, MESSAGE, inputs), answer),
    ).toBe(true);
  });

  it("writes a signature that SHA-256's document refuses, so Cosmos's digest never verifies it", () => {
    const signature = base64.decode((JSON.parse(answer) as { signature: string }).signature);
    const digest = sha256(adr036Document(address, MESSAGE));
    expect(secp256k1.verify(signature, digest, hexToBytes(PUBLIC_KEY_1), { prehash: false })).toBe(
      false,
    );
  });

  it("signs eth-account's published EIP-191 answer for the inj1 form of its address, which Ethereum's format also verifies", async () => {
    const key = hexToBytes("4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318");
    const signature =
      "0xb91467e570a6466aa9e9876cbcd013baba02900b8979d43fe208a4a4f339f5fd6007e74cd82e037b800186422fc2da167c747ef045e5d18a5f5d4300f8e1a0291c";
    const inj = request(
      "injective-eip191",
      "inj1936ndcmqtkwpdfar67ccnrjjjwt2vhpr00nrtt",
      "Some data",
    );
    expect((await INJECTIVE_EIP191!.sign(key, inj, [])).signature).toBe(signature);
    const eth = request(
      "ethereum-eip191",
      "0x2c7536E3605D9C16a7a3D7b1898e529396a65c23",
      "Some data",
    );
    expect(await ETHEREUM_MESSAGE_SIGNING.verify(eth, signature)).toBe(true);
    expect(await INJECTIVE_EIP191!.verify({ ...inj, message: "Some data!" }, signature)).toBe(
      false,
    );
  });

  it("shares one key source between its two parts", () => {
    expect(INJECTIVE_ADR036!.key).toBe(INJECTIVE_EIP191!.key);
  });
});

describe("Hedera HIP-820", () => {
  const ed25519Address =
    "0.0.302a300506032b6570032100a2ef13761b644a651a1a4ac666eafbac419c97282f8af5c33f58d732e73e5a55";
  const ecdsaAddress = "0xcAE54ce22E3b27062a1729f49Dea2BB12CEE259e";
  const ecdsaInputs = {
    publicKey: "0278279df21ae3cd30610627b1e423ebb7405c54b8039af552c4b458fb63aa8d33",
  };
  const ed25519Map =
    "CmQKIKLvE3YbZEplGhpKxmbq+6xBnJcoL4r1wz9Y1zLnPlpVGkBtfDTfBZGf/MUbovYyLUjORErDGhDYbzPFoAbkMwRrpw2ouDRmn6Dd6A06k6yM/FhZ/VjdHVhQUd+fxv1cZqUM";
  const ecdsaMap =
    "CmUKIQJ4J53yGuPNMGEGJ7HkI+u3QFxUuAOa9VLEtFj7Y6qNMzJAp3vxT7kRPE9HFFm/bbArGYDQ+psNWZC70rdW2bE1L85u79GOlQSTlaog5lmE6TiaX6r8Bk70dU7ZIwcHgnAkCw==";
  const ed25519 = (message = "Hello Future") =>
    request("hedera-hip820-ed25519", ed25519Address, message);
  const ecdsa = (message = "Hello Future") =>
    request("hedera-hip820-ecdsa", ecdsaAddress, message, ecdsaInputs);

  it("signs hedera-wallet-connect's published SignatureMaps for both key types", async () => {
    const edKey = hexToBytes("133eefea772add1f995c96bccf42b08b76daf67665f0c4c5ae308fae9275c142");
    const ecKey = hexToBytes("3ce31ffad30d6db47c315bbea08232aad2266d8800a12aa3d8a812486e782759");
    expect((await HEDERA_ED25519!.sign(edKey, ed25519(), [])).signature).toBe(ed25519Map);
    expect((await HEDERA_ECDSA!.sign(ecKey, ecdsa(), [])).signature).toBe(ecdsaMap);
    expect(await HEDERA_ED25519!.verify(ed25519(), ed25519Map)).toBe(true);
    expect(await HEDERA_ECDSA!.verify(ecdsa(), ecdsaMap)).toBe(true);
  });

  it("reads the bare signature as well, and refuses another message", async () => {
    const bare = base64.encode(base64.decode(ed25519Map).slice(-64));
    expect(await HEDERA_ED25519!.verify(ed25519(), bare)).toBe(true);
    expect(await HEDERA_ED25519!.verify(ed25519("Hello Future!"), ed25519Map)).toBe(false);
    expect(await HEDERA_ECDSA!.verify(ecdsa("Hello Future!"), ecdsaMap)).toBe(false);
  });

  it("refuses the high-S twin of an ECDSA signature", async () => {
    const map = base64.decode(ecdsaMap);
    const twin = map.slice();
    twin.set(highS(map.slice(-64)), map.length - 64);
    expect(await HEDERA_ECDSA!.verify(ecdsa(), base64.encode(twin))).toBe(false);
  });

  it.each([
    ["the other key type's map", "ecdsa", ed25519Map],
    ["a truncated map", "ed25519", base64.encode(base64.decode(ed25519Map).slice(0, -1))],
    [
      "a map with an unknown field",
      "ed25519",
      base64.encode(Uint8Array.of(0x12, 0x00, ...base64.decode(ed25519Map))),
    ],
    ["text that is not Base64", "ed25519", "Hello Future"],
  ] as const)("refuses %s", async (_name, kind, pasted) => {
    const part = kind === "ecdsa" ? HEDERA_ECDSA! : HEDERA_ED25519!;
    await expect(
      attempt(() => part.verify(kind === "ecdsa" ? ecdsa() : ed25519(), pasted)),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
  });

  it("refuses text that is not ASCII, whose length Hedera wallets count differently", async () => {
    await expect(
      attempt(() => HEDERA_ED25519!.verify(ed25519("Grüße"), ed25519Map)),
    ).rejects.toMatchObject({ code: "NOT_ASCII" });
  });

  it("answers false for an ECDSA row without its public key, or with another key", async () => {
    const without = request("hedera-hip820-ecdsa", ecdsaAddress, "Hello Future");
    expect(await HEDERA_ECDSA!.verify(without, ecdsaMap)).toBe(false);
    const other = { ...ecdsa(), inputs: { publicKey: PUBLIC_KEY_1 } };
    expect(await HEDERA_ECDSA!.verify(other, ecdsaMap)).toBe(false);
  });
});

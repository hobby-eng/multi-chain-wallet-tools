import { describe, expect, it } from "vitest";
import { hexToBytes } from "@ckd/core/crypto.js";
import { ETHEREUM_MESSAGE_SIGNING as ethereum } from "../src/coins/ethereum/message-signing.js";
import { ETHEREUM_CLASSIC_MESSAGE_SIGNING as classic } from "../src/coins/ethereum-classic/message-signing.js";
import { TRON_MESSAGE_SIGNING as tron } from "../src/coins/tron/message-signing.js";
import type { CoinMessageSigning } from "../src/coins/message-signing.js";

const request = (format: string, address: string, message: string) =>
  ({ format, address, message, network: "mainnet" }) as const;
const verify = (
  coin: CoinMessageSigning,
  format: string,
  address: string,
  message: string,
  signature: string,
) => Promise.resolve().then(() => coin.verify(request(format, address, message), signature));

// eth-account, viem and TronWeb's published vectors (RESEARCH.md); the EIP-55 forms and the key 1's
// EIP-191 signature are tmp check/b_vectors.py's.
const CASES = [
  [
    "eth-account 'Some data'",
    ethereum,
    "ethereum-eip191",
    "4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318",
    "0x2c7536E3605D9C16a7a3D7b1898e529396a65c23",
    "Some data",
    "0xb91467e570a6466aa9e9876cbcd013baba02900b8979d43fe208a4a4f339f5fd6007e74cd82e037b800186422fc2da167c747ef045e5d18a5f5d4300f8e1a0291c",
  ],
  [
    "eth-account '10284'",
    ethereum,
    "ethereum-eip191",
    "4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318",
    "0x2c7536E3605D9C16a7a3D7b1898e529396a65c23",
    "10284",
    "0x00515bc8fd32264e21ec0820e8c5123ed58c1195c9ea17cb018b1ad4073cc5a60080f5dcec397a5a8c523082bfa41771568903aa554ec06ba8475ca9050fb7d51b",
  ],
  [
    "viem 'hello world', on Ethereum Classic",
    classic,
    "ethereum-classic-eip191",
    "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "hello world",
    "0xa461f509887bd19e312c0c58467ce8ff8e300d3c1a90b608a760c5b80318eaf15fe57c96f9175d6cd4daad4663763baa7e78836e067d0163e9a2ccf2ff753f5b1b",
  ],
  [
    "TronWeb 'hello world'",
    tron,
    "tron-tip191",
    "01".padStart(64, "0"),
    "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC",
    "hello world",
    "0x0dc0b53d525e0103a6013061cf18e60cf158809149f2b8994a545af65a7004cb1eeaff560e801ab51b28df5d42549aa024c2aa7e9d34de1e01294b9afb5e6c7e1c",
  ],
] as const;

describe("EIP-191 and TIP-191 message signing", () => {
  it.each(CASES)(
    "reproduces %s, and refuses it for another message",
    async (_n, coin, format, key, address, message, signature) => {
      const signed = await coin.sign(hexToBytes(key), request(format, address, message), []);
      expect(signed).toMatchObject({ signature, verified: true });
      expect(await verify(coin, format, address, message, signature)).toBe(true);
      expect(await verify(coin, format, address, `${message}!`, signature)).toBe(false);
    },
  );

  it("compares Ethereum addresses without regard to case, and a Tron address exactly", async () => {
    const [, , , , address, message, signature] = CASES[0];
    expect(
      await verify(ethereum, "ethereum-eip191", address.toLowerCase(), message, signature),
    ).toBe(true);
    expect(await verify(classic, "ethereum-classic-eip191", address, message, signature)).toBe(
      true,
    );
    const [, , , , tronAddress, tronMessage, tronSignature] = CASES[3];
    expect(
      await verify(tron, "tron-tip191", tronAddress.toLowerCase(), tronMessage, tronSignature),
    ).toBe(false);
  });

  it("never reuses a signature between EIP-191 and TIP-191", async () => {
    const eip191 =
      "0xb2f2fc7c6a8cba85f3467fbd736a26661b81912ce0734edc6dbdc5fa08f1fc934b5844407e3c35ed0f2735b4ccb5660b3452f3738be82fa4ace9873220c43e151c";
    const ethereumAddress = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";
    expect(await verify(ethereum, "ethereum-eip191", ethereumAddress, "hello world", eip191)).toBe(
      true,
    );
    expect(
      await verify(
        tron,
        "tron-tip191",
        "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC",
        "hello world",
        eip191,
      ),
    ).toBe(false);
    expect(
      await verify(ethereum, "ethereum-eip191", ethereumAddress, "hello world", CASES[3][6]),
    ).toBe(false);
  });

  it("refuses to sign for an address that is not the key's", async () => {
    await expect(
      Promise.resolve().then(() =>
        ethereum.sign(hexToBytes(CASES[0][3]), request("ethereum-eip191", CASES[2][4], "x"), []),
      ),
    ).rejects.toMatchObject({ code: "SIGNING_FAILED" });
  });

  it("names the row field that holds each coin's key", () => {
    for (const coin of [ethereum, classic, tron]) expect(coin.keyField).toBe("privateKey");
  });

  it("refuses Tron's high-S twin, as TronWeb's verifyMessageV2 does, and keeps Ethereum lenient", async () => {
    // The same r with s' = n - s and the other v: the same key, an equally valid ECDSA signature.
    const twin = (signature: string) => {
      const s = BigInt(`0x${signature.slice(66, 130)}`);
      const n = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
      const v = Number.parseInt(signature.slice(130), 16);
      return `${signature.slice(0, 66)}${(n - s).toString(16).padStart(64, "0")}${(55 - v).toString(16)}`;
    };
    const [, , , , tronAddress, tronMessage, tronSignature] = CASES[3];
    await expect(
      verify(tron, "tron-tip191", tronAddress, tronMessage, twin(tronSignature)),
    ).rejects.toMatchObject({
      code: "HIGH_S",
    });
    const [, , , , address, message, signature] = CASES[0];
    expect(await verify(ethereum, "ethereum-eip191", address, message, twin(signature))).toBe(true);
  });
});

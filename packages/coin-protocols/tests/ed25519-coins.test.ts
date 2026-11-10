// The Ed25519 coins (Solana, Stellar, NEAR, Hedera) against published vectors: Stellar's SEP-0005
// tests, near-seed-phrase's test, the Hiero (Hedera) SDK's Mnemonic tests and Trust Wallet
// wallet-core's addresses of the private key 0x46…46. Solana publishes no phrase vector; its values
// come from test/oracles/ed25519_oracle.py, a standard-library reimplementation that first
// reproduces every published vector above.
import { describe, expect, it } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { hexToBytes } from "@ckd/core/crypto.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import type { Bip32BatchOptions, DerivationResult, ResultField } from "@ckd/core/types.js";
import { hederaDerivation, HEDERA_ED25519_KEYS } from "@ckd/coins/hedera/index.js";
import { nearDerivation, NEAR_KEYS } from "@ckd/coins/near/index.js";
import { solanaDerivation, SOLANA_KEYS } from "@ckd/coins/solana/index.js";
import { stellarDerivation, STELLAR_KEYS } from "@ckd/coins/stellar/index.js";
import { SOLANA_COIN_ADAPTERS } from "@ckd/coins/adapters/solana.js";
import { paymentQrPayload } from "@ckd/ui/payment-qr.js";

type Derivation = (id: string) => ((options: Bip32BatchOptions) => DerivationResult) | undefined;

/** Every field of the rows `start` to `start + count - 1` of adapter `id`, by key. */
function rowsOf(
  derivation: Derivation,
  id: string,
  phrase: string,
  start: number,
  count: number,
  passphrase = "",
): Record<string, string>[] {
  const derive = derivation(id);
  if (derive === undefined) throw new Error(`${id} has no derivation.`);
  const seed = mnemonicToSeed(phrase, passphrase);
  const result = derive({ seed, network: "mainnet", account: 0, branch: 0, start, count });
  try {
    return result.rows.map((row) =>
      Object.fromEntries(
        [...row.basic, ...row.advanced].map(({ key, value }: ResultField) => [key, value]),
      ),
    );
  } finally {
    clearDerivationResult(result);
  }
}

const ABOUT = `${"abandon ".repeat(11)}about`;

/** The address field of Solana's first key of the public phrase on adapter `id`. */
function addressOf(id: string): ResultField {
  const derive = solanaDerivation(id);
  if (derive === undefined) throw new Error(`${id} has no derivation.`);
  const seed = mnemonicToSeed(ABOUT);
  const result = derive({ seed, network: "mainnet", account: 0, branch: 0, start: 0, count: 1 });
  const field = result.rows[0]?.basic.find(({ key }) => key === "address");
  if (field === undefined) throw new Error(`${id} gave no address.`);
  return field;
}
const KEY_0X46 = hexToBytes("46".repeat(32));
const fieldsOfKey = (
  fields: (seed: Uint8Array, publicKey: Uint8Array) => { basic: ResultField[] },
) => fields(KEY_0X46, ed25519.getPublicKey(KEY_0X46)).basic[0]?.value;

describe("Ed25519 coins", () => {
  it("give SEP-0005's Stellar accounts and secret seeds, with and without a passphrase", () => {
    const test1 = rowsOf(
      stellarDerivation,
      "stellar",
      "illness spike retreat truth genius clock brain pass fit cave bargain toe",
      0,
      2,
    );
    expect(test1.map(({ address, privateKey }) => [address, privateKey])).toEqual([
      [
        "GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ6",
        "SBGWSG6BTNCKCOB3DIFBGCVMUPQFYPA2G4O34RMTB343OYPXU5DJDVMN",
      ],
      [
        "GBAW5XGWORWVFE2XTJYDTLDHXTY2Q2MO73HYCGB3XMFMQ562Q2W2GJQX",
        "SCEPFFWGAG5P2VX5DHIYK3XEMZYLTYWIPWYEKXFHSK25RVMIUNJ7CTIS",
      ],
    ]);
    const test4 = rowsOf(
      stellarDerivation,
      "stellar",
      "cable spray genius state float twenty onion head street palace net private method loan turn phrase state blanket interest dry amazing dress blast tube",
      0,
      1,
      "p4ssphr4se",
    );
    expect(test4[0]?.address).toBe("GDAHPZ2NSYIIHZXM56Y36SBVTV5QKFIZGYMMBHOU53ETUSWTP62B63EQ");
    const test5 = rowsOf(stellarDerivation, "stellar", ABOUT, 2, 1);
    expect(test5[0]?.address).toBe("GBFPWBTN4AXHPWPTQVQBP4KRZ2YVYYOGRMV2PEYL2OBPPJDP7LECEVHR");
    expect(test5[0]?.path).toBe("m/44'/148'/2'");
  });

  it("give near-seed-phrase's NEAR keys at m/44'/397'/0'", () => {
    const [row] = rowsOf(
      nearDerivation,
      "near",
      "shoot island position soft burden budget tooth cruel issue economy destroy above",
      0,
      1,
    );
    expect(row?.publicKey).toBe("ed25519:r4yuiZE45mzeZAENDEF2pWeFBJkW8mQYGx3rU46zCqh");
    expect(row?.privateKey).toBe(
      "ed25519:3jFpZEcbhcjpqVE27zU3d7WHcS7Wq716v5WryU8Tj4EaNTHTj8iAhtPW7KCdFV2fnjNf9toawUbdqZnhrRtLKe6w",
    );
  });

  it("give the Hiero SDK's standard Hedera Ed25519 and ECDSA keys", () => {
    const phrase =
      "inmate flip alley wear offer often piece magnet surge toddler submit right radio absent pear floor belt raven price stove replace reduce plate home";
    const [first] = rowsOf(hederaDerivation, "hedera", phrase, 0, 1);
    expect(first?.privateKeyHex).toBe(
      "f8dcc99a1ced1cc59bc2fee161c26ca6d6af657da9aa654da724441343ecd16f",
    );
    expect(first?.publicKey).toBe(
      "302a300506032b65700321002e42c9f5a5cdbde64afa65ce3dbaf013d5f9ff8d177f6ef4eb89fbe8c084ec0d",
    );
    const [last] = rowsOf(hederaDerivation, "hedera", phrase, 2147483647, 1);
    expect(
      last?.publicKey?.endsWith("c4b33dca1f83509f17b69b2686ee46b8556143f79f4b9df7fe7ed3864c0c64d0"),
    ).toBe(true);
    const [withPassphrase] = rowsOf(hederaDerivation, "hedera", phrase, 0, 1, "some pass");
    expect(
      withPassphrase?.publicKey?.endsWith(
        "fd311925a7a04b38f7508931c6ae6a93e5dc4394d83dafda49b051c0017d3380",
      ),
    ).toBe(true);
    const [ecdsa] = rowsOf(hederaDerivation, "hedera-ecdsa", phrase, 0, 1);
    expect(ecdsa?.path).toBe("m/44'/3030'/0'/0/0");
    expect(ecdsa?.privateKey).toBe(
      "0fde7bfd57ae6ec310bdd8b95967d98e8762a2c02da6f694b152cf9860860ab8",
    );
    expect(ecdsa?.publicKeyDer).toBe(
      "302d300706052b8104000a03220003b1c064b4d04d52e51f6c8e8bb1bff75d62fa7b1446412d5901d424f6aedd6fd4",
    );
  });

  it("give the oracle's Solana addresses of the public phrase on both paths", () => {
    expect(
      rowsOf(solanaDerivation, "solana", ABOUT, 0, 2).map(({ address, path }) => [path, address]),
    ).toEqual([
      ["m/44'/501'/0'/0'", "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk"],
      ["m/44'/501'/1'/0'", "Hh8QwFUA6MtVu1qAoq12ucvFHNwCcVTV7hpWjeY1Hztb"],
    ]);
    expect(rowsOf(solanaDerivation, "solana-ledger", ABOUT, 0, 1)[0]?.address).toBe(
      "GjJyeC1r2RgkuoCWMyPYkCWSGSGLcz266EaAkLA27AhL",
    );
  });

  it("encode wallet-core's addresses of the private key 0x46…46", () => {
    expect(fieldsOfKey(SOLANA_KEYS.fields)).toBe("H4JcMPicKkHcxxDjkyyrLoQj7Kcibd9t815ak4UvTr9M");
    expect(fieldsOfKey(STELLAR_KEYS.fields)).toBe(
      "GDXJHJHWN6GRNOAZXON6XH74ZX6NYFAS5B7642RSJQVJTIPA4ZYUQLEB",
    );
    expect(fieldsOfKey(NEAR_KEYS.fields)).toBe(
      "ee93a4f66f8d16b819bb9beb9ffccdfcdc1412e87fee6a324c2a99a1e0e67148",
    );
    expect(fieldsOfKey(HEDERA_ED25519_KEYS.fields)).toBe(
      "0.0.302a300506032b6570032100ee93a4f66f8d16b819bb9beb9ffccdfcdc1412e87fee6a324c2a99a1e0e67148",
    );
  });

  it("preview hardened row ranges and refuse a range past the last index", () => {
    const [phantom] = SOLANA_COIN_ADAPTERS;
    const input = { network: "mainnet" as const, account: 0, branch: 0, start: 0, count: 10 };
    expect(phantom?.pathPreview(input)).toBe("m/44'/501'/0…9'/0'");
    expect(() => phantom?.pathPreview({ ...input, start: 2147483647, count: 2 })).toThrow();
    const derive = solanaDerivation("solana");
    const seed = mnemonicToSeed(ABOUT);
    expect(() =>
      derive?.({ seed, network: "mainnet", account: 0, branch: 0, start: 2147483647, count: 2 }),
    ).toThrow();
    expect(paymentQrPayload({ ...addressOf("solana") })).toBe(
      "solana:HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk",
    );
    expect(solanaDerivation("stellar")).toBeUndefined();
  });
});

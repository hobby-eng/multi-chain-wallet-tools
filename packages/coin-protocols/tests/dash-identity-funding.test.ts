import { HDKey } from "@scure/bip32";
import { describe, expect, it } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { hexToBytes } from "@ckd/core/crypto.js";
import type { DerivationResult } from "@ckd/core/types.js";
import { deriveDashIdentityFunding } from "../src/coins/dash/identity-funding.js";
import { DASH_IDENTITY_FUNDING_KINDS } from "../src/coins/dash/profiles.js";

// Dash Core v24.0.0 src/wallet/test/platformkeys_tests.cpp, dip13_funding_vectors: the seed of
// DIP-14's test mnemonic, coin type 1.
const DIP14_SEED =
  "b16d3782e714da7c55a397d5f19104cfed7ffa8036ac514509bbb50807f8ac59" +
  "8eeb26f0797bd8cc221a6cbff2168d90a5e9ee025a5bd977977b9eccd97894bb";
// dashj AuthenticationGroupExtensionTest keyTest: a public test mnemonic, mainnet.
const DASHJ_MNEMONIC =
  "enemy check owner stumble unaware debris suffer peanut good fabric bleak outside";

function derive(seed: Uint8Array, network: "mainnet" | "testnet", start: number, account = 0) {
  return deriveDashIdentityFunding({ seed, network, account, branch: 0, start, count: 1 });
}

function value(result: DerivationResult, key: string): string | undefined {
  return result.rows[0]?.groups
    ?.flatMap((group) => [...group.basic, ...group.advanced])
    .find((field) => field.key === key)?.value;
}

describe("Dash identity funding keys (DIP13)", () => {
  it.each([
    [
      "registration",
      7,
      "m/9'/1'/5'/1'/7",
      "804cc77cec9ce9ccf576a9b5978f5da67a86b9307f2686a26fa4cf873bc5645c",
    ],
    [
      "topUp",
      11,
      "m/9'/1'/5'/2'/11",
      "cd6adc39e772ed2b2186ecc42cbdb5b881fe755db086a9c8a94343815af8784a",
    ],
    [
      "invitationHardened",
      13,
      "m/9'/1'/5'/3'/13'",
      "4d731224222afd2b28539a8588fbb7579e85b5d6cec9e328a1c5a78f522581a8",
    ],
  ])("matches Dash Core v24's %s vector", (kind, index, path, privateKey) => {
    const result = derive(hexToBytes(DIP14_SEED), "testnet", index);
    expect(value(result, `${kind}Path`)).toBe(path);
    expect(value(result, `${kind}PrivateKeyHex`)).toBe(privateKey);
  });

  it("matches dashj's mainnet funding addresses, the invitation with its normal index", () => {
    const result = derive(mnemonicToSeed(DASHJ_MNEMONIC), "mainnet", 0);
    expect(value(result, "registrationAddress")).toBe("Xw7ucPiM7wsWFbQaj4W4DmXqtceJGPhA92");
    expect(value(result, "topUpAddress")).toBe("XkCGD8FX7HMQ1yYnHswNMikHu4sLJgVfWG");
    expect(value(result, "invitationAddress")).toBe("Xs2nSqYpwb7cvyWikp5j8LHwEVo7ovCp96");
    expect(value(result, "invitationPath")).toBe("m/9'/5'/5'/3'/0");
    // The hardened form of the same index is another key.
    expect(value(result, "invitationHardenedPath")).toBe("m/9'/5'/5'/3'/0'");
    expect(value(result, "invitationHardenedAddress")).not.toBe(value(result, "invitationAddress"));
  });

  it("derives every funding feature in its own group, private keys marked secret", () => {
    const result = derive(hexToBytes(DIP14_SEED), "testnet", 0);
    expect(result.id).toBe("dash-identity-funding");
    expect(result.rows[0]?.groups?.map((group) => group.key)).toEqual(
      DASH_IDENTITY_FUNDING_KINDS.map(({ key }) => key),
    );
    expect(result.rows[0]?.groups?.map((group) => value(result, `${group.key}Path`))).toEqual([
      "m/9'/1'/5'/1'/0",
      "m/9'/1'/5'/2'/0",
      "m/9'/1'/5'/2'/0'/0",
      "m/9'/1'/5'/3'/0",
      "m/9'/1'/5'/3'/0'",
      "m/9'/1'/5'/4'/0",
      "m/9'/1'/5'/5'/0",
    ]);
    const fields = result.rows[0]!.groups!.flatMap((group) => [...group.basic, ...group.advanced]);
    for (const field of fields) expect(field.secret, field.key).toBe(/PrivateKey/u.test(field.key));
  });

  it("puts the identity index before the bound top-up key and leaves the other keys alone", () => {
    const seed = hexToBytes(DIP14_SEED);
    const bound = derive(seed, "testnet", 4, 3);
    const unbound = derive(seed, "testnet", 4, 0);
    expect(value(bound, "boundTopUpPath")).toBe("m/9'/1'/5'/2'/3'/4");
    // No published vector covers this form, so it is compared with a plain BIP32 derivation.
    const node = HDKey.fromMasterSeed(seed).derive("m/9'/1'/5'/2'/3'/4");
    expect(value(bound, "boundTopUpPublicKey")).toBe(Buffer.from(node.publicKey!).toString("hex"));
    expect(value(bound, "boundTopUpAddress")).not.toBe(value(unbound, "boundTopUpAddress"));
    expect(value(bound, "topUpAddress")).toBe(value(unbound, "topUpAddress"));
  });
});

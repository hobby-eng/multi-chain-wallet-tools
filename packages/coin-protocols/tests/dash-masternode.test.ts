import { describe, expect, it } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { bytesToHex, hexToBytes } from "@ckd/core/crypto.js";
import type { DerivationResult } from "@ckd/core/types.js";
import { deriveDashMasternode } from "../src/coins/dash/masternode.js";
import {
  DashBlsHdKey,
  platformNodeId,
  Slip10Ed25519Key,
} from "../src/coins/dash/masternode-keys.js";
import { DASH_MASTERNODE_KEY_KINDS } from "../src/coins/dash/profiles.js";

// dashj AuthenticationGroupExtensionTest keyTest: a public test mnemonic, mainnet.
const DASHJ_MNEMONIC =
  "enemy check owner stumble unaware debris suffer peanut good fabric bleak outside";
// The BIP39 seed of "abandon … about" without a passphrase, which key-wallet's vectors use.
const ABANDON_SEED =
  "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1" +
  "9a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4";
const H = 0x8000_0000;

function value(result: DerivationResult, key: string): string | undefined {
  return result.rows[0]?.groups
    ?.flatMap((group) => [...group.basic, ...group.advanced])
    .find((field) => field.key === key)?.value;
}

function blsPath(seed: Uint8Array, path: readonly number[]): DashBlsHdKey {
  return path.reduce((key, index) => key.child(index % H, index >= H), DashBlsHdKey.fromSeed(seed));
}

describe("dashbls BLS HD derivation", () => {
  it("matches key-wallet's dashbls vectors from the abandon seed", () => {
    const master = DashBlsHdKey.fromSeed(hexToBytes(ABANDON_SEED));
    expect(bytesToHex(master.secretKey())).toBe(
      "27d1e600fe5ce42e9a18fe064aa0c1b8ee6754289013a86eb1e8af985ddc55c5",
    );
    expect(bytesToHex(master.chainCode())).toBe(
      "2a680de50ab918089c65f47e6f32363eb8fbb915a61e9a10e0f882aa1c12aef9",
    );
    expect(bytesToHex(master.publicKey().legacy)).toBe(
      "883389cd6c289b97bfa18cc7b7c873397b4d753269d47d2fa29dda1682c1565687ccb19dd016398da7c9724f8a58bdef",
    );
    expect(bytesToHex(master.publicKey().basic)).toBe(
      "a83389cd6c289b97bfa18cc7b7c873397b4d753269d47d2fa29dda1682c1565687ccb19dd016398da7c9724f8a58bdef",
    );
    const account = blsPath(hexToBytes(ABANDON_SEED), [9 + H, 5 + H, 3 + H, 3 + H]);
    expect(bytesToHex(account.secretKey())).toBe(
      "5f36c0e346c6e6275d6550a09857325e3f54f2a962eb09a48f61756f7b4bbfb0",
    );
  });

  it("matches the dashbls test-suite seed's hardened and legacy normal children", () => {
    const seed = Uint8Array.of(1, 50, 6, 244, 24, 199, 1, 25);
    expect(bytesToHex(DashBlsHdKey.fromSeed(seed).secretKey())).toBe(
      "3e9f7b3846c1803703f94c764b51f5ace513b2f02c4d6b2c452d8ce66e5975bd",
    );
    expect(bytesToHex(blsPath(seed, [77 + H]).secretKey())).toBe(
      "51b31efbd83aeead1e324c5c8248f5a13bb17ba7afe29aeb5ceef7eaff49ed6f",
    );
    expect(bytesToHex(blsPath(seed, [77]).secretKey())).toBe(
      "3ef4f8b4d262fb8981665532b531c7889798044f7cbe4d5fae5e30435f746044",
    );
  });
});

describe("SLIP-10 Ed25519 derivation", () => {
  it("matches SLIP-10 test vector 1", () => {
    const master = Slip10Ed25519Key.fromSeed(hexToBytes("000102030405060708090a0b0c0d0e0f"));
    expect(bytesToHex(master.privateKey())).toBe(
      "2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7",
    );
    expect(bytesToHex(master.chainCode())).toBe(
      "90046a93de5380a72b5e45010748567d5ea02bbf6522f979e05c0d8d8ca9fffb",
    );
    expect(bytesToHex(master.publicKey())).toBe(
      "a4b2856bfec510abab89753fac1ac0e1112364e7d250545963f135f2a33188ed",
    );
    const child = master.child(0);
    expect(bytesToHex(child.privateKey())).toBe(
      "68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3",
    );
    expect(bytesToHex(child.publicKey())).toBe(
      "8c8a13df77a28f3445213a0f432fde644acaa215fc72dcdf300d5efaa85d350c",
    );
  });

  it("gives the node ID as SHA-256 of the public key cut to 20 bytes", () => {
    const publicKey = hexToBytes(
      "08e2698fdcaa0af8416966ba9349b0c8dfaa80ed7f4094e032958a343e45f4b6",
    );
    expect(bytesToHex(platformNodeId(publicKey))).toBe("c9bbba6a3ad5e87fb11af4f10458a52d3160259c");
  });
});

describe("Dash masternode keys (DIP9)", () => {
  it("matches dashj's owner, voting, operator and Platform node vectors", () => {
    const result = deriveDashMasternode({
      seed: mnemonicToSeed(DASHJ_MNEMONIC),
      network: "mainnet",
      account: 0,
      branch: 0,
      start: 0,
      count: 1,
    });
    expect(value(result, "ownerPath")).toBe("m/9'/5'/3'/2'/0");
    expect(value(result, "ownerAddress")).toBe("XpPxDdCV5is57YvZyDejDchDH4GjUHrBc8");
    expect(value(result, "ownerKeyId")).toBe("9660052877ef6f3b5d1ed740b594a67f351352f3");
    expect(value(result, "votingPath")).toBe("m/9'/5'/3'/1'/0");
    expect(value(result, "votingAddress")).toBe("XbcgsvqyH7FGYCcQ7wTL9MXTgUpADsrq6J");
    expect(value(result, "operatorPath")).toBe("m/9'/5'/3'/3'/0");
    expect(value(result, "operatorSecretKey")).toBe(
      "0461b8370ac28e7d7c453ab769d6edc97e9a79e400ae100bfbbf7ea9d834fd2c",
    );
    expect(value(result, "operatorPublicKeyLegacy")).toBe(
      "8efa464e7d58cfd90f3bb1bac18598928ffc7c112d4c64455c0ec72915fcab770a402c439ccc728288f3369ebbd530a5",
    );
    expect(value(result, "operatorPublicKey")).toBe(
      "aefa464e7d58cfd90f3bb1bac18598928ffc7c112d4c64455c0ec72915fcab770a402c439ccc728288f3369ebbd530a5",
    );
    expect(value(result, "platformNodePath")).toBe("m/9'/5'/3'/4'/0'");
    expect(value(result, "platformNodePrivateKey")).toBe(
      "7898dbaa7ab9b550e3befcd53dc276777ffc8a27124f830c04e17fcf74b9e071",
    );
    expect(value(result, "platformNodePublicKey")).toBe(
      "08e2698fdcaa0af8416966ba9349b0c8dfaa80ed7f4094e032958a343e45f4b6",
    );
    expect(value(result, "platformNodeId")).toBe("c9bbba6a3ad5e87fb11af4f10458a52d3160259c");
  });

  it("matches key-wallet's operator and Platform node vectors from the abandon seed", () => {
    const result = deriveDashMasternode({
      seed: hexToBytes(ABANDON_SEED),
      network: "mainnet",
      account: 0,
      branch: 0,
      start: 0,
      count: 1,
    });
    expect(value(result, "operatorSecretKey")).toBe(
      "11122e1ad656d0610ce0f80d40da874d67ea656a3e66ed371c915ec3a488a43a",
    );
    expect(value(result, "operatorPublicKeyLegacy")).toBe(
      "078cad04aae29eb76171937eb7101452b401b026efbc27db840f130374e6a9ec8443d917277f8921e0ba6678a7709875",
    );
    expect(value(result, "operatorPublicKey")).toBe(
      "878cad04aae29eb76171937eb7101452b401b026efbc27db840f130374e6a9ec8443d917277f8921e0ba6678a7709875",
    );
    expect(value(result, "platformNodeId")).toBe("302f2615e6955cce8ed3cff81e8011bfd3a2991f");
  });

  it("derives testnet paths, every key kind in its own group, secrets marked", () => {
    const result = deriveDashMasternode({
      seed: hexToBytes(ABANDON_SEED),
      network: "testnet",
      account: 0,
      branch: 0,
      start: 2,
      count: 2,
    });
    expect(result.rows.map(({ index }) => index)).toEqual([2, 3]);
    expect(result.rows[0]?.groups?.map(({ key }) => key)).toEqual(
      DASH_MASTERNODE_KEY_KINDS.map(({ key }) => key),
    );
    expect(
      ["ownerPath", "votingPath", "operatorPath", "platformNodePath"].map((key) =>
        value(result, key),
      ),
    ).toEqual(["m/9'/1'/3'/2'/2", "m/9'/1'/3'/1'/2", "m/9'/1'/3'/3'/2", "m/9'/1'/3'/4'/2'"]);
    expect(value(result, "ownerAddress")).toMatch(/^y/u);
    const fields = result.rows.flatMap((row) =>
      row.groups!.flatMap((group) => [...group.basic, ...group.advanced]),
    );
    for (const field of fields)
      expect(field.secret, field.key).toBe(/Private|Secret/u.test(field.key));
  });
});

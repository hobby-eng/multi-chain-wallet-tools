import { HDKey } from "@scure/bip32";
import { base58 } from "@scure/base";
import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes } from "@ckd/core/crypto.js";
import type { DerivationResult } from "@ckd/core/types.js";
import { deriveDashPay, parseDashIdentityId } from "../src/coins/dash/dashpay.js";
import { Dip14PrivateNode } from "../src/coins/dash/dip14.js";

// DIP-14's test seed ("birth kingdom trash …"), which Dash Core's DIP14 and DIP15 tests use.
const DIP14_SEED =
  "b16d3782e714da7c55a397d5f19104cfed7ffa8036ac514509bbb50807f8ac59" +
  "8eeb26f0797bd8cc221a6cbff2168d90a5e9ee025a5bd977977b9eccd97894bb";
// Dash Core src/wallet/test/platformkeys_tests.cpp friendship_derivation_matches_key_wallet: the
// IDs 00 01 … 1f and ff fe … e0, used as they are.
const ID_A = Uint8Array.from({ length: 32 }, (_, index) => index);
const ID_B = Uint8Array.from({ length: 32 }, (_, index) => 0xff - index);

function derive(start = 0, count = 2, ids = [ID_A, ID_B]): DerivationResult {
  return deriveDashPay({
    seed: hexToBytes(DIP14_SEED),
    network: "testnet",
    account: 0,
    branch: 0,
    start,
    count,
    ownIdentityId: base58.encode(ids[0]!),
    contactIdentityId: bytesToHex(ids[1]!),
  });
}

function summary(result: DerivationResult, key: string): string | undefined {
  return [...result.basicSummary, ...result.summary].find((field) => field.key === key)?.value;
}

describe("DIP14 256-bit derivation", () => {
  it("matches DIP-14 test vector 3, one normal 256-bit step from the master key", () => {
    const master = Dip14PrivateNode.fromBip32(HDKey.fromMasterSeed(hexToBytes(DIP14_SEED)));
    const child = master.normalChild(
      hexToBytes("775d3854c910b7dee436869c4724bed2fe0784e198b8a39f02bbb49d8ebcfc3b"),
    );
    expect(bytesToHex(child.privateKey())).toBe(
      "f6a95ae75ea8362d9478932f71b262b3d981918fe030316686a475dea4889938",
    );
  });

  it("refuses a 256-bit index that Dash Core and the Platform wallet read differently", () => {
    const master = Dip14PrivateNode.fromBip32(HDKey.fromMasterSeed(hexToBytes(DIP14_SEED)));
    const small = new Uint8Array(32);
    small[31] = 1;
    expect(() => master.normalChild(small)).toThrow(/28 zero bytes/u);
    expect(() => master.normalChild(Uint8Array.of(0x80, 0, 0, 0))).toThrow(/below 2\^31/u);
  });
});

describe("DashPay incoming payments (DIP15)", () => {
  it("matches Dash Core's friendship vector, cross-checked there with key-wallet", () => {
    const result = derive();
    const payload = summary(result, "contactPayload")!;
    expect(payload).toHaveLength(138);
    // Chain code and public key of m/9'/1'/15'/0'/(ID A)/(ID B).
    expect(payload.slice(8, 72)).toBe(
      "1ed00e776865c0308fddae8d22fb3ae47ffd51ce409b298d1987aafdec6bef6b",
    );
    expect(payload.slice(72)).toBe(
      "025b4ff1b10b9e1990df46dfa2f986300a7e6eb4a85289f4419581950edd3760bf",
    );
    expect(payload.slice(0, 8)).toBe("a582fa1d");
  });

  it("derives the receiving addresses below the friendship chain", () => {
    const result = derive();
    expect(result.rows.map((row) => row.basic.find(({ key }) => key === "address")?.value)).toEqual(
      ["yYToW2c6ZprW2ZjfbnV8LCEjvFZWjueBEV", "ycuANvWuH6NozPfYzERcdhuAsq7wR88TfG"],
    );
    expect(result.rows[1]?.path).toBe("m/9'/1'/15'/0'/(your ID)/(contact ID)/1");
    expect(summary(result, "ownIdentityId")).toBe("1thX6LZfHDZZKUs92febYZhYRcXddmzfzF2NvTkPNE");
    expect(summary(result, "contactIdentityId")).toBe(
      "JEJUoGfGEPTZ1XTwN39dYdFxYxDiDaSKVNy5qYWJmZt3",
    );
    expect(summary(result, "ownIdentityIdHex")).toBe(bytesToHex(ID_A));
    for (const field of result.rows.flatMap((row) => [...row.basic, ...row.advanced]))
      expect(field.secret, field.key).toBe(/privateKey/u.test(field.key));
  });

  it("agrees with public derivation from the extended public key it shows", () => {
    const result = derive(5, 1);
    const payload = hexToBytes(summary(result, "contactPayload")!);
    const xpub = new HDKey({ publicKey: payload.slice(36), chainCode: payload.slice(4, 36) });
    expect(bytesToHex(xpub.deriveChild(5).publicKey!)).toBe(
      result.rows[0]?.basic.find(({ key }) => key === "publicKey")?.value,
    );
  });

  it("refuses IDs that are malformed, too short, of a 32-bit form, or the same", () => {
    expect(() => parseDashIdentityId("0OIl", "own")).toThrow(/Base58/u);
    expect(() => parseDashIdentityId(base58.encode(new Uint8Array(31).fill(7)), "contact")).toThrow(
      /32 bytes/u,
    );
    const small = new Uint8Array(32);
    small[31] = 9;
    expect(() => parseDashIdentityId(bytesToHex(small), "own")).toThrow(/not a valid/u);
    expect(() => derive(0, 1, [ID_A, ID_A])).toThrow(/the same/u);
    expect(() => parseDashIdentityId(" ", "contact")).toThrow(
      expect.objectContaining({ code: "dashpay.contact.empty" }),
    );
  });
});

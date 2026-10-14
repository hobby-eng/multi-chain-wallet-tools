import { describe, expect, it } from "vitest";
import { decodeScript } from "../src/script.js";
import { scriptNumberOf, LOCK_NUMBER_BYTES } from "../src/script-number.js";
import { DESCRIPTOR_FRAGMENTS } from "../src/descriptor-fragments.js";

// Public secp256k1 generator; literals follow Core CScriptNum and BIP65/BIP112, not the decoder.
const POINT = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const policy = (operand: string, opcode: string) =>
  decodeScript(`${operand}${opcode}755121${POINT}51ae`, "bitcoin", "mainnet", "spending")
    .inferredPolicy;

describe("script lock boundaries (AUD-026-FUN001/FUN004)", () => {
  it("refuses a failing negative operand and treats disabled CSV as no delay", () => {
    expect(policy("0181", "b1")).not.toContain("after");
    expect(policy("0181", "b2")).not.toContain("after");
    expect(policy("050000008000", "b2")).toContain("no delay");
    expect(policy("029000", "b1")).toContain("absolute lock 144");
    expect(policy("029000", "b2")).toContain("relative delay 144 blocks");
    expect(policy("03010040", "b2")).toContain("512 seconds");
    expect(policy("05ffffffff00", "b1")).toContain("absolute lock 4294967295");
    expect(scriptNumberOf("ffffffff00", LOCK_NUMBER_BYTES)).toBe(4294967295);
  });
  it("shows all empty data pushes as the number zero", () => {
    expect(scriptNumberOf("")).toBe(0);
    for (const prefix of ["4c00", "4d0000", "4e00000000"])
      expect(decodeScript(`${prefix}51`, "bitcoin", "mainnet", "spending").asm).toBe("0 OP_1");
  });
});

it("keeps descriptor-only and x-only key contexts separate (AUD-026-ARC003)", () => {
  expect(DESCRIPTOR_FRAGMENTS.names("scriptKeys")).toEqual(["pk", "pk_k", "pkh", "pk_h"]);
  expect(DESCRIPTOR_FRAGMENTS.has("scriptKeys", "wpkh")).toBe(false);
  expect(DESCRIPTOR_FRAGMENTS.has("descriptorKeys", "rawtr")).toBe(true);
  expect(DESCRIPTOR_FRAGMENTS.has("regularKeys", "rawtr")).toBe(false);
  expect(DESCRIPTOR_FRAGMENTS.has("legacyRoots", "multi_a")).toBe(false);
  expect(DESCRIPTOR_FRAGMENTS.has("numericFirst", "thresh")).toBe(true);
});

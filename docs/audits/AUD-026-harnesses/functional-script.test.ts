// AUD-026 functional: PSBT Inspector script numbers and the inferred policy of a raw script, through
// the production decodeScript (apps/psbt-inspector/src/script.ts) and scriptNumberOf
// (script-number.ts). Expected values follow Bitcoin Core (script/script.h CScriptNum,
// core_write.cpp ScriptToAsmStr) and BIP65/BIP112, written here as literals, not computed by the
// code under test. A probe named "DEFECT" asserts the observed defective behaviour.
import { describe, expect, it } from "vitest";
import {
  LOCK_NUMBER_BYTES,
  SCRIPT_NUMBER_BYTES,
  scriptNumberOf,
} from "../../../apps/psbt-inspector/src/script-number.js";
import { decodeScript } from "../../../apps/psbt-inspector/src/script.js";

/** The public generator point, a valid compressed key with no wallet behind it. */
const POINT = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
/** <operand> CLTV/CSV DROP 1 <POINT> 1 CHECKMULTISIG: the last template of infer(). */
const lockedMultisig = (operand: string, lockOp: "b1" | "b2") =>
  `${operand}${lockOp}755121${POINT}51ae`;
/** The same operand in the OR template that goes through lockAt (AUD-024-FUN002 control). */
const orTemplate = (operand: string, lockOp: "b1" | "b2") =>
  `635121${POINT}51ae67${operand}${lockOp}7521${POINT}ac68`;
const policy = (hex: string) => decodeScript(hex, "bitcoin", "mainnet", "spending").inferredPolicy;

describe("CScriptNum decoding (Bitcoin Core script.h)", () => {
  it("decodes little-endian sign-magnitude values at the widths Core allows", () => {
    expect(SCRIPT_NUMBER_BYTES).toBe(4); // nDefaultMaxNumSize
    expect(LOCK_NUMBER_BYTES).toBe(5); // CLTV/CSV CScriptNum(..., 5)
    const cases: [string, number][] = [
      ["01", 1],
      ["81", -1],
      ["7f", 127],
      ["8000", 128],
      ["ff00", 255],
      ["8080", -128],
      ["ffffff7f", 2147483647],
      ["ffffffff", -2147483647],
    ];
    for (const [hex, value] of cases) expect(scriptNumberOf(hex)).toBe(value);
    expect(scriptNumberOf("ffffffff00", LOCK_NUMBER_BYTES)).toBe(4294967295);
    expect(scriptNumberOf("ffffffffff", LOCK_NUMBER_BYTES)).toBe(-549755813887);
    expect(scriptNumberOf("0000000001")).toBeNull(); // 5 bytes: too long for arithmetic
    expect(scriptNumberOf("000000000001", LOCK_NUMBER_BYTES)).toBeNull();
  });

  it("observation: negative zero and non-minimal encodings decode without a flag", () => {
    // Core decodes them too (CScriptNum without fRequireMinimal); MINIMALDATA is policy.
    expect(Object.is(scriptNumberOf("80"), -0)).toBe(true);
    expect(Object.is(scriptNumberOf("0080"), -0)).toBe(true);
    expect(scriptNumberOf("0100")).toBe(1);
  });
});

describe("asm view (Core ScriptToAsmStr shows pushes of up to 4 bytes as numbers)", () => {
  it("shows a short push as its number and a longer one as hex", () => {
    // OP_0 keeps its name here; Core prints it as 0 (a naming choice, not a value change).
    expect(decodeScript("02810000", "bitcoin", "mainnet", "spending").asm).toBe("129 OP_0");
    expect(decodeScript("050000000001", "bitcoin", "mainnet", "spending").asm).toBe("0000000001");
  });

  it("DEFECT: an empty OP_PUSHDATA1 push is shown as an empty token, Core shows 0", () => {
    // Core: vch.size() <= 4 -> CScriptNum(vch, false).getint() == 0 -> "0".
    const asm = decodeScript("4c0051", "bitcoin", "mainnet", "spending").asm;
    expect(asm).toBe(" OP_1");
  });
});

describe("inferred policy of <operand> CLTV/CSV DROP <multisig>", () => {
  it("control: the OR template refuses a negative operand and reads a disabled CSV", () => {
    expect(policy(orTemplate("0181", "b1"))).not.toContain("recovery key after");
    expect(policy(orTemplate("050000008000", "b2"))).toContain("no delay");
  });

  it("DEFECT: a negative CLTV operand, which fails the script, is shown as a lock value", () => {
    // BIP65: "if the top stack item is less than 0" the script fails; nothing can spend it.
    expect(policy(lockedMultisig("0181", "b1"))).toBe("1-of-1 multisig after lock value -1");
  });

  it("DEFECT: a CSV operand with the disable flag is shown as a lock value", () => {
    // BIP112: with bit 31 set CSV behaves as a NOP: the branch has no delay at all.
    expect(policy(lockedMultisig("050000008000", "b2"))).toBe(
      "1-of-1 multisig after lock value 2147483648",
    );
  });

  it("observation: CLTV and CSV get the same wording, without unit or kind", () => {
    expect(policy(lockedMultisig("029000", "b1"))).toBe("1-of-1 multisig after lock value 144");
    expect(policy(lockedMultisig("029000", "b2"))).toBe("1-of-1 multisig after lock value 144");
  });
});

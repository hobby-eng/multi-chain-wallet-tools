import { describe, expect, it } from "vitest";
import { mnemocode, mnemocodeCode } from "../src/mnemocode-engine.js";
import { loadMnemoCode } from "../src/mnemocode-module.js";

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("MnemoCode's WebAssembly", () => {
  it("loads once and passes its startup checks", async () => {
    const binding = await loadMnemoCode();
    expect(await loadMnemoCode()).toBe(binding);
    expect(mnemocode()).toBe(binding);
    for (const check of [
      binding.selfCheckPhrase,
      binding.selfCheckWallet,
      binding.selfCheckQr,
      binding.selfCheckCandidates,
      binding.selfCheckSskr,
      binding.selfCheckRecovery,
    ])
      check(false);
  });

  it("gives a refusal its stable code", async () => {
    const binding = await loadMnemoCode();
    let refusal: unknown;
    try {
      binding.masterFingerprint("abandon about", undefined);
    } catch (cause) {
      refusal = cause;
    }
    expect(refusal).toBeInstanceOf(Error);
    expect(mnemocodeCode(refusal)).toMatch(/^core\./u);
  });

  it("computes the master fingerprint of a public test phrase", async () => {
    const binding = await loadMnemoCode();
    expect(binding.masterFingerprint(PHRASE, undefined)).toBe("73c5da0a");
  });
});

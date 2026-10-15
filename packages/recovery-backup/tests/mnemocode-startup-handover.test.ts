import { describe, expect, it } from "vitest";
import { runMnemoCodeSelfTest } from "../src/self-test-mnemocode.js";
import { LEGACY_VALID_ANSWERS } from "../../recovery-mnemocode/source/core/representations-self-test.js";
import { BIP39_WORD_COUNTS } from "../../recovery-mnemocode/source/core/bip39-sizes.js";

describe("Imported MnemoCode quick startup answers", () => {
  it("includes independently expected legacy-valid answers for every BIP39 length", () => {
    expect(LEGACY_VALID_ANSWERS.map(({ words }) => words)).toEqual(BIP39_WORD_COUNTS);
    expect(LEGACY_VALID_ANSWERS.map(({ storedLast }) => storedLast)).toEqual([
      "actress",
      "alert",
      "afford",
      "arrest",
      "bridge",
    ]);
    expect(runMnemoCodeSelfTest().passed).toBe(true);
  });
});

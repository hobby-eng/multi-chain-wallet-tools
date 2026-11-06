// Actual marked-code owners, public zero-entropy words and a synthetic fingerprint service.
// No BIP39 PBKDF2, WASM, browser or wallet/provider request is executed.
import { expect, it } from "vitest";
import { recoverLegacyValidLastWords } from "../../../packages/recovery-mnemocode/source/core/words.ts";
import { MissingCodes } from "../../../packages/recovery-mnemocode/source/core/missing-codes.ts";
import { MissingCodesSearch } from "../../../packages/recovery-mnemocode/source/core/missing-codes-search.ts";

it("does not silently omit valid wallets from a complete marked-code list", async () => {
  const prefix = "abandon ".repeat(11);
  const endings = recoverLegacyValidLastWords(prefix + "about").map((result) => result.word);
  expect(endings).toHaveLength(128);
  const codes = MissingCodes.read(prefix + endings.join("|"), "english", "direct");
  const search = new MissingCodesSearch(codes, () => "00000000");
  expect(codes.combinations).toBe(128);
  expect(codes.expected).toBe(8);
  expect(search.fits("list")).toBe(true);
  const result = await search.listed([]).run();
  expect(result.kind).toBe("list");
  // Refusing overflow is also a valid future correction; this baseline returns a complete-list
  // discriminator, so its result must actually include every valid candidate in this domain.
  expect(result.rows).toHaveLength(endings.length);
});

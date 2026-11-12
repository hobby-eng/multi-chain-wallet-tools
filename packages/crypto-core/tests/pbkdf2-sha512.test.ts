import { pbkdf2Sync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { javascriptPbkdf2Sha512, webCryptoPbkdf2Sha512 } from "../src/pbkdf2-sha512.js";
import { bip39Seed } from "../src/bip39-wallet-check.js";

// Public inputs only: Trezor's first BIP39 vector, whose seed with "TREZOR" is published.
const ABOUT = `${"abandon ".repeat(11)}about`;
const ABOUT_SEED =
  "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04";

describe("PBKDF2-HMAC-SHA512 by WebCrypto and by JavaScript", () => {
  it.each([
    [390, 1],
    [390, 64],
    [2048, 64],
  ])(
    "matches Node's PBKDF2 at %i iterations for %i bytes, by both engines",
    async (iterations, bytes) => {
      const password = new TextEncoder().encode("public password");
      const salt = new TextEncoder().encode("TON seed version");
      const expected = pbkdf2Sync(password, salt, iterations, bytes, "sha512").toString("hex");
      for (const derive of [webCryptoPbkdf2Sha512, javascriptPbkdf2Sha512])
        expect(Buffer.from(await derive(password, salt, iterations, bytes)).toString("hex")).toBe(
          expected,
        );
      // The caller's bytes are left as they were.
      expect(new TextDecoder().decode(password)).toBe("public password");
    },
  );

  it("gives Trezor's published BIP39 seed by both engines", async () => {
    for (const derive of [webCryptoPbkdf2Sha512, javascriptPbkdf2Sha512])
      expect(Buffer.from(await bip39Seed(ABOUT, "TREZOR", derive)).toString("hex")).toBe(
        ABOUT_SEED,
      );
  });
});

import { describe, expect, it } from "vitest";
import { MhfeCheckResult } from "../src/mhfe-check-result.js";

describe("MHFE rehearsal evidence", () => {
  it("keeps an unverified reading apart from both mismatch and match", () => {
    expect(MhfeCheckResult.verdict("not verified")).toEqual({
      text: "Not verified. Compare the recovery with an address or fingerprint of your wallet.",
      matched: false,
    });
    expect(MhfeCheckResult.verdict("does not match").text).toBe("✗ Does not match.");
    expect(MhfeCheckResult.verdict("matches").matched).toBe(true);
  });

  it("lists every passed built-in length without treating a wallet check as proof", () => {
    expect(
      MhfeCheckResult.lines(
        "builtInCheck",
        { builtInCheck: 12, otherLengths: [21], walletCheck: true },
        false,
        undefined,
        16,
      ),
    ).toEqual([
      "the container phrase passes its BIP39 checksum",
      "the built-in checks of 12 and 21-word original seed phrases",
      "the phrase + passphrase check: its first 16 bits are zero",
    ]);
  });
});

describe("a match with the wallet without the passphrase typed", () => {
  const evidence = { builtInCheck: null, otherLengths: [], walletCheck: null };

  it("leaves the passphrase unconfirmed, and Change password takes only the wallet with it", () => {
    expect(MhfeCheckResult.passphraseNote("address", evidence, 16)).toBe(
      MhfeCheckResult.PASSPHRASE_NOT_CONFIRMED,
    );
    expect(MhfeCheckResult.PASSPHRASE_NOT_CONFIRMED).toMatch(
      /confirms both, and Change password takes only that one\.$/u,
    );
  });

  it("calls a passphrase that passes the phrase + passphrase check very likely right", () => {
    expect(
      MhfeCheckResult.passphraseNote("fingerprint", { ...evidence, walletCheck: true }, 16),
    ).toBe(
      "The fingerprint confirms the phrase, not the passphrase. The BIP39 passphrase typed passes the " +
        "16-bit check: no proof, but a wrong one passes it only once in 65,536 tries, so it is very " +
        "likely right. Change password takes only a reference of the wallet with the passphrase.",
    );
  });
});

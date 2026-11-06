import type { MhfeClient } from "@ckd/recovery-mhfe-wasm/core/client.js";
import type { MhfeCancelled } from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";
import { englishList } from "@ckd/core/listing.js";

/** What a finished rehearsal check answers. */
type MhfeCheckAnswer = Exclude<Awaited<ReturnType<MhfeClient["check"]>>, MhfeCancelled>;
/** The package's verdict: a match, a mismatch, or a 24-word reading that nothing confirmed. */
export type MhfeCheckOutcome = MhfeCheckAnswer["outcome"];
/** The original phrase's own checks from the same recovery, to list with the verdict. */
export type MhfeCheckEvidence = MhfeCheckAnswer["evidence"];

/** The reference selected for a rehearsal or replacement confirmation. */
export type MhfeRehearsalKind =
  "address" | "fingerprint" | "builtInCheck" | "walletCheck" | "owner";

/** Presents only the package's verdict and its ordered evidence; no wallet material is accepted. */
export class MhfeCheckResult {
  /**
   * Said under a match with the wallet without the BIP39 passphrase that was typed, as mhfe check
   * says it; this page's Change password is mhfe rekey.
   */
  static readonly PASSPHRASE_NOT_CONFIRMED =
    "The BIP39 passphrase typed is not confirmed: the reference belongs to the wallet without one. " +
    "An address or the fingerprint of the wallet with the passphrase confirms both, and Change " +
    "password takes only that one.";

  /**
   * What a page says under a match with the wallet without the passphrase typed: where that
   * passphrase passes the phrase + passphrase check, it is very likely right, though no proof.
   */
  static passphraseNote(
    kind: MhfeRehearsalKind | undefined,
    evidence: MhfeCheckEvidence,
    checkBits: number,
  ): string {
    if (evidence.walletCheck !== true) return MhfeCheckResult.PASSPHRASE_NOT_CONFIRMED;
    const reference = kind === "fingerprint" ? "The fingerprint" : "The address";
    return (
      `${reference} confirms the phrase, not the passphrase. The BIP39 passphrase typed passes the ` +
      `${checkBits}-bit check: no proof, but a wrong one passes it only once in ` +
      `${(2 ** checkBits).toLocaleString("en-US")} tries, so it is very likely right. Change ` +
      "password takes only a reference of the wallet with the passphrase."
    );
  }

  /** An unverified reading remains distinct from a mismatch and from a confirmed match. */
  static verdict(outcome: MhfeCheckOutcome): { readonly text: string; readonly matched: boolean } {
    switch (outcome) {
      case "matches":
        return { text: "✓ Matches", matched: true };
      case "not verified":
        return {
          text: "Not verified. Compare the recovery with an address or fingerprint of your wallet.",
          matched: false,
        };
      case "does not match":
        return { text: "✗ Does not match.", matched: false };
    }
  }

  /** Lists the checks that actually passed, preserving every matching length and its order. */
  static lines(
    this: void,
    kind: MhfeRehearsalKind,
    evidence: MhfeCheckEvidence,
    withPassphrase: boolean,
    foundBy: string | undefined,
    checkBits: number,
  ): string[] {
    const passphrase = withPassphrase ? "with this BIP39 passphrase" : "without a BIP39 passphrase";
    const lines = ["the container phrase passes its BIP39 checksum"];
    if (foundBy !== undefined) lines.push(foundBy);
    if (kind === "address") lines.push(`the receiving address of the wallet, ${passphrase}`);
    if (kind === "fingerprint")
      lines.push(`the master key fingerprint of the wallet, ${passphrase}`);
    // Every length whose built-in check passes, the package's own first: nothing tells them apart.
    const lengths = [
      ...(evidence.builtInCheck === null ? [] : [evidence.builtInCheck]),
      ...evidence.otherLengths,
    ];
    if (lengths.length === 1)
      lines.push(`the built-in check of a ${lengths[0]}-word original seed phrase`);
    else if (lengths.length > 1)
      lines.push(
        `the built-in checks of ${englishList(lengths.map(String))}-word original seed phrases`,
      );
    if (evidence.walletCheck === true)
      lines.push(`the phrase + passphrase check: its first ${checkBits} bits are zero`);
    return lines;
  }
}

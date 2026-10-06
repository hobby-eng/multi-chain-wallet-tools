// Status texts and password-field handling of the MHFE panel, kept apart from the panel so that
// they can be tested without the browser package's WebAssembly and the page.
import { MhfeError, type MhfeCandidate } from "@ckd/recovery-mhfe-wasm/client.js";

/** The suite of a 24-word container, shown before the client confirms it. */
export const FULL_SUITE_ID = "MHFE-BIP39-256-EXPERIMENTAL-3";
/** The suite of a container as long as its 12- to 21-word phrase; it has no built-in check. */
export const SAME_LENGTH_SUITE_ID = "MHFE-BIP39-LP-EXPERIMENTAL-4";
/** The length of a container unless the user chose the same length as the phrase. */
export const CONTAINER_WORDS = 24;
/** A 24-word original fills the whole state and carries no verifier. */
const WORDS_WITHOUT_CHECK = 24;

/** Error text for the status line: the client's codes carry a message written for people. */
export function describe(cause: unknown, fallback: string): string {
  if (cause instanceof MhfeError && cause.code === "CANCELLED")
    return "Stopped. The worker and its memory were discarded.";
  // An error in this page's own progress display: the client stopped the operation for safety.
  if (cause instanceof MhfeError && cause.code === "CALLBACK_FAILED") {
    const detail = cause.cause instanceof Error ? ` (${cause.cause.message})` : "";
    return `Stopped because this page failed to show the progress${detail}. The worker and its memory were discarded.`;
  }
  return cause instanceof Error ? cause.message : fallback;
}

/**
 * Empties the password fields once, at the first progress report. The client reports progress only
 * after it has accepted every argument, so a refused one (an empty password, for example) rejects
 * before it and leaves the typed password in place to be corrected.
 */
export function clearOnFirstProgress(...fields: HTMLInputElement[]): () => void {
  let cleared = false;
  return () => {
    if (cleared) return;
    cleared = true;
    for (const field of fields) field.value = "";
  };
}

/**
 * The suite, which the specification requires to be shown, and what recovery needs besides the
 * container and the password: a PIM other than the default (the page supports only memory level 0),
 * and, for the rare phrase that automatic length detection would misread, its word count.
 */
export function rememberNote(
  words: number,
  sameLength: boolean,
  lengthMustBeChosen: boolean,
  pim: number,
  suiteId: string,
): string {
  const containerWords = sameLength ? words : CONTAINER_WORDS;
  const notes: string[] = [];
  if (pim === 0 && !lengthMustBeChosen) {
    notes.push(
      `Nothing else needs to be kept: the ${containerWords} words and the password are enough.`,
    );
  }
  if (pim !== 0) {
    notes.push(
      `You changed the default settings; remember them: PIM ${pim}. Recovery needs exactly this value: ` +
        "with another the container turns into a different phrase that looks just as valid.",
    );
  }
  if (lengthMustBeChosen) {
    notes.push(
      `Remember the word count: your phrase has ${words} words. As said above, automatic length detection ` +
        "would misread this phrase; select that length when you recover.",
    );
  }
  if (sameLength) {
    notes.push(
      "This container has no built-in check: recovery will show the phrase as not verified, and a wrong " +
        "password gives another valid phrase. Confirm it with a known address of the wallet after Use in " +
        "Generate & Derive, or with the master key fingerprint that Show phrase reveals under the recovered " +
        "phrase; that fingerprint is for the phrase without a BIP39 passphrase, so for a wallet with one, " +
        "compare an address with the passphrase entered.",
    );
  } else if (words === WORDS_WITHOUT_CHECK) {
    notes.push(
      "A 24-word phrase has no built-in check, so recovery will show it as not verified; that is expected. " +
        "Compare a known address of the wallet to confirm it.",
    );
  }
  return (
    `Suite ${suiteId}. ${notes.join(" ")} Use a different password for each phrase you encrypt, and ` +
    `nowhere else; to make another copy, copy these ${containerWords} words exactly. Before relying on the container, ` +
    "rehearse the recovery in Decode with the words typed from the plate or paper you wrote, not from the " +
    "screen, and compare the result with your wallet: a wrongly copied word can still pass the BIP39 checksum."
  );
}

export function recoverySummary(candidate: MhfeCandidate, selectedWords: number): string {
  if (candidate.suiteId === SAME_LENGTH_SUITE_ID) {
    return (
      `Not verified: this container keeps the length of its ${candidate.words}-word phrase and has no built-in ` +
      "check, so any password gives a valid phrase. Compare a known address after Use in Generate & Derive, or " +
      "the master key fingerprint under Show phrase, with your wallet; the fingerprint is for the phrase " +
      "without a BIP39 passphrase."
    );
  }
  if (candidate.verified) {
    return `Recovered · ${candidate.words} words · the built-in check passed: the password and settings are right. It does not confirm the wallet; compare a receiving address.`;
  }
  if (selectedWords === 24) {
    return "Not verified: recovered as 24 words, as selected. A 24-word phrase has no built-in check, so any password gives a valid phrase: compare it with your wallet.";
  }
  return (
    "Not verified: no shorter length passed its check, so the result is read as 24 words. If your original has " +
    "24 words, compare this phrase with your wallet. If it has fewer, this usually means a wrong password, PIM " +
    "or container."
  );
}

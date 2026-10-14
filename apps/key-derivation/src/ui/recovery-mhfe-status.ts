// Texts of the MHFE panel: status and progress lines, error texts, what to keep, the verdict on a
// recovered phrase and the answers of a password review. Kept apart from the panel so that they can
// be tested without the browser package's WebAssembly and the page. Where the mhfe command-line
// tool has a text, the page uses it; the package's values (rounds, check bits) come from its
// parameters(), never typed here again.
import type {
  MhfeCandidate,
  MhfeKeepItem,
  MhfeProgress,
  MhfeSealed,
} from "@ckd/recovery-mhfe-wasm/core/client.js";
import type { MhfePasswordReview } from "@ckd/recovery-mhfe-wasm/passwords/passwords.js";
import { MhfeError, type MhfePasswordRepair } from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";
import type {
  MhfeDrawOdds,
  MhfeNewPhrase,
  MhfeWalletParameters,
} from "@ckd/recovery-mhfe-wasm/wallet/wallet.js";
import { bip39EntropyBits } from "@ckd/core/bip39-parameters.js";
import { englishList } from "@ckd/core/listing.js";
import type { MhfeRun } from "./recovery-mhfe-run.js";
import { formatDuration, JobClock } from "./recovery-progress.js";

/** What each stage of an operation is called on the status line. */
export type StageLabels = Partial<Record<MhfeProgress["stage"], string>>;

export const ENCRYPT_STAGES: StageLabels = {
  encrypt: "Encrypting",
  check: "Checking the container",
};
export const RECOVER_STAGES: StageLabels = { recover: "Recovering" };
export const CHECK_STAGES: StageLabels = {
  recover: "Recovering",
  compare: "Comparing with your wallet",
};
export const REKEY_STAGES: StageLabels = {
  recover: "Recovering the old container",
  compare: "Searching the addresses",
  encrypt: "Encrypting the new container",
  check: "Checking the new container",
};
export const OPEN_STAGES: StageLabels = { recover: "Opening" };
export const SELF_TEST_STAGES: StageLabels = {
  encrypt: "Encrypting the suite 3 vector",
  recover: "Recovering the suite 4 vector",
};

/**
 * The status line of one long operation, measured from its start: the stage, the round within it,
 * the time so far and an estimate of the time left. Each stage is one pass through the cipher,
 * `stageRounds` rounds (MhfeClient.parameters().rounds); a "compare" report has no round of its
 * own.
 */
export class StageProgress {
  readonly #stages: StageLabels;
  readonly #stageRounds: number;
  readonly #clock: JobClock;

  constructor(stages: StageLabels, stageRounds: number, clock: JobClock = new JobClock()) {
    this.#stages = stages;
    this.#stageRounds = stageRounds;
    this.#clock = clock;
  }

  line(progress: MhfeProgress): string {
    const label = this.#stages[progress.stage] ?? "Working";
    if (progress.stage === "compare") return `${label} · ${this.elapsed()} elapsed`;
    const round = ((progress.round - 1) % this.#stageRounds) + 1;
    return this.#clock.line(
      label,
      `round ${round} of ${this.#stageRounds}`,
      progress.round - 1,
      progress.rounds,
    );
  }

  /** The time since the start, as "1 min 6 s". */
  elapsed(): string {
    return formatDuration(this.#clock.elapsed());
  }
}

/** The length of every new phrase MHFE draws (MhfeNewPhrase.words). */
export const MHFE_PHRASE_WORDS: MhfeNewPhrase["words"] = 24;
/** The random bits of a new phrase without wishes, which MHFE's statements count from. */
const MHFE_PHRASE_BITS = bip39EntropyBits(MHFE_PHRASE_WORDS);

/** What a phrase drawn with the check or chosen words is drawn to do. */
function drawGoal(walletCheck: boolean): string {
  return walletCheck ? "passes the check" : "meets your words";
}

/** The status line as a new phrase starts to be drawn, with the draws MHFE expects (describeDraw). */
export function drawStartLine(walletCheck: boolean, expectedDraws: number): string {
  // A phrase without the check and without chosen words is the first one drawn.
  if (!walletCheck && expectedDraws < 2) return "Drawing a new phrase.";
  const draws = Math.round(expectedDraws).toLocaleString("en-US");
  return `Drawing a phrase that ${drawGoal(walletCheck)}, about ${draws} draws.`;
}

/** The status line while a new phrase is drawn; how long it takes varies. */
export function drawLine(draws: number, clock: JobClock, walletCheck: boolean): string {
  return (
    `Drawing a phrase that ${drawGoal(walletCheck)} · ${draws.toLocaleString("en-US")} tried · ` +
    `${formatDuration(clock.elapsed())} elapsed`
  );
}

/**
 * What a new phrase keeps of its randomness with the wishes given, as MHFE rates it before the draw
 * (MhfeWallet.describeDraw), in the words of mhfe new (src/bin/mhfe/chosen_words.rs, tell): a
 * warning for anything but all its random bits, or null. The warning of a chosen word itself is
 * the fields' own (chosen-word-fields.ts).
 */
export function drawOutlook(odds: MhfeDrawOdds, parameters: MhfeWalletParameters): string | null {
  const bits = Math.floor(odds.randomBits);
  if (odds.randomness === "ample")
    return `The phrase keeps about ${bits} of its ${MHFE_PHRASE_BITS} random bits: still far more than enough.`;
  if (odds.randomness === "notRecommended")
    return (
      `Not recommended: the phrase keeps about ${bits} of its ${MHFE_PHRASE_BITS} random bits, fewer ` +
      `than ${parameters.recommendedRandomBits}.` +
      // The advice fits only a word asked for at a fixed position (the package's fixedPosition).
      (odds.fixedPosition
        ? " A word anywhere in the phrase keeps more than one at a fixed position."
        : "")
    );
  return null;
}

/** "1 to 2 minutes": one readable unit, as mhfe's time_range (src/bin/mhfe/settings.rs). */
export function timeRange(lowSeconds: number, highSeconds: number): string {
  const MINUTE = 60;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const [unitSeconds, unit] =
    highSeconds < 2 * HOUR
      ? [MINUTE, "minutes"]
      : highSeconds < 3 * DAY
        ? [HOUR, "hours"]
        : [DAY, "days"];
  const low = Math.max(1, Math.floor(lowSeconds / unitSeconds));
  const high = Math.max(low, Math.floor(highSeconds / unitSeconds));
  return `${low} to ${high} ${unit}`;
}

/** A list with the common English conjunction policy. */
export function listed(items: readonly (string | number)[]): string {
  return englishList(items, "and");
}

/**
 * How rarely a wrong phrase passes the wallet check of `bits` bits
 * (MhfeWallet.parameters().walletCheckBits): "65,536" for 16.
 */
export function walletCheckOdds(bits: number): string {
  return (2 ** bits).toLocaleString("en-US");
}

/** The line about a 24-word phrase that passes its wallet check without a BIP39 passphrase. */
export function passesWalletCheck(bits: number): string {
  return (
    `It passes the ${bits}-bit check without a BIP39 passphrase: a right password is very likely, but ` +
    "this does not show which wallet it is."
  );
}

/** The line about a 24-word phrase that does not pass its wallet check without a passphrase. */
export function failsWalletCheck(bits: number): string {
  return (
    `It does not pass the ${bits}-bit check without a BIP39 passphrase. This matters only if the wallet ` +
    "was made with the check; with a passphrase, test it below."
  );
}

/** Why the page asks for the passphrase of a 24-word reading (mhfe's own explanation). */
export const WALLET_CHECK_EXPLANATION =
  "A new 24-word phrase can carry a 16-bit check tied to its BIP39 passphrase, as MHFE's New wallet " +
  "offers. The container does not show whether this one does, so MHFE tests every 24-word reading " +
  "with the passphrase you give here, or with none. A pass makes a right password very likely. A " +
  "failure means something only if the wallet was made with the check. The passphrase is used for " +
  "this test alone and is not kept.";

/** What the page says of a reading whose built-in check found another length than the one given. */
export function statedLengthDiffers(found: number, stated: number): string {
  return `The built-in check finds ${found} words, not the ${stated} you gave.`;
}

/** What the page says of the other short lengths whose check passes too, by chance. */
export function otherLengthsPass(lengths: readonly number[]): string {
  return `By chance, the built-in check of ${listed(lengths)} words passes too.`;
}

/**
 * What the page adds after the package's message, which is the library's own sentence, as the
 * command-line tool adds a next step to a refused answer (mhfe src/bin/mhfe/exit.rs, refused):
 * what to do now on this page.
 */
const NEXT_STEPS: Partial<Record<MhfeError["code"], string>> = {
  PASSWORDS_DIFFER: "Please type them again.",
  PASSPHRASES_DIFFER: "Please type them again.",
  PASSWORD_REPAIR_NOT_OFFERED: "Press the button again.",
  NEW_PASSWORD_SAME_AS_OLD: "Choose another password.",
  RANDOM_FAILED: "Nothing was made: use another browser or computer.",
  MEMORY_ALLOCATION_FAILED: "Close other tabs or programs and try again.",
  BUSY: "Wait for it, or press Cancel where it runs.",
  PACKAGE_MISMATCH:
    "MHFE is closed. Use a copy of the tool checked against its release's SHA256SUMS.",
};

/** A Cancel stops this page's worker, which the package's message does not say. */
const STOPPED = "Stopped. The worker and its memory were discarded.";

/** What a failed self-check tells the person, as the command-line tool tells it. */
export const DO_NOT_USE =
  "Do not use this program on this computer: try another computer or browser, and a copy of the tool checked against its release's SHA256SUMS.";

export function selfCheckPart(part: { readonly label: string; readonly detail?: string }): string {
  return `${part.label}${part.detail === undefined ? "" : `: ${part.detail}`}`;
}

export function selfCheckFailure(details: readonly string[] = []): string {
  const detail = details.length === 0 ? "" : `: ${details.join("; ")}`;
  return `${sentence(`MHFE failed its self-check${detail}`)} ${DO_NOT_USE}`;
}

/** `text` ended as a sentence: the package's messages from the Rust core have no full stop. */
function sentence(text: string): string {
  return /[.!?]$/u.test(text) ? text : `${text}.`;
}

/** Error text for the status line: the package's codes carry a message written for people. */
export function describe(cause: unknown, fallback: string): string {
  if (cause instanceof MhfeError) {
    // A class whose self-check failed stays closed: its report names the part.
    if (cause.code === "SELF_CHECK_FAILED") {
      const failed = (cause.report?.components ?? [])
        .filter((part) => part.outcome === "failed")
        .map(selfCheckPart);
      return selfCheckFailure(failed.length === 0 ? [cause.message] : failed);
    }
    // An error in this page's own progress display: the package stopped the operation for safety.
    if (cause.code === "CALLBACK_FAILED") {
      const detail = cause.cause instanceof Error ? ` (${cause.cause.message})` : "";
      return `Stopped because this page failed to show the progress${detail}. The worker and its memory were discarded.`;
    }
    if (cause.code === "CANCELLED") return STOPPED;
    const next = NEXT_STEPS[cause.code];
    return next === undefined ? sentence(cause.message) : `${sentence(cause.message)} ${next}`;
  }
  return cause instanceof Error ? cause.message : fallback;
}

/**
 * Empties the password fields once, at the first progress report. The package reports progress only
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
 * Whether the words MHFE read differ from the entry once case and spacing are set aside, for example
 * because words were typed shortened to their first four letters.
 */
export function readBackDiffers(typed: string, read: string): boolean {
  return typed.trim().toLowerCase().split(/\s+/u).join(" ") !== read;
}

/** One kept item as the command-line tool names it. */
function keepItemText(item: MhfeKeepItem): string {
  switch (item.item) {
    case "containerWords":
      return `the ${item.words} words`;
    case "password":
      return "the password";
    case "passphrase":
      return "the BIP39 passphrase";
    case "passphraseIfAny":
      return "any BIP39 passphrase of the wallet";
    case "repairWords":
      return "the repair words apart from the container phrase";
    case "pim":
      return `PIM ${item.value}`;
    case "memoryLevel":
      return `memory level ${item.value}`;
    case "wordCount":
      return `the word count, ${item.words}`;
  }
}

/** The Keep line of a new container, from the package's list. */
export function keepLine(keep: readonly MhfeKeepItem[]): string {
  const onlyWordsAndPassword = keep.every(
    (item) => item.item === "containerWords" || item.item === "password",
  );
  const words = keep.find((item) => item.item === "containerWords");
  if (onlyWordsAndPassword && words?.item === "containerWords")
    return `Nothing else needs to be kept: the ${words.words} words and the password are enough.`;
  return `Keep: ${listed(keep.map(keepItemText))}.`;
}

/** The rehearsal every new container needs, in the words of `mhfe encrypt`. */
export const REHEARSE =
  "rehearse the recovery in Decode or Check with the words typed from the container phrase you wrote down, " +
  "not from the screen";

/**
 * The notes under a new container: what the kept settings and the word count in the package's
 * list mean, what a container without a built-in check means (`sameLength`: one as long as its
 * phrase), and the rules for copies and the rehearsal.
 */
export function sealedNotes(sealed: MhfeSealed, sameLength: boolean): string[] {
  const notes: string[] = [];
  const pim = sealed.keep.find((item) => item.item === "pim");
  if (pim?.item === "pim")
    notes.push(
      `You changed the default settings; remember them: PIM ${pim.value}. Recovery needs exactly this value: ` +
        "with another the container turns into a different phrase that looks just as valid.",
    );
  const wordCount = sealed.keep.find((item) => item.item === "wordCount");
  if (wordCount?.item === "wordCount")
    notes.push(
      `Remember the word count: your phrase has ${wordCount.words} words. Automatic length detection ` +
        "would misread this phrase; select that length when you recover.",
    );
  if (sameLength)
    notes.push(
      "This container has no built-in check: recovery shows the phrase as not verified, and a wrong " +
        "password gives another valid phrase. Confirm it with its fingerprint, which Decode shows, or with a " +
        "known address of the wallet after Use in Generate & Derive.",
    );
  else if (!sealed.builtInCheck)
    notes.push(
      "A 24-word phrase has no built-in check, so recovery shows it as not verified; that is expected. " +
        "Compare its fingerprint or a known address of the wallet to confirm it.",
    );
  notes.push(
    "Use a different password for each phrase you encrypt, and nowhere else. Another copy of this backup " +
      "is an exact copy of the same words, with the same password and settings.",
  );
  notes.push(
    `Before relying on the container, ${REHEARSE}: a wrongly copied word can still pass the BIP39 checksum.`,
  );
  return notes;
}

/** The verdict on one recovered phrase, by the status the package gives it. */
export function candidateSummary(candidate: MhfeCandidate): { text: string; verified: boolean } {
  switch (candidate.status) {
    case "verified":
      return {
        verified: true,
        text:
          `Recovered · ${candidate.words} words · the built-in check passed: the password and settings ` +
          "are right. It does not confirm the wallet; compare its fingerprint or a receiving address.",
      };
    case "noBuiltInCheck":
      return {
        verified: false,
        text:
          `Not verified: this container keeps the length of its ${candidate.words}-word phrase and has no ` +
          "built-in check, so any password gives a valid phrase. Compare its fingerprint, or a known address " +
          "after Use in Generate & Derive, with your wallet.",
      };
    case "readAs24":
      return {
        verified: false,
        text:
          "Not verified: no shorter length passed its check, so the result is read as 24 words. If your " +
          "original seed phrase has 24 words, compare this phrase with your wallet. If it has fewer, the password, PIM " +
          "or container is wrong.",
      };
    case "readAs24Chosen":
      return {
        verified: false,
        text:
          "Not verified: recovered as 24 words, as selected. A 24-word phrase has no built-in check, so " +
          "any password gives a valid phrase: compare it with your wallet.",
      };
  }
}

/** One answer of a password review, as a radio button shows it. */
export interface ReviewAnswer {
  readonly repair: MhfePasswordRepair | "typeAgain";
  readonly label: string;
  readonly note: string;
}

const CORRECTION_NAMES: Record<NonNullable<MhfePasswordReview["correction"]>, string> = {
  extraSpaces: "extra spaces removed",
  capitals: "capitals made small",
  spacesAndCapitals: "spaces and capitals corrected",
};

/**
 * Whether a review needs the user's choice. A password that is not six words with a check word, or
 * whose check word fits as typed, is used as it is without a question.
 */
export function reviewNeedsChoice(review: MhfePasswordReview): boolean {
  const usedAsTyped = review.reading === "notThisShape" || review.reading === "fits";
  return !(usedAsTyped && review.correction === null);
}

/** What the review found, above its answers. */
export function reviewExplanation(review: MhfePasswordReview): string {
  const sentences: string[] = [];
  if (review.reading === "restorable")
    sentences.push(
      "One word is missing or not in the word list. If the password was made with a check word, the check " +
        "word restores it.",
    );
  else if (review.reading === "mismatch")
    sentences.push(
      "Its six words do not fit their check word. If it was made with one, one word is wrong, and which one " +
        "cannot be told: compare each answer with what you wrote down.",
    );
  else if (review.reading === "fits")
    sentences.push("Once corrected, its six words fit their check word.");
  if (review.correction !== null && review.repairs.length > 0)
    sentences.push(`Each repair below also has its ${CORRECTION_NAMES[review.correction]}.`);
  return sentences.join(" ");
}

/** The answers of a review in the package's order, the password as typed always among them. */
export function reviewAnswers(review: MhfePasswordReview): ReviewAnswer[] {
  const offered: ReviewAnswer[] = review.repairs.map((repair) => ({
    repair: { repair: repair.position },
    label:
      repair.typed === null
        ? `Word ${repair.position}: ${repair.word}`
        : `Word ${repair.position}: ${repair.word} instead of ${repair.typed}`,
    note: repair.typed === null ? "restored by the check word" : "",
  }));
  if (review.offersCorrection && review.repairs.length === 0)
    offered.push({
      repair: "corrected",
      label: "Use the corrected password",
      note: review.correctionText ?? "",
    });
  const asTyped: ReviewAnswer[] = [
    { repair: "asTyped", label: "Use the password as typed", note: "it has no check word" },
    { repair: "typeAgain", label: "Type the password again", note: "" },
  ];
  return review.repairsFirst ? [...offered, ...asTyped] : [...asTyped, ...offered];
}

/** How the status line records the choice, as the command-line tool's summary does. */
export function reviewOutcome(review: MhfePasswordReview, repair: MhfePasswordRepair): string {
  if (typeof repair === "object")
    return `Password: word ${repair.repair} repaired by its check word.`;
  if (repair === "corrected" && review.correction !== null)
    return `Password: ${CORRECTION_NAMES[review.correction]}; its check word fits.`;
  if (review.reading === "fits" && review.correction === null)
    return "Password: its check word fits.";
  return review.reading === "notThisShape" ? "" : "Password: no check word fits.";
}

/** Accepted progress wipes the typed secrets once and only updates a current run's status. */
export function progressCallback(
  run: MhfeRun,
  progress: { line(report: MhfeProgress): string },
  status: HTMLElement,
  ...fields: HTMLInputElement[]
): (report: MhfeProgress) => void {
  const clear = clearOnFirstProgress(...fields);
  return (report) =>
    run.publish(() => {
      clear();
      status.textContent = progress.line(report);
    });
}

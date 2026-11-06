// An old backup encoded again: MnemoCode decodes it, the person confirms the phrase by recognising
// it or by the wallet, and only then is the phrase given to Encode (ReEncoding of MnemoCode's
// WebAssembly). This module keeps the typed backup apart from the confirmation it opens.
import { SecretValue } from "@ckd/core/secret-value.js";
import { mnemocode } from "./mnemocode-engine.js";
import { MnemoCodeInputAdmission } from "./mnemocode-input.js";
import {
  mnemoCodeCodesText,
  mnemoCodeDatesFor,
  mnemoCodeFormAndMode,
  type MnemoCodeFormat,
  type MnemoCodeMode,
  type MnemoCodePhraseWords,
} from "./mnemocode.js";
import {
  matchedBy,
  walletAnswer,
  walletRecovery,
  type WalletEvidenceRequest,
} from "./mnemocode-wallet.js";

/** What a re-encoding says, as MnemoCode says it. */
export const RE_ENCODING_WORDS = Object.freeze({
  recognised: "You recognised the seed phrase: it is confirmed.",
  notMatched: "The wallet of this seed phrase does not match: it is not confirmed.",
  oldBackupStillOpens:
    "The old backup still restores the same wallet: destroy it if the new one replaces it.",
});

export interface ReEncodingInput {
  readonly input: string;
  readonly mode: MnemoCodeMode;
  readonly format: MnemoCodeFormat | "auto";
  readonly dates: string;
  readonly words?: MnemoCodePhraseWords;
  readonly lastWord?: string;
}

/** What a comparison with the wallet found. */
export interface WalletMatch {
  readonly matched: boolean;
  readonly path?: string;
  readonly warning?: string;
}

const CLOSED = "mnemocode.reencoding.closed";

/** Refusal to use a confirmation after its source was revoked. */
export class MnemoCodeReEncodingError extends Error {
  constructor() {
    super(CLOSED);
    this.name = "MnemoCodeReEncodingError";
  }

  get code(): typeof CLOSED {
    return CLOSED;
  }
}

/** Owns an editable backup snapshot so a new confirmation never retains raw secret strings. */
export class MnemoCodeReEncodingDraft {
  readonly #secrets: SecretValue<readonly string[]>;
  readonly #hasLastWord: boolean;
  readonly #mode: ReEncodingInput["mode"];
  readonly #format: ReEncodingInput["format"];
  readonly #words: ReEncodingInput["words"];

  constructor(input: ReEncodingInput) {
    MnemoCodeInputAdmission.backup(input.input);
    MnemoCodeInputAdmission.assertSize(input.dates, "Date input");
    if (input.lastWord !== undefined)
      MnemoCodeInputAdmission.assertSize(input.lastWord, "Last word input");
    this.#secrets = SecretValue.texts([input.input, input.dates, input.lastWord ?? ""]);
    this.#hasLastWord = input.lastWord !== undefined;
    this.#mode = input.mode;
    this.#format = input.format;
    this.#words = input.words;
  }

  /** Decodes a fresh confirmation from this snapshot. */
  open(): MnemoCodeReEncoding {
    const [input = "", dates = "", lastWord = ""] = this.#secrets.value;
    return MnemoCodeReEncoding.of({
      input,
      dates,
      mode: this.#mode,
      format: this.#format,
      ...(this.#words === undefined ? {} : { words: this.#words }),
      ...(this.#hasLastWord ? { lastWord } : {}),
    });
  }

  wipe(): void {
    this.#secrets.wipe();
  }

  [Symbol.dispose](): void {
    this.wipe();
  }
}

/** Owns MnemoCode's confirmation; the phrase leaves it only once confirmed. */
export class MnemoCodeReEncoding {
  readonly #core: ReturnType<typeof MnemoCodeReEncoding.open>;
  #confirmation: "person" | "wallet" | undefined;
  #retired = false;

  private constructor(core: ReturnType<typeof MnemoCodeReEncoding.open>) {
    this.#core = core;
  }

  private static open(input: ReEncodingInput) {
    const { format, mode } = mnemoCodeFormAndMode(
      input.input,
      input.mode,
      input.format,
      input.words,
    );
    // MnemoCode's re-encoding reads the codes themselves; a record names their form and mode.
    return new (mnemocode().ReEncoding)(
      mnemoCodeCodesText(input.input),
      format,
      mode,
      // Its dates are text, blank where the mode takes none.
      mnemoCodeDatesFor(mode, input.dates) ?? "",
      input.lastWord,
    );
  }

  static of(input: ReEncodingInput): MnemoCodeReEncoding {
    return new MnemoCodeReEncoding(MnemoCodeReEncoding.open(input));
  }

  get phrase(): string {
    this.#assertLive();
    return this.#core.phrase();
  }

  /** How the phrase was confirmed, or undefined before. */
  get confirmation(): "person" | "wallet" | undefined {
    this.#assertLive();
    return this.#confirmation;
  }

  confirmByPerson(): void {
    this.#assertLive();
    this.#core.confirmByPerson();
    this.#confirmation = "person";
  }

  /** Compares the phrase with the wallet; a match confirms it. */
  confirmByWallet(wallet: WalletEvidenceRequest): WalletMatch {
    this.#assertLive();
    const binding = mnemocode();
    const match: WalletMatch = walletAnswer(binding, wallet, this.#core.phrase());
    if (match.matched) {
      using recovery = walletRecovery(binding, wallet);
      if (this.#core.confirmByWallet(recovery)) this.#confirmation = "wallet";
    }
    return match;
  }

  confirmedPhrase(): string {
    this.#assertLive();
    return this.#core.confirmedPhrase();
  }

  /** MnemoCode's words for the confirmation, a fingerprint's limited assurance included. */
  confirmationLine(wallet: WalletEvidenceRequest): string {
    this.#assertLive();
    return this.#core.confirmationLine(matchedBy(wallet.evidence.kind));
  }

  #assertLive(): void {
    if (this.#retired) throw new MnemoCodeReEncodingError();
  }

  wipe(): void {
    if (this.#retired) return;
    this.#retired = true;
    this.#core.free();
  }

  [Symbol.dispose](): void {
    this.wipe();
  }
}

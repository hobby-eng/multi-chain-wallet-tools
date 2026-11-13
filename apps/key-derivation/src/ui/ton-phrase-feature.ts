// The TON phrase in Generate & Derive, in builds with TON only (tooling/single-key-coins.mjs,
// TON_PHRASE_MODULES). A TON phrase is 24 words of the English BIP39 list whose TON entropy passes
// TON's check (@ckd/core/ton-phrase.js); the Telegram wallet keeps such a phrase, and its key comes
// from that entropy, not from BIP39's seed. This feature gives the seed of the variant whose
// seedSource is "ton-phrase", notes what a typed phrase is to TON, and, while its option is ticked,
// draws BIP39 phrases of 24 words until one is also a TON phrase: on the page, from the chosen-word
// sampler when a word is chosen, or with the MHFE wallet check on that check's workers, TON's check
// first (checked-mnemonic-feature.ts). The wallet check draws for a BIP39 passphrase that the
// Telegram wallet does not use; the page says so.
import { generateMnemonic } from "@ckd/core/bip39.js";
import { wipe } from "@ckd/core/crypto.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import {
  isTonEntropy,
  passesTonCheck,
  TON_CHECK_BITS,
  tonEntropy,
} from "@ckd/core/ton-mnemonic.js";
import {
  TON_WORD_COUNT,
  tonPhraseKind,
  tonWords,
  type TonPhraseKind,
} from "@ckd/core/ton-phrase.js";
import { BrowserTurn } from "@ckd/ui/browser-turn.js";
import { requireQueryElement } from "@ckd/ui/dom.js";
import type { CoinAdapter } from "@ckd/coins/registry-base.js";
import {
  GenerationOptionState,
  type GenerateButtons,
  type GenerationOption,
} from "./generation-option.js";
import type { WorkerPrecheck } from "./generation-plan.js";

/** Draws between two turns of the page, so that Stop and typing stay responsive. */
const DRAWS_PER_TURN = 16;
/** One phrase in 2^8 passes TON's check; 32 times as many draws all miss with odds about e^-32. */
const MAX_DRAWS = 32 * 2 ** TON_CHECK_BITS;

/** TON's check as a condition of a drawn phrase, in the words of the page's lines. */
const CONDITION: WorkerPrecheck = Object.freeze({
  goal: "the Telegram wallet accepts",
  name: "TON's check",
  bits: TON_CHECK_BITS,
  words: TON_WORD_COUNT,
  passphraseNote:
    "The Telegram wallet uses this phrase without the BIP39 passphrase, which therefore does not protect its funds there; to see its address under TON · Telegram wallet, empty the passphrase field.",
  passes: passesTonCheck,
});

const ERRORS = new ErrorCatalog("ton.phrase", {
  "not-ton": () =>
    "This phrase is not a TON phrase, so the Telegram wallet does not import it. Trust Wallet and Ledger derive TON keys from any BIP39 phrase: see their tabs.",
  "ton-only": () =>
    "This is a TON phrase, not a BIP39 phrase: only TON · Telegram wallet derives from it.",
  passphrase: () =>
    "The Telegram wallet's key comes from the TON phrase alone, without a BIP39 passphrase: empty the passphrase field to see it.",
});
/** The page's texts of this feature's refusals, by their codes (DerivationErrorText). */
const MESSAGES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    (["not-ton", "ton-only", "passphrase"] as const).map((code) => {
      const failure = ERRORS.create(code, []);
      return [failure.code, failure.message];
    }),
  ),
);
const NOTES: Readonly<Record<TonPhraseKind, string>> = Object.freeze({
  "ton-only":
    "A TON phrase, not a BIP39 phrase (its BIP39 checksum fails): the page shows it under TON · Telegram wallet, the one wallet that derives from it. If you meant a BIP39 phrase, check its words.",
  both: "This BIP39 phrase is also a TON phrase: the Telegram wallet accepts it (TON · Telegram wallet).",
  bip39: "",
  other: "",
});

export class TonPhraseFeature implements GenerationOption {
  readonly #box: HTMLInputElement;
  readonly #state: GenerationOptionState;
  readonly #note: HTMLElement;
  readonly #buttons: GenerateButtons;
  /** Draws one random 24-word BIP39 phrase; a test passes a deterministic source (CORE-46). */
  readonly #drawPhrase: () => string;
  /** Bumped by Stop and by every new draw; a draw ends when it no longer holds the latest value. */
  #draw = 0;

  constructor(
    page: Document,
    onChange: () => void,
    buttons: GenerateButtons,
    drawPhrase: () => string = () => generateMnemonic(TON_WORD_COUNT),
  ) {
    this.#box = requireQueryElement<HTMLInputElement>(page, "#ton-generation-enabled");
    this.#note = requireQueryElement<HTMLElement>(page, "#ton-phrase-note");
    this.#buttons = buttons;
    this.#drawPhrase = drawPhrase;
    this.#state = new GenerationOptionState(
      this.#box,
      () => this.cancel(),
      () => this.#sync(),
    );
    this.#box.addEventListener("change", () => {
      this.cancel();
      onChange();
      this.#sync();
    });
    this.#sync();
  }

  /** TON's check as a condition of the phrase, which the wallet check's workers can try first. */
  get condition(): WorkerPrecheck {
    return CONDITION;
  }

  // A deliberate copy of CheckedMnemonicFeature's three methods: both implement GenerationOption,
  // and each delegates to the state both options hold (GenerationOptionState).
  active(): boolean {
    return this.#box.checked;
  }

  setEnabled(enabled: boolean): void {
    this.#state.setEnabled(enabled);
  }

  clear(): void {
    this.#state.clear();
    this.show("");
  }

  /** Stops a draw in progress; it rejects with an AbortError before its next phrase. */
  cancel(): void {
    this.#draw += 1;
  }

  /** The note under the phrase for `phrase`, and what the phrase is to TON. */
  show(phrase: string): TonPhraseKind {
    const kind = tonPhraseKind(phrase);
    this.#note.textContent = NOTES[kind];
    this.#note.hidden = NOTES[kind] === "";
    return kind;
  }

  /** The texts of this feature's refusals, by code. */
  get messages(): Readonly<Record<string, string>> {
    return MESSAGES;
  }

  /**
   * The seed of `adapter` for `phrase`, which the caller wipes. For the Telegram wallet, the 64-byte
   * TON entropy: refused for a phrase that is not TON's, since no TON wallet derives a key from it,
   * and with a BIP39 passphrase, which is no part of it. For any other variant, the seed that
   * `phraseSeed` reads for it (BIP39's, or a CIP-3 root), refused for a TON phrase that is not
   * BIP39's.
   */
  seedFor(
    adapter: Pick<CoinAdapter, "seedSource">,
    phrase: string,
    passphrase: string,
    phraseSeed: (phrase: string, passphrase: string) => Uint8Array,
  ): Uint8Array {
    if (adapter.seedSource !== "ton-phrase") {
      if (tonPhraseKind(phrase) === "ton-only") throw ERRORS.create("ton-only", []);
      return phraseSeed(phrase, passphrase);
    }
    const words = tonWords(phrase);
    if (words === null) throw ERRORS.create("not-ton", []);
    const entropy = tonEntropy(words);
    const refusal = !isTonEntropy(entropy) ? "not-ton" : passphrase !== "" ? "passphrase" : null;
    if (refusal === null) return entropy;
    wipe(entropy);
    throw ERRORS.create(refusal, []);
  }

  /**
   * A BIP39 phrase of 24 words that is also a TON phrase, drawn while `current()` holds: from
   * `drawPhrase`, the chosen-word sampler when a word is chosen, else a phrase of 24 random words.
   * Each draw is fresh and TON's check only rejects, so every phrase that meets both stays equally
   * likely. `onDraws` gets the phrases tried at every turn of the page. The drawn phrases that miss
   * are strings, which the page cannot wipe, as with every generated phrase.
   */
  async generate(
    current: () => boolean,
    onDraws: (draws: number) => void,
    drawPhrase: () => Promise<string> | string = this.#drawPhrase,
  ): Promise<string> {
    if (!this.#state.enabled) throw new Error("The cryptographic self-test has not passed.");
    const draw = ++this.#draw;
    for (let count = 0; count < MAX_DRAWS; count += 1) {
      if (count > 0 && count % DRAWS_PER_TURN === 0) {
        onDraws(count);
        await BrowserTurn.yield();
      }
      if (draw !== this.#draw || !current())
        throw new DOMException("Telegram-compatible generation was stopped.", "AbortError");
      const phrase = await drawPhrase();
      if (passesTonCheck(phrase)) {
        onDraws(count + 1);
        return phrase;
      }
    }
    throw new Error(
      `No phrase the Telegram wallet accepts came up in ${MAX_DRAWS.toLocaleString("en-US")} draws. Try again.`,
    );
  }

  /** The box, offered after the startup checks, and Generate limited to 24 words while ticked. */
  #sync(): void {
    this.#box.disabled = !this.#state.enabled;
    this.#buttons.limit("ton-phrase", this.#box.checked ? TON_WORD_COUNT : undefined);
  }
}

export function installTonPhraseFeature(
  page: Document,
  onChange: () => void,
  buttons: GenerateButtons,
): TonPhraseFeature {
  return new TonPhraseFeature(page, onChange, buttons);
}

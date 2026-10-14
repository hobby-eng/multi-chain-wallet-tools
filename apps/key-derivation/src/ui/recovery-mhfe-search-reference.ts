// The wallet a search for missing words compares with, as `mhfe` reads it
// (WalletReference::read_address_or_fingerprint in src/bin/mhfe/check.rs): one field, where eight
// hex digits are a master key fingerprint and anything else an address, whose coin is then asked;
// for two missing words in the container's own wallet, how far its first account goes, which the
// package takes as `scanGap`, asked with mhfe's answers (src/bin/mhfe/container_search.rs). The
// scope of an address search is stated before any work starts (MhfeWallet.describeAddress with the
// same gap or exact path); a path or gap the library does not take is refused there with its message.
import type { MhfeCoin } from "@ckd/recovery-mhfe-wasm/core/client.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import {
  AddressCoinChoice,
  AddressPathChoice,
  type WalletReference,
} from "./recovery-mhfe-reference.js";
import { describe } from "./recovery-mhfe-status.js";
import { required } from "./recovery-workspace-shared.js";

/** Eight hex digits: no address of any coin has that form alone. */
const FINGERPRINT = /^[0-9a-f]{8}$/iu;
/**
 * The wider gaps offered after the usual one, as multiples of it: mhfe's SCAN_GAPS, 100 and 500
 * beside the usual 20 (src/bin/mhfe/container_search.rs).
 */
const WIDER_GAPS = [5, 25];
/** Pause after the last change before the address search is described. */
const DESCRIBE_DELAY_MS = 400;

export class SearchReference {
  readonly #engine: MhfeEngine;
  readonly #prefix: string;
  readonly #field: HTMLElement;
  readonly #input: HTMLInputElement;
  readonly #coinField: HTMLElement;
  readonly #coin: AddressCoinChoice;
  readonly #path: AddressPathChoice;
  readonly #search: HTMLElement;
  /** The question how far the first account goes; absent where none is asked. */
  readonly #gap:
    | {
        readonly field: HTMLElement;
        readonly ownField: HTMLElement;
        readonly own: HTMLInputElement;
        readonly answers: HTMLElement;
      }
    | undefined;
  /** Whether an address takes a scan gap: two missing words in the container's own wallet. */
  #gapAsked = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #revision = 0;

  /** `prefix` names the fields, as in `#mhfe-decrypt-missing-reference`. */
  constructor(engine: MhfeEngine, prefix: string) {
    this.#engine = engine;
    this.#prefix = prefix;
    this.#field = required<HTMLElement>(`#${prefix}-reference-field`);
    this.#input = required<HTMLInputElement>(`#${prefix}-reference`);
    this.#coinField = required<HTMLElement>(`#${prefix}-coin-field`);
    const coin = required<HTMLSelectElement>(`#${prefix}-coin`);
    this.#coin = new AddressCoinChoice(engine, coin, required<HTMLElement>(`#${prefix}-coin-note`));
    this.#path = new AddressPathChoice(prefix, required<HTMLElement>(`#${prefix}-path-field`));
    this.#path.show(false);
    this.#search = required<HTMLElement>(`#${prefix}-search`);
    const gapField = document.querySelector<HTMLElement>(`#${prefix}-gap-field`);
    this.#gap =
      gapField === null
        ? undefined
        : {
            field: gapField,
            ownField: required<HTMLElement>(`#${prefix}-gap-own-field`),
            own: required<HTMLInputElement>(`#${prefix}-gap-own`),
            answers: required<HTMLElement>(`#${prefix}-gap-answers`),
          };
    for (const element of [this.#input, coin, this.#gap?.own, this.#gap?.field])
      for (const event of ["input", "change"]) element?.addEventListener(event, () => this.#sync());
    this.#path.onChange(() => this.#sync());
  }

  /**
   * Shows the field; `gapAsked` asks how far an address goes, for two missing words, where the
   * block has that question.
   */
  show(gapAsked: boolean): void {
    this.#gapAsked = gapAsked;
    this.#field.hidden = false;
    if (gapAsked) void this.#offerGaps();
    this.#sync();
  }

  hide(): void {
    this.#revision += 1;
    clearTimeout(this.#timer);
    this.#field.hidden = true;
    this.#path.show(false);
    this.#search.textContent = "";
  }

  /** Empties the field, for another search. */
  reset(): void {
    this.#input.value = "";
    this.#path.reset();
    this.#sync();
  }

  get isAddress(): boolean {
    const typed = this.#input.value.trim();
    return typed !== "" && !FINGERPRINT.test(typed);
  }

  /** The address with its coin, or the fingerprint; throws while nothing is typed. */
  reference(): WalletReference {
    const typed = this.#input.value.trim();
    if (typed === "") throw new Error("Type an address or a master key fingerprint of the wallet.");
    if (FINGERPRINT.test(typed)) return { fingerprint: typed.toLowerCase() };
    if (this.#coin.value === "") throw new Error("Choose the coin of the address.");
    return { address: typed, coin: this.#coin.value as MhfeCoin, ...this.#path.options() };
  }

  /** What was compared, for the list of a check's matches: "address …" or "master key fingerprint …". */
  shown(): string {
    const typed = this.#input.value.trim();
    return FINGERPRINT.test(typed)
      ? `master key fingerprint ${typed.toLowerCase()}`
      : `address ${typed}`;
  }

  /**
   * The scan gap of an address of the container's own wallet with two missing words; undefined
   * where none is asked (a fingerprint, an exact path or one missing word) and before the answers are shown,
   * when the package's default applies. Throws for a number of one's own that is not a whole
   * number; its range is the library's.
   */
  scanGap(): number | undefined {
    if (!this.#gapAsked || !this.isAddress || this.#path.chosen || this.#gap === undefined)
      return undefined;
    const chosen = this.#gapRadios().find((radio) => radio.checked);
    if (chosen === undefined) return undefined;
    if (chosen.value !== "other") return Number(chosen.value);
    const own = Number(this.#gap.own.value);
    if (!Number.isSafeInteger(own)) throw new Error("Type a whole number of addresses.");
    return own;
  }

  #gapRadios(): HTMLInputElement[] {
    return [...document.querySelectorAll<HTMLInputElement>(`input[name="${this.#prefix}-gap"]`)];
  }

  /**
   * The gaps offered, as mhfe offers them: the usual one, the package's default
   * (parameters().decoyScanGap), first and chosen, then wider ones with how much longer they take.
   */
  async #offerGaps(): Promise<void> {
    const gap = this.#gap;
    if (gap === undefined || gap.answers.childElementCount > 0) return;
    const { decoyScanGap } = await this.#engine.coreParameters();
    if (gap.answers.childElementCount > 0) return;
    const answers = [1, ...WIDER_GAPS].map((times) => {
      const addresses = decoyScanGap * times;
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.id = `${this.#prefix}-gap-${addresses}`;
      radio.name = `${this.#prefix}-gap`;
      radio.value = String(addresses);
      radio.autocomplete = "off";
      radio.checked = times === 1;
      const note = document.createElement("span");
      note.className = "answer-note";
      note.textContent = times === 1 ? "the usual gap of a wallet" : `about ${times} times as long`;
      const label = document.createElement("label");
      label.className = "checkbox-row";
      label.htmlFor = radio.id;
      label.append(radio, ` The first ${addresses} addresses `, note);
      return label;
    });
    gap.answers.replaceChildren(...answers);
    this.#sync();
  }

  #sync(): void {
    const revision = ++this.#revision;
    const address = this.isAddress;
    this.#coinField.hidden = !address;
    this.#path.show(address && !this.#field.hidden);
    if (this.#gap !== undefined) {
      this.#gap.field.hidden = !(this.#gapAsked && address && !this.#path.chosen);
      const other = document.querySelector<HTMLInputElement>(`#${this.#prefix}-gap-other`);
      this.#gap.ownField.hidden = other?.checked !== true;
    }
    // Until the list is loaded no coin is chosen; a load that failed is tried at the next change.
    if (address && this.#coin.value === "") void this.#loadCoins();
    clearTimeout(this.#timer);
    this.#search.textContent = "";
    this.#timer = setTimeout(() => void this.#describe(revision), DESCRIBE_DELAY_MS);
  }

  async #loadCoins(): Promise<void> {
    try {
      await this.#coin.load();
      this.#sync();
    } catch (cause) {
      this.#search.textContent = describe(cause, "The coins could not be loaded.");
    }
  }

  /** The standard address scope or only one exact path, before work; nothing for a fingerprint. */
  async #describe(revision: number): Promise<void> {
    if (revision !== this.#revision || this.#field.hidden) return;
    if (!this.isAddress || this.#coin.value === "") {
      this.#search.textContent = "";
      return;
    }
    await this.#coin.describe(
      () => {
        const gap = this.scanGap();
        const { address, coin, path } = this.reference();
        if (address === undefined || coin === undefined) return undefined;
        return {
          address,
          coin,
          ...(path === undefined ? {} : { path }),
          // 0 asks for the usual search.
          scanGap: gap ?? 0,
        };
      },
      (text) => {
        if (revision === this.#revision) this.#search.textContent = text;
      },
    );
  }
}

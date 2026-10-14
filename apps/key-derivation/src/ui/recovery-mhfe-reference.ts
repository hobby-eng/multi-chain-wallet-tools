// What a recovered phrase is compared with, for the rehearsal check and for Change password: a
// receiving address (with its coin and, optionally, one path), the master key fingerprint, the
// container's built-in check or the phrase + passphrase check. The address search is described by
// the package before any work, as the command-line tool shows it.
import type { MhfeCoin, MhfeReference } from "@ckd/recovery-mhfe-wasm/core/client.js";
import type { MhfeWallet } from "@ckd/recovery-mhfe-wasm/wallet/wallet.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import { describe } from "./recovery-mhfe-status.js";
import { PasswordField, offerAnswer } from "./recovery-mhfe-fields.js";
import type { WalletPassphraseQuestion } from "./recovery-mhfe-wallet-passphrase.js";
import { required } from "./recovery-workspace-shared.js";

declare const __DASH_COMMUNITY__: boolean;

/** Pause after the last change before the address search is described. */
const DESCRIBE_DELAY_MS = 400;
/** Shared by every address-reference control, including the search and recovery questions. */
const ADDRESS_PATH_LABEL = "Only one derivation path";

export type ReferenceKind = "address" | "fingerprint" | "builtInCheck" | "walletCheck" | "owner";

/** A receiving address or the master key fingerprint of the wallet. */
export type WalletReference = Extract<MhfeReference, { address: string } | { fingerprint: string }>;

/**
 * The coin of an address, chosen from the coins of the package's address search, with a note on
 * what its Ethereum search covers; the Dash edition offers Dash only. The list is loaded once, on
 * first use.
 */
export class AddressCoinChoice {
  readonly #engine: MhfeEngine;
  readonly #select: HTMLSelectElement;
  readonly #note: HTMLElement;
  #loaded: Promise<void> | undefined;

  constructor(engine: MhfeEngine, select: HTMLSelectElement, note: HTMLElement) {
    this.#engine = engine;
    this.#select = select;
    this.#note = note;
  }

  /** Request admission and package errors use one display path; the host owns late publication. */
  async describe(
    request: () => Parameters<MhfeWallet["describeAddress"]>[0] | undefined,
    publish: (text: string) => void,
  ): Promise<void> {
    try {
      const options = request();
      if (options === undefined) return;
      const wallet = await this.#engine.wallet();
      publish(AddressCoinChoice.#description(await wallet.describeAddress(options)));
    } catch (cause) {
      publish(describe(cause, "This address cannot be used."));
    }
  }

  /** The scope MHFE will use, shared by address checks and missing-word searches. */
  static #description(search: Awaited<ReturnType<MhfeWallet["describeAddress"]>>): string {
    const type = search.type === null ? "" : `Type: ${search.type} · `;
    const scope = search.onlyPath
      ? `only ${search.search}`
      : `${search.search}, ${search.addresses.toLocaleString("en-US")} addresses`;
    return `${type}Search: ${scope}`;
  }

  /** The coin chosen; "" while the list is loading. */
  get value(): string {
    return this.#select.value;
  }

  /** Loads the list once; a failed load is tried again on the next call. */
  load(): Promise<void> {
    this.#loaded ??= this.#fill().catch((cause: unknown) => {
      this.#loaded = undefined;
      throw cause;
    });
    return this.#loaded;
  }

  async #fill(): Promise<void> {
    const { coins } = await this.#engine.walletParameters();
    const offered = __DASH_COMMUNITY__ ? coins.filter((coin) => coin.id === "dash") : coins;
    this.#select.replaceChildren(
      ...offered.map((coin) => {
        const option = document.createElement("option");
        option.value = coin.id;
        option.textContent = `${coin.name} · ${coin.addressForms}`;
        return option;
      }),
    );
    // MHFE's Ethereum search covers every EVM network. The Dash edition names no other coin.
    if (!__DASH_COMMUNITY__ && offered.some((coin) => coin.id === "ethereum")) {
      this.#note.textContent = "Ethereum also covers every EVM network, such as BNB Smart Chain.";
      this.#note.hidden = false;
    }
  }
}

/** The optional exact path of an address: MHFE parses it, while the page owns the choice. */
export class AddressPathChoice {
  readonly #use: HTMLInputElement;
  readonly #input: HTMLInputElement;
  readonly #note: HTMLElement;
  readonly #field: HTMLElement | undefined;
  #visible = true;

  constructor(prefix: string, field?: HTMLElement) {
    this.#use = required<HTMLInputElement>(`#${prefix}-use-path`);
    this.#input = required<HTMLInputElement>(`#${prefix}-path`);
    required<HTMLElement>(`#${prefix}-path-label`).textContent = ADDRESS_PATH_LABEL;
    this.#note = required<HTMLElement>(`#${prefix}-path-note`);
    this.#note.textContent = "Search only this path instead of the usual address range.";
    this.#input.setAttribute("placeholder", "m/…");
    this.#field = field;
    this.#use.addEventListener("change", () => this.#showInput());
    this.#showInput();
  }

  get chosen(): boolean {
    return this.#visible && this.#use.checked;
  }

  /** A checked empty field must not silently ask MHFE for its standard search. */
  options(): { path?: string } {
    if (!this.chosen) return {};
    const path = this.#input.value.trim();
    if (path === "")
      throw new Error(`Type the derivation path, or turn off ${ADDRESS_PATH_LABEL}.`);
    return { path };
  }

  onChange(listener: () => void): void {
    for (const field of [this.#use, this.#input])
      for (const event of ["input", "change"]) field.addEventListener(event, listener);
  }

  show(visible: boolean): void {
    this.#visible = visible;
    if (this.#field !== undefined) this.#field.hidden = !visible;
    if (!visible) this.reset();
    else this.#showInput();
  }

  reset(): void {
    this.#use.checked = false;
    this.#input.value = "";
    this.#showInput();
  }

  #showInput(): void {
    this.#input.hidden = !this.chosen;
    this.#note.hidden = !this.chosen;
  }
}

export class WalletReferenceField {
  readonly #prefix: string;
  readonly #coin: AddressCoinChoice;
  readonly #address: HTMLInputElement;
  readonly #path: AddressPathChoice;
  readonly #search: HTMLElement;
  readonly #fingerprint: HTMLInputElement;
  readonly #passphrase: PasswordField;
  readonly #question: WalletPassphraseQuestion | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #revision = 0;
  /** Whether the built-in check asks the passphrase: its length is detected. */
  #passphraseAsked = false;

  /**
   * `prefix` names the fields, as in `#mhfe-{prefix}-address`. With `question` (Change password),
   * whether the wallet has a BIP39 passphrase is asked once a kind is chosen and before the address
   * or fingerprint is typed, and the passphrase is asked only of a wallet that has one, as the
   * command-line tool asks them.
   */
  constructor(engine: MhfeEngine, prefix: string, question?: WalletPassphraseQuestion) {
    this.#prefix = prefix;
    this.#question = question;
    question?.onChange(() => this.#showFields());
    const coin = required<HTMLSelectElement>(`#mhfe-${prefix}-coin`);
    this.#coin = new AddressCoinChoice(
      engine,
      coin,
      required<HTMLElement>(`#mhfe-${prefix}-coin-note`),
    );
    this.#address = required<HTMLInputElement>(`#mhfe-${prefix}-address`);
    this.#path = new AddressPathChoice(`mhfe-${prefix}`);
    this.#search = required<HTMLElement>(`#mhfe-${prefix}-search`);
    this.#fingerprint = required<HTMLInputElement>(`#mhfe-${prefix}-fingerprint`);
    this.#passphrase = new PasswordField(`mhfe-${prefix}-passphrase`, "BIP39 passphrase");
    for (const radio of this.#radios()) radio.addEventListener("change", () => this.#showFields());
    this.#path.onChange(() => this.#scheduleDescription());
    for (const field of [coin, this.#address])
      field.addEventListener("input", () => this.#scheduleDescription());
    this.#showFields();
  }

  /** The chosen kind, or undefined while none is chosen: none is preselected. */
  get kind(): ReferenceKind | undefined {
    const checked = this.#radios().find((radio) => radio.checked);
    return checked?.value as ReferenceKind | undefined;
  }

  /**
   * Clears the choice, and the answer about the passphrase, which must be given again, for
   * example when the page comes back.
   */
  reset(): void {
    for (const radio of this.#radios()) radio.checked = false;
    this.#path.reset();
    this.#question?.reset();
    this.#showFields();
  }

  /** Offers a kind only where the container has it, as `readContainer()` says. */
  offer(kind: ReferenceKind, offered: boolean): void {
    if (offerAnswer(`#mhfe-${this.#prefix}-ref-${kind}`, offered)) this.#showFields();
  }

  /** An address or a fingerprint of the wallet: the references that also confirm a rekey. */
  walletReference(): WalletReference {
    if (this.kind === "address")
      return {
        address: this.#address.value.trim(),
        coin: this.#coin.value as MhfeCoin,
        ...this.#path.options(),
      };
    if (this.kind === "fingerprint") return { fingerprint: this.#fingerprint.value.trim() };
    throw new Error("Choose how the recovered seed phrase should be confirmed.");
  }

  /**
   * The reference the package compares with: an address, a fingerprint or the wallet check. The
   * built-in check takes the length of the phrase, which its tab asks.
   */
  reference(): Exclude<MhfeReference, { words: number }> {
    switch (this.kind) {
      case "address":
      case "fingerprint":
        return this.walletReference();
      case "walletCheck":
        return { walletCheck: true };
      default:
        throw new Error("Choose what the recovered seed phrase should be compared with.");
    }
  }

  /**
   * Asks the passphrase beside the built-in check too, where its length is detected: detection
   * with a passphrase also finds a 24-word phrase drawn with the phrase + passphrase check.
   */
  askPassphrase(asked: boolean): void {
    this.#passphraseAsked = asked;
    this.#showFields();
  }

  /** The wallet's BIP39 passphrase, for an address, a fingerprint or the wallet check. */
  get passphrase(): PasswordField {
    return this.#passphrase;
  }

  /** The search an address check makes, said again on the status line when the work starts. */
  get searchText(): string {
    return this.#search.textContent ?? "";
  }

  #radios(): HTMLInputElement[] {
    return [
      ...document.querySelectorAll<HTMLInputElement>(
        `input[name="mhfe-${this.#prefix}-reference"]`,
      ),
    ];
  }

  #showFields(): void {
    this.#revision += 1;
    clearTimeout(this.#timer);
    this.#search.textContent = "";
    const kind = this.kind;
    const answer = this.#question?.answer;
    // With the question, the reference waits for its answer, and only "yes" asks the passphrase.
    const answered = this.#question === undefined || answer !== undefined;
    required<HTMLElement>(`#mhfe-${this.#prefix}-address-fields`).hidden =
      kind !== "address" || !answered;
    this.#path.show(kind === "address" && answered);
    required<HTMLElement>(`#mhfe-${this.#prefix}-fingerprint-field`).hidden =
      kind !== "fingerprint" || !answered;
    const builtIn = document.querySelector<HTMLElement>(`#mhfe-${this.#prefix}-builtin-field`);
    if (builtIn !== null) builtIn.hidden = kind !== "builtInCheck";
    const comparesPassphrase =
      kind === "address" ||
      kind === "fingerprint" ||
      kind === "walletCheck" ||
      (kind === "builtInCheck" && this.#passphraseAsked);
    required<HTMLElement>(`#mhfe-${this.#prefix}-passphrase-field`).hidden = !(
      comparesPassphrase &&
      (this.#question === undefined || answer === true)
    );
    if (kind === "address" && this.#coin.value === "") void this.#loadCoins();
    else if (kind === "address" && answered) this.#scheduleDescription();
  }

  /** The coins of the package's address search; an address typed meanwhile is described then. */
  async #loadCoins(): Promise<void> {
    try {
      await this.#coin.load();
      this.#scheduleDescription();
    } catch (cause) {
      this.#search.textContent = describe(cause, "The coins could not be loaded.");
    }
  }

  #scheduleDescription(): void {
    const revision = ++this.#revision;
    clearTimeout(this.#timer);
    this.#search.textContent = "";
    this.#timer = setTimeout(() => void this.#describeSearch(revision), DESCRIBE_DELAY_MS);
  }

  /** "Type: ... · Search: ..., 2,000 addresses", or "only <path>", before any work. */
  async #describeSearch(revision: number): Promise<void> {
    if (revision !== this.#revision || this.kind !== "address") return;
    const address = this.#address.value.trim();
    // The package needs the coin named; its list may still be loading.
    if (address === "" || this.#coin.value === "") {
      this.#search.textContent = "";
      return;
    }
    await this.#coin.describe(
      () => ({ address, coin: this.#coin.value, ...this.#path.options() }),
      (text) => {
        if (revision === this.#revision) this.#search.textContent = text;
      },
    );
  }
}

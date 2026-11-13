// What a recovered phrase is compared with, for the rehearsal check and for Change password: a
// receiving address (with its coin, or every coin whose form it has, and optionally one path), the
// master key fingerprint, the container's built-in check or the phrase + passphrase check. The
// address search is described by the package before any work, its coins included, as the
// command-line tool shows it.
import type { MhfeCoin, MhfeReference } from "@ckd/recovery-mhfe-wasm/core/client.js";
import type { MhfeWallet } from "@ckd/recovery-mhfe-wasm/wallet/wallet.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import { inCoinMenuOrder } from "./coin-menu-order.js";
import { describe } from "./recovery-mhfe-status.js";
import { PasswordField, offerAnswer } from "./recovery-mhfe-fields.js";
import type { WalletPassphraseQuestion } from "./recovery-mhfe-wallet-passphrase.js";
import { required } from "./recovery-workspace-shared.js";

declare const __DASH_COMMUNITY__: boolean;

/** Pause after the last change before the address search is described. */
const DESCRIBE_DELAY_MS = 400;
/** The coin choice that leaves the coin to MHFE, which reads it from the address. */
const FROM_ADDRESS = "from-address";
/** Shared by every address-reference control, including the search and recovery questions. */
const ADDRESS_PATH_LABEL = "Only one derivation path";
/** The refusal of a ticked path field without a path, before any work and in the mhfe command. */
const PATH_ERRORS = new ErrorCatalog("wallet.mhfe-path", {
  empty: () => `Type the derivation path, or turn off ${ADDRESS_PATH_LABEL}.`,
});

/** "A or B", "A, B or C", as mhfe lists coins (style::or_list). */
function orList(names: readonly string[]): string {
  return names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}

export type { MhfeRehearsalKind as ReferenceKind } from "@ckd/recovery-backup/mhfe-check-result.js";
import type { MhfeRehearsalKind as ReferenceKind } from "@ckd/recovery-backup/mhfe-check-result.js";

/** A receiving address or the master key fingerprint of the wallet. */
export type WalletReference = Extract<MhfeReference, { address: string } | { fingerprint: string }>;

/**
 * The coin of an address: read from the address, as MHFE's command line reads it, or chosen from
 * the coins of the package's address search, with a note on what its Ethereum search covers. The
 * Dash edition offers Dash only. The list is loaded once, on first use.
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
      const search = await wallet.describeAddress(options);
      const { coins } = await this.#engine.walletParameters();
      const names = new Map(coins.map((coin) => [coin.id, coin.name]));
      publish(AddressCoinChoice.#description(search, names, options.coin === undefined));
    } catch (cause) {
      publish(describe(cause, "This address cannot be used."));
    }
  }

  /**
   * The coins and the scope MHFE will search, shared by address checks and missing-word searches:
   * `names` names the coins, and `detected` says they were read from the address.
   */
  static #description(
    search: Awaited<ReturnType<MhfeWallet["describeAddress"]>>,
    names: ReadonlyMap<string, string>,
    detected: boolean,
  ): string {
    const coins = orList(
      inCoinMenuOrder(
        search.coins.map((id) => names.get(id) ?? id),
        (name) => name,
      ),
    );
    const coin = coins === "" ? "" : `Coin: ${coins}${detected ? " (from the address)" : ""} · `;
    const type = search.type === null ? "" : `Type: ${search.type} · `;
    const scope = search.onlyPath
      ? `only ${search.search}`
      : `${search.search}, ${search.addresses.toLocaleString("en-US")} addresses`;
    return `${coin}${type}Search: ${scope}`;
  }

  /** The coin chosen; "" while the list is loading. */
  get value(): string {
    return this.#select.value;
  }

  /** The coin of a request: none where MHFE reads it from the address. */
  option(): { coin?: MhfeCoin } {
    const value = this.#select.value;
    return value === FROM_ADDRESS || value === "" ? {} : { coin: value as MhfeCoin };
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
    // In the Coin menu's order, not in MHFE's.
    const offered = inCoinMenuOrder(
      __DASH_COMMUNITY__ ? coins.filter((coin) => coin.id === "dash") : coins,
      ({ name }) => name,
    );
    const option = (value: string, text: string): HTMLOptionElement => {
      const item = document.createElement("option");
      item.value = value;
      item.textContent = text;
      return item;
    };
    // Without a coin, MHFE searches every coin whose form the address has, so "1…", "3…" and "0x…"
    // are searched as two coins each; the search described below says how far.
    this.#select.replaceChildren(
      ...(__DASH_COMMUNITY__
        ? []
        : [option(FROM_ADDRESS, "From the address · every coin whose form it has")]),
      ...offered.map((coin) => option(coin.id, `${coin.name} · ${coin.addressForms}`)),
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

  /** Whether `error` is the refusal of a ticked field without a path (options()). */
  static refused(error: unknown): error is Error {
    return PATH_ERRORS.matches(error, ["empty"]);
  }

  /** A checked empty field must not silently ask MHFE for its standard search. */
  options(): { path?: string } {
    if (!this.chosen) return {};
    const path = this.#input.value.trim();
    if (path === "") throw PATH_ERRORS.create("empty", []);
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
  /** Called once the coins are offered, which no event announces (onCoinsLoaded). */
  readonly #coinsLoaded: (() => void)[] = [];

  /**
   * `prefix` names the fields, as in `#mhfe-{prefix}-address`. With `question` (Change password),
   * whether the wallet has a BIP39 passphrase is asked once a kind is chosen and before the address
   * or fingerprint is typed, and the passphrase is asked only of a wallet that has one, as the
   * command-line tool asks them. Without it (Check), the passphrase is asked before what to compare
   * with, as mhfe check asks it, and its field stays shown.
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

  /**
   * What the mhfe command carries of the reference: its kind, and an address's coin and one path,
   * never the address or the fingerprint, which mhfe asks for at its prompt. Undefined while no kind
   * is chosen; throws the path field's refusal while it is ticked and empty.
   */
  commandReference(): { kind: ReferenceKind; coin?: MhfeCoin; path?: string } | undefined {
    const kind = this.kind;
    if (kind !== "address") return kind === undefined ? undefined : { kind };
    return { kind, ...this.#coin.option(), ...this.#path.options() };
  }

  /**
   * Calls `listener` once the coins of an address are offered. The list loads on first use and
   * fills its choice without an event, and in the Dash edition that choice is Dash at once.
   */
  onCoinsLoaded(listener: () => void): void {
    this.#coinsLoaded.push(listener);
  }

  /**
   * Whether an address is searched at one path only, which mhfe rekey cannot do. A coin chosen
   * matters less: without one, mhfe searches every coin whose form the address has, that one too.
   */
  searchesOnePath(): boolean {
    return this.kind === "address" && this.#path.chosen;
  }

  /** An address or a fingerprint of the wallet: the references that also confirm a rekey. */
  walletReference(): WalletReference {
    if (this.kind === "address")
      return {
        address: this.#address.value.trim(),
        ...this.#coin.option(),
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
    if (this.#question !== undefined)
      required<HTMLElement>(`#mhfe-${this.#prefix}-passphrase-field`).hidden = !(
        comparesPassphrase && answer === true
      );
    if (kind === "address" && this.#coin.value === "") void this.#loadCoins();
    else if (kind === "address" && answered) this.#scheduleDescription();
  }

  /** The coins of the package's address search; an address typed meanwhile is described then. */
  async #loadCoins(): Promise<void> {
    try {
      await this.#coin.load();
      this.#scheduleDescription();
      for (const listener of this.#coinsLoaded) listener();
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
    // The coin choice may still be loading.
    if (address === "" || this.#coin.value === "") {
      this.#search.textContent = "";
      return;
    }
    await this.#coin.describe(
      () => ({ address, ...this.#coin.option(), ...this.#path.options() }),
      (text) => {
        if (revision === this.#revision) this.#search.textContent = text;
      },
    );
  }
}

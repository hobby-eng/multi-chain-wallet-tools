// The search for the words of a container phrase typed as ?, when its repair words are lost, as
// `mhfe` asks it (mhfe src/bin/mhfe/container_search.rs). Every word the BIP39 checksum allows in
// place of a word marked ? makes a candidate, and what the person knows tells the right one: an
// address or fingerprint of the container's own wallet (searchDecoy: no password, no Argon2, up to
// two missing words), one of their wallet of the original seed phrase, the original seed phrase's
// passphrase, or nothing (searchWallet: one full recovery a candidate, one missing word, the time
// said first). After a refusal, a search that finds nothing or "Not now", the first question comes
// back: the container phrase is typed once.
import type {
  MhfeClient,
  MhfeSearchProgress,
  MhfeSearchResult,
} from "@ckd/recovery-mhfe-wasm/core/client.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import { PasswordField, offerAnswer, type RecoverySettings } from "./recovery-mhfe-fields.js";
import type { MhfeRun } from "./recovery-mhfe-run.js";
import { SearchReference } from "./recovery-mhfe-search-reference.js";
import { timeRange } from "./recovery-mhfe-status.js";
import { MhfeTask } from "./recovery-mhfe-task.js";
import { JobClock, formatDuration } from "./recovery-progress.js";
import { required, type RecoveryFeatureContext } from "./recovery-workspace-shared.js";
import { FieldEdits } from "./field-edits.js";

// The texts of mhfe's search (src/bin/mhfe/container_search.rs).
const TWO_MISSING_EXPLAINED =
  "Two words are missing: only a fingerprint or an address of the container's own wallet finds them, without the password.";
const NO_OWN_CHECK_EXPLAINED = "A container as long as its seed phrase has no check of its own.";
const NOT_FOUND_IN_CONTAINER_WALLET =
  "The container's own wallet does not match: the address or fingerprint, the passphrase or the " +
  "scan gap is not that wallet's, or another word of the container phrase is wrong.";
const NOT_FOUND_WITH_REFERENCE =
  "No candidate matches: the fingerprint or address, its passphrase, the password or a setting is wrong.";
const NOT_FOUND_BY_OWN_CHECKS =
  "No candidate passes a check of the original seed phrase: a 24-word one made without the phrase + " +
  "passphrase check has none, or the passphrase, the password or a setting is wrong. Try a " +
  "fingerprint or an address.";

/** What the person knows, as the answers of "No repair words: what do you know?". */
type Known = "container" | "original" | "passphrase" | "nothing";
/** Whose BIP39 passphrase a question and its field name. */
const CONTAINER_PHRASE = "the container phrase";
const ORIGINAL_SEED_PHRASE = "the original seed phrase";

/**
 * How long recovering every candidate takes, said before the search starts: `seconds` of one
 * recovery at PIM 0 (MhfeEngine.recoverySeconds), times PIM + 1, as in mhfe.
 */
export function searchTimeText(
  candidates: number,
  pim: number,
  seconds: readonly [number, number],
): string {
  const [low, high] = seconds;
  const scale = candidates * (pim + 1);
  return `${candidates} candidates, each a full recovery: about ${timeRange(low * scale, high * scale)} at these settings.`;
}

/** A container phrase that a search found, with each missing word and how it was told. */
export interface FoundContainer {
  readonly container: string;
  readonly words: readonly { readonly position: number; readonly word: string }[];
  readonly how: string;
  /**
   * What the container's own wallet was matched by, for the list of a check's matches, such as
   * "the container's own wallet: address 3FWJ… at m/49'/0'/0'/0/9"; undefined for other searches.
   */
  readonly foundBy?: string;
}

export interface MissingWordsOptions {
  /**
   * The tab's password and settings, after its password review; left out where the block has a
   * password field of its own (Hidden wallets, whose passwords belong to the session).
   */
  readonly settings?: (run: MhfeRun) => Promise<RecoverySettings>;
  /** The tab's PIM, for the time a search with the owner's wallet takes. */
  readonly pim: () => number;
  /** Shows a found container phrase, to be used only after the person says so. */
  readonly found: (found: FoundContainer) => void;
  /** Back to the container phrase, to type it again. */
  readonly back: () => void;
}

export class MissingWordsSearch {
  readonly #engine: MhfeEngine;
  readonly #options: MissingWordsOptions;
  readonly #prefix: string;
  readonly #block: HTMLElement;
  readonly #candidatesLine: HTMLElement;
  readonly #limits: HTMLElement;
  readonly #reference: SearchReference;
  readonly #passphraseQuestion: HTMLElement;
  readonly #passphraseQuestionText: HTMLElement;
  readonly #passphraseWhoseAlone: HTMLElement;
  readonly #passphraseField: HTMLElement;
  readonly #passphraseLabel: HTMLElement;
  readonly #passphrase: PasswordField;
  readonly #passwordField: HTMLElement | null;
  readonly #password: PasswordField | undefined;
  readonly #time: HTMLElement;
  readonly #run: HTMLButtonElement;
  readonly #stop: HTMLButtonElement;
  readonly #notNow: HTMLButtonElement;
  readonly #status: HTMLElement;
  readonly #task: MhfeTask;
  #container = "";
  #candidates = 0;
  /** Whether a search with the owner's wallet applies: one missing word. */
  #offersWalletSearch = false;
  /** The time of a search that recovers every candidate was said: the next press starts it. */
  #longConfirmed = false;
  #revision = 0;
  #active: MhfeRun | undefined;

  /** `prefix` names the fields, as in `#mhfe-{prefix}-missing`; `status` is the block's line. */
  constructor(
    context: RecoveryFeatureContext,
    engine: MhfeEngine,
    prefix: string,
    status: HTMLElement,
    options: MissingWordsOptions,
  ) {
    this.#engine = engine;
    this.#options = options;
    this.#prefix = `mhfe-${prefix}-missing`;
    this.#status = status;
    const id = (name: string): string => `#${this.#prefix}${name}`;
    this.#block = required<HTMLElement>(id(""));
    this.#candidatesLine = required<HTMLElement>(id("-candidates"));
    this.#limits = required<HTMLElement>(id("-limits"));
    this.#reference = new SearchReference(engine, this.#prefix);
    this.#passphraseQuestion = required<HTMLElement>(id("-passphrase-question"));
    this.#passphraseQuestionText = required<HTMLElement>(id("-passphrase-question-text"));
    this.#passphraseWhoseAlone = required<HTMLElement>(id("-passphrase-whose-alone"));
    this.#passphraseField = required<HTMLElement>(id("-passphrase-field"));
    this.#passphraseLabel = required<HTMLElement>(id("-passphrase-label"));
    this.#passphrase = new PasswordField(`${this.#prefix}-passphrase`, "BIP39 passphrase");
    // Hidden wallets has no password of its own until its session is open.
    this.#passwordField =
      options.settings === undefined ? required<HTMLElement>(id("-password-field")) : null;
    this.#password =
      options.settings === undefined
        ? new PasswordField(`${this.#prefix}-password`, "MHFE password of the wallet you look for")
        : undefined;
    this.#time = required<HTMLElement>(id("-time"));
    this.#run = required<HTMLButtonElement>(id("-run"));
    this.#stop = required<HTMLButtonElement>(id("-stop"));
    this.#notNow = required<HTMLButtonElement>(id("-not-now"));
    this.#task = new MhfeTask(context, engine, {
      status,
      cancel: this.#stop,
      name: "An MHFE search for missing words",
      failure: "The search failed.",
      inputs: this.#block.closest<HTMLElement>("[data-operation-panel]") ?? this.#block,
      onEdit: () => this.#forgetLongSearch(),
    });
    this.#run.addEventListener("click", () => {
      const revision = this.#revision;
      void this.#task.run(
        async (run) => {
          this.#active = run;
          try {
            await this.#search(run);
          } finally {
            this.#active = undefined;
          }
        },
        { current: () => revision === this.#revision },
      );
    });
    // "Not now" goes back to what the person knows.
    this.#notNow.addEventListener("click", () => {
      this.#revision += 1;
      this.#active?.cancel();
      this.#forgetLongSearch();
      this.#say("", false);
    });
    required<HTMLButtonElement>(id("-back")).addEventListener("click", () => options.back());
    // A search said for other answers is not started: any change asks for the search again.
    const edits = new FieldEdits();
    for (const event of ["input", "change"])
      this.#block.addEventListener(event, (happened) => {
        if (!edits.isNew(happened)) return;
        this.#forgetLongSearch();
        this.#sync();
      });
  }

  /** Offers the search for the words of `container` typed as ?. Throws for more than two. */
  async show(container: string): Promise<void> {
    const revision = ++this.#revision;
    const client = await this.#engine.client();
    if (revision !== this.#revision) return;
    const search = await client.searchCandidates({ container });
    if (revision !== this.#revision) return;
    this.#container = container;
    this.#candidates = search.candidates;
    this.#offersWalletSearch = search.offersWalletSearch;
    this.#candidatesLine.textContent = `MHFE tries every word the checksum allows: ${search.candidates.toLocaleString("en-US")} candidates.`;
    // Which searches apply is the library's answer (ContainerSearch, as mhfe's Offered::of reads
    // it): two missing words leave the container's own wallet only, and a same-length container
    // has no check of its own.
    this.#offer("original", search.offersWalletSearch);
    this.#offer("passphrase", search.offersOwnChecks);
    this.#offer("nothing", search.offersOwnChecks);
    this.#limits.textContent = !search.offersWalletSearch
      ? TWO_MISSING_EXPLAINED
      : search.offersOwnChecks
        ? ""
        : NO_OWN_CHECK_EXPLAINED;
    this.#limits.hidden = search.offersOwnChecks;
    for (const radio of this.#radios(`${this.#prefix}-known`)) radio.checked = false;
    for (const radio of this.#radios(`${this.#prefix}-passphrase-used`)) radio.checked = false;
    this.#reference.reset();
    this.#passphrase.clear();
    this.#forgetLongSearch();
    this.#sync();
    this.#block.hidden = false;
  }

  hide(): void {
    this.#revision += 1;
    this.#active?.cancel();
    this.#block.hidden = true;
    this.#container = "";
    this.#password?.clear();
    this.#passphrase.clear();
    this.#reference.reset();
    this.#forgetLongSearch();
  }

  #radios(name: string): HTMLInputElement[] {
    return [...document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)];
  }

  #offer(known: Known, offered: boolean): void {
    offerAnswer(`#${this.#prefix}-known-${known}`, offered);
  }

  #known(): Known | undefined {
    return this.#radios(`${this.#prefix}-known`).find((radio) => radio.checked)?.value as
      Known | undefined;
  }

  /** Whether a BIP39 passphrase is said to be used with the wallet, or undefined while unanswered. */
  #passphraseUsed(): boolean | undefined {
    const answer = this.#radios(`${this.#prefix}-passphrase-used`).find((radio) => radio.checked);
    return answer === undefined ? undefined : answer.value === "yes";
  }

  /** Shows the fields the chosen answer takes, in mhfe's order. */
  #sync(): void {
    const known = this.#known();
    const wallet = known === "container" || known === "original";
    if (wallet)
      // An address of the container's own wallet asks how far its first account goes where the
      // owner's wallet cannot be searched: two missing words.
      this.#reference.show(known === "container" && !this.#offersWalletSearch);
    else this.#reference.hide();
    const whose = known === "container" ? CONTAINER_PHRASE : ORIGINAL_SEED_PHRASE;
    this.#passphraseQuestion.hidden = !wallet;
    this.#passphraseQuestionText.textContent = `Is a BIP39 passphrase used with ${whose}?`;
    this.#passphraseWhoseAlone.textContent = whose.replace(/^t/u, "T");
    this.#passphraseLabel.textContent = `BIP39 passphrase of ${whose}`;
    this.#passphraseField.hidden = !(
      (wallet && this.#passphraseUsed() === true) ||
      known === "passphrase"
    );
    if (this.#passwordField !== null)
      this.#passwordField.hidden = known === undefined || known === "container";
  }

  #forgetLongSearch(): void {
    this.#longConfirmed = false;
    this.#time.hidden = true;
    this.#notNow.hidden = true;
    this.#run.textContent = "Search";
  }

  async #search(run: MhfeRun): Promise<void> {
    const known = this.#known();
    if (known === undefined) throw new Error("Choose what you know.");
    const passphrase = this.#passphraseFor(known);
    if (known === "container") return this.#searchContainerWallet(run, passphrase);
    if (this.#longConfirmed) return this.#searchWallet(run, known, passphrase);
    // A search that recovers every candidate says its time first; a second press starts it.
    if (known === "original") this.#reference.reference();
    this.#time.textContent = searchTimeText(
      this.#candidates,
      this.#options.pim(),
      this.#engine.recoverySeconds,
    );
    this.#time.hidden = false;
    this.#run.textContent = "Start the search";
    this.#notNow.hidden = false;
    this.#longConfirmed = true;
    this.#say("", false);
  }

  /** The passphrase that goes with the answer; "" for none. Throws while the question is open. */
  #passphraseFor(known: Known): string {
    if (known === "passphrase") return this.#passphrase.value;
    if (known === "nothing") return "";
    const used = this.#passphraseUsed();
    if (used === undefined)
      throw new Error(
        `Say whether a BIP39 passphrase is used with ${known === "container" ? CONTAINER_PHRASE : ORIGINAL_SEED_PHRASE}.`,
      );
    if (used && this.#passphrase.value === "")
      throw new Error("Type the BIP39 passphrase, or answer No.");
    return used ? this.#passphrase.value : "";
  }

  /** The container's own wallet, with exactly the passphrase given: no recovery, no password. */
  async #searchContainerWallet(run: MhfeRun, passphrase: string): Promise<void> {
    const reference = this.#reference.reference();
    const scanGap = this.#reference.scanGap();
    const client: MhfeClient = await run.step(() => this.#engine.client());
    this.#say(
      `Comparing ${this.#candidates.toLocaleString("en-US")} candidates with the container's own wallet.`,
      false,
    );
    const found = await run.step(() =>
      client.searchDecoy({
        container: this.#container,
        reference,
        passphrase,
        ...(scanGap === undefined ? {} : { scanGap }),
        onProgress: (progress) =>
          run.publish(() =>
            this.#say(
              `Compared ${progress.candidate.toLocaleString("en-US")} of ${progress.candidates.toLocaleString("en-US")}`,
              false,
            ),
          ),
      }),
    );
    if (!found.found) {
      this.#say(NOT_FOUND_IN_CONTAINER_WALLET, true);
      return;
    }
    const at = found.path === null ? "" : ` at ${found.path}`;
    this.#show(found, "with the container's own wallet", {
      foundBy: `the container's own wallet: ${this.#reference.shown()}${at}`,
    });
  }

  /** The original seed phrase's wallet or own checks: a full recovery a candidate. */
  async #searchWallet(run: MhfeRun, known: Known, passphrase: string): Promise<void> {
    const settings = await this.#settings(run);
    // The original seed phrase's passphrase adds the phrase + passphrase check to its built-in
    // check; an empty one leaves the built-in check alone, as "Nothing" does.
    const reference =
      known === "original"
        ? this.#reference.reference()
        : passphrase === ""
          ? ({ builtInCheck: true } as const)
          : ({ walletCheck: true } as const);
    const client: MhfeClient = await run.step(() => this.#engine.client());
    const clock = new JobClock();
    const found = await run.step(() =>
      client.searchWallet({
        container: this.#container,
        password: settings.password,
        passwordRepair: settings.passwordRepair,
        pim: settings.pim,
        reference,
        passphrase,
        onProgress: (progress) => run.publish(() => this.#progress(progress, clock)),
      }),
    );
    this.#forgetLongSearch();
    const ownChecks = known !== "original";
    if (found.found) {
      this.#show(found, ownChecks ? "by the original seed phrase's own check" : "with your wallet");
      return;
    }
    this.#say(ownChecks ? NOT_FOUND_BY_OWN_CHECKS : NOT_FOUND_WITH_REFERENCE, true);
  }

  /** The host's password and settings, or the block's own password at the host's PIM. */
  async #settings(run: MhfeRun): Promise<RecoverySettings> {
    if (this.#options.settings !== undefined) return this.#options.settings(run);
    return {
      password: this.#password?.value ?? "",
      passwordRepair: "asTyped",
      pim: this.#options.pim(),
    };
  }

  #progress(progress: MhfeSearchProgress, clock: JobClock): void {
    const round =
      progress.round === undefined ? "" : ` · round ${progress.round} of ${progress.rounds}`;
    this.#say(
      `Searching · candidate ${progress.candidate.toLocaleString("en-US")} of ${progress.candidates.toLocaleString("en-US")}${round} · ${formatDuration(clock.elapsed())}`,
      false,
    );
  }

  #show(found: MhfeSearchResult, how: string, extra: { foundBy?: string } = {}): void {
    if (found.container === null) return;
    this.#say("", false);
    this.#options.found({ container: found.container, words: found.words, how, ...extra });
  }

  #say(text: string, warning: boolean): void {
    this.#status.textContent = text;
    this.#status.classList.toggle("warning", warning);
  }
}

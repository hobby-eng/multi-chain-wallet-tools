// How MnemoCode recognises the wallet among the candidates of a search, as its menu asks: the
// master fingerprint, an address of any coin, which names its coin, another key of the wallet (a
// master or account extended public key, a compressed public key, or a WIF, which can spend the
// funds), or nothing. An address, a public key or a WIF is compared at its place and among as many
// addresses from there as the person says (20 by default, MnemoCode's). The Dash Community Edition
// offers the fingerprint and a Dash address: the build removes the key fields and gives it its own
// coins (mnemocode-wallet.ts). The evidence is checked by MnemoCode's rules before the search
// starts.
import {
  ADDRESS_SCAN,
  MAX_LIST_PASSPHRASE_BYTES,
  addressCoinNames,
  addressOf,
  defaultAddressCount,
  isPlacedKind,
  offeredCoins,
  walletEvidenceOf,
  type AddressLocation,
  type BitcoinNetworkName,
  type DerivationLocation,
  type OfferedCoin,
  type WalletEvidence,
  type WalletEvidenceRequest,
} from "@ckd/recovery-backup/mnemocode-wallet.js";
import { mnemocode, whenMnemoCodeLoaded } from "@ckd/recovery-backup/mnemocode-engine.js";
import { LiteralSecretField } from "@ckd/ui/literal-secret-field.js";
import { installTextFileImport } from "@ckd/ui/text-file-import.js";
import { installSecretToggle, PHRASE_FILE_IMPORT, required } from "./recovery-workspace-shared.js";

/** The network named with a master fingerprint, which is the same on every network. */
const MASTER_FINGERPRINT_NETWORK: BitcoinNetworkName = "mainnet";

type EvidenceChoice = "fingerprint" | "address" | "key" | "none";
/** How many coins the note of "Address" names, as MnemoCode's menu does. */
const NAMED_COINS = 3;
type KeyKind = "master-xpub" | "account-xpub" | "compressed-public-key" | "wif";

/** A typed whole number, or NaN for other text, which MnemoCode refuses in its own words. */
function wholeNumber(text: string): number {
  return /^\d+$/u.test(text) ? Number(text) : Number.NaN;
}

export class WalletEvidenceField {
  readonly #prefix: string;
  /** The key fields, absent from an edition without Bitcoin. */
  readonly #keyKind: HTMLSelectElement | null;
  readonly #key: HTMLInputElement | null;
  readonly #passphrase: LiteralSecretField;
  /** The address field; a test page may leave it out. */
  readonly #address: HTMLInputElement | null;
  /** Shows the passphrase also when a candidate list needs it without a wallet check. */
  #listWanted = false;
  #defaultAddresses = true;

  /** `prefix` names the fields, as in `#{prefix}-wallet-fingerprint`. */
  constructor(prefix: string) {
    this.#prefix = prefix;
    this.#installLimits();
    this.#address = document.querySelector<HTMLInputElement>(`#${prefix}-wallet-address`);
    whenMnemoCodeLoaded((binding) => this.#offerCoins(offeredCoins(binding)));
    // The coins MnemoCode reads the address as are named while it is typed, as its summary names them.
    for (const type of ["input", "change"])
      this.#address?.addEventListener(type, () => this.#showAddressCoins());
    this.#keyKind = document.querySelector<HTMLSelectElement>(`#${prefix}-wallet-key-kind`);
    this.#key = document.querySelector<HTMLInputElement>(`#${prefix}-wallet-key`);
    const passphrase = required<HTMLTextAreaElement>(`#${prefix}-wallet-passphrase`);
    this.#passphrase = new LiteralSecretField(passphrase);
    if (this.#key !== null)
      installTextFileImport(document, this.#key, {
        accept: PHRASE_FILE_IMPORT.accept,
        preserveWhitespace: false,
      });
    installTextFileImport(document, passphrase, {
      accept: PHRASE_FILE_IMPORT.accept,
      preserveWhitespace: true,
      stripFinalLineBreak: true,
      value: this.#passphrase,
    });
    installSecretToggle(
      `#toggle-${prefix}-wallet-passphrase`,
      `#${prefix}-wallet-passphrase`,
      "Show",
      "Hide",
      "BIP39 passphrase",
    );
    for (const radio of this.#radios()) radio.addEventListener("change", () => this.#show());
    // A WIF is typed concealed; another kind shows its field in clear, so the WIF goes first.
    let kind = this.#keyKind?.value;
    this.#keyKind?.addEventListener("change", () => {
      if (kind === "wif" && this.#key !== null) this.#key.value = "";
      kind = this.#keyKind?.value;
      this.#show();
    });
    this.#show();
  }

  /** The shared markup reads limits/defaults from the same rules as every wallet check. */
  #installLimits(): void {
    for (const name of ["account", "branch", "index"]) {
      document
        .querySelector<HTMLInputElement>(`#${this.#prefix}-wallet-${name}`)
        ?.setAttribute("max", String(ADDRESS_SCAN.lastIndex));
    }
    const count = document.querySelector<HTMLInputElement>(`#${this.#prefix}-wallet-addresses`);
    if (count !== null) {
      count.setAttribute("min", "1");
      count.setAttribute("max", String(ADDRESS_SCAN.maxCount));
      this.#defaultAddresses =
        count.value === "" || count.value === String(ADDRESS_SCAN.defaultCount);
      const updateDefault = (): void => {
        if (!this.#defaultAddresses) return;
        try {
          count.value = String(defaultAddressCount(this.#number("index")));
        } catch {
          /* The existing place reader reports invalid input when the check starts. */
        }
      };
      for (const type of ["input", "change"]) {
        count.addEventListener(type, () => {
          this.#defaultAddresses = count.value.trim() === "";
        });
        document
          .querySelector(`#${this.#prefix}-wallet-index`)
          ?.addEventListener(type, updateDefault);
      }
      updateDefault();
    }
    const note = document.querySelector<HTMLElement>(`#${this.#prefix}-wallet-addresses-note`);
    if (note !== null)
      note.textContent = `${ADDRESS_SCAN.defaultCount} by default (or the addresses left at the final index), at most ${ADDRESS_SCAN.maxCount.toLocaleString("en-US")}, so that a wallet that skipped addresses is found.`;
    const limit = document.querySelector<HTMLElement>(`#${this.#prefix}-wallet-passphrase-limit`);
    if (limit !== null) limit.textContent = String(MAX_LIST_PASSPHRASE_BYTES);
  }

  /** The person's choice; undefined until one is made, since none is preselected. */
  get choice(): EvidenceChoice | undefined {
    return this.#radios().find((radio) => radio.checked)?.value as EvidenceChoice | undefined;
  }

  /** Offers "It cannot" only where the search can list candidates without the wallet. */
  set optional(optional: boolean) {
    const none = required<HTMLInputElement>(`#${this.#prefix}-wallet-none`);
    const row = none.closest<HTMLElement>("label");
    if (row !== null) row.hidden = !optional;
    if (!optional && none.checked) {
      none.checked = false;
      this.#show();
    }
  }

  /** A candidate list stores the BIP39 passphrase too, so its field shows for a list. */
  set listWanted(wanted: boolean) {
    this.#listWanted = wanted;
    this.#show();
  }

  get passphrase(): string {
    return this.#passphrase.read();
  }

  /** The evidence and passphrase to compare each candidate with, or undefined for none. */
  request(): WalletEvidenceRequest | undefined {
    const evidence = this.#evidence();
    if (evidence === undefined) return undefined;
    // MnemoCode checks the evidence as it is made, so wrong evidence is refused before a search.
    walletEvidenceOf(mnemocode(), evidence).free();
    return { evidence, passphrase: this.#passphrase.read() };
  }

  /**
   * The kind of evidence that the choice gives, as MnemoCode names it, with `keyKind` the kind of
   * key chosen; none before a choice.
   */
  #evidenceKind(keyKind: KeyKind | undefined): WalletEvidence["kind"] | undefined {
    switch (this.choice) {
      case "fingerprint":
        return "master-fingerprint";
      case "address":
        return "address";
      case "key":
        return keyKind;
      default:
        return undefined;
    }
  }

  #evidence(): WalletEvidence | undefined {
    switch (this.choice) {
      case "fingerprint":
        return {
          kind: "master-fingerprint",
          value: this.#value("fingerprint").toLowerCase(),
          // A master fingerprint is the same on every network; MnemoCode still names one.
          network: MASTER_FINGERPRINT_NETWORK,
        };
      case "address":
        return {
          kind: "address",
          value: this.#value("address"),
          location: this.#place(),
          addresses: this.#addresses(),
        };
      case "key":
        return this.#keyEvidence(this.#network());
      case "none":
        return undefined;
      default:
        throw new Error("Choose how MnemoCode can recognise the wallet.");
    }
  }

  #keyEvidence(network: BitcoinNetworkName): WalletEvidence {
    if (this.#key === null || this.#keyKind === null)
      throw new Error("Choose how MnemoCode can recognise the wallet.");
    const value = this.#key.value.trim();
    const kind = this.#keyKind.value as KeyKind;
    if (kind === "master-xpub") return { kind, value, network };
    const located = { value, location: this.#location(network) };
    // An account xpub is compared at its account; a public key or a WIF among the addresses.
    if (kind === "account-xpub") return { kind, ...located };
    return { kind, ...located, addresses: this.#addresses() };
  }

  /** The words of the address row for the coins of this edition. */
  #offerCoins(coins: readonly OfferedCoin[]): void {
    if (this.#address === null || coins.length === 0) return;
    const label = required<HTMLElement>(`#${this.#prefix}-wallet-address-label`);
    const note = required<HTMLElement>(`#${this.#prefix}-wallet-address-note`);
    // One coin, as in the Dash Community Edition, is named itself; several as MnemoCode's menu does.
    if (coins.length === 1) {
      label.textContent = `${coins[0]!.name} address`;
      note.textContent = coins[0]!.addressForms;
      this.#address.placeholder = coins[0]!.addressForms;
      return;
    }
    const named = coins.slice(0, NAMED_COINS).map((coin) => coin.name);
    const more = coins.length - named.length;
    const coinNames = more > 0 ? `${named.join(", ")} and ${more} more` : named.join(" or ");
    note.textContent = `${coinNames}; the coin is read from the address`;
  }

  /** Which coins MnemoCode reads the address typed as; nothing until one reads it. */
  #showAddressCoins(): void {
    const note = required<HTMLElement>(`#${this.#prefix}-wallet-address-coins`);
    const address = this.#address?.value.trim() ?? "";
    let names: readonly string[] = [];
    try {
      if (address !== "") names = addressCoinNames(mnemocode(), address);
    } catch {
      // Before MnemoCode is loaded nothing is named; the check refuses the address in its words.
    }
    note.textContent =
      names.length === 0
        ? ""
        : names.length === 1
          ? `Read as ${addressOf(names)}.`
          : `Read as ${addressOf(names)}: each is looked for on its own paths.`;
    note.hidden = names.length === 0;
  }

  /** The place of an address: account, branch and index, without a network or address type. */
  #place(): AddressLocation {
    return {
      account: this.#number("account"),
      branch: this.#number("branch"),
      index: this.#number("index"),
    };
  }

  /**
   * Among how many addresses from the place an address, a public key or a WIF is looked for, by
   * MnemoCode's rules: its default from the first index when none is typed, and its limits.
   */
  #addresses(): number {
    const typed = this.#value("addresses");
    return typed === "" ? defaultAddressCount(this.#number("index")) : wholeNumber(typed);
  }

  #location(network: BitcoinNetworkName): DerivationLocation {
    return { network, ...this.#place() };
  }

  /** An account, branch or index; MnemoCode refuses one that is no whole number in its range. */
  #number(name: string): number {
    return wholeNumber(this.#value(name));
  }

  /** The network chosen; MnemoCode refuses one it does not compare on (assertWalletEvidence). */
  #network(): BitcoinNetworkName {
    return this.#value("network") as BitcoinNetworkName;
  }

  #value(name: string): string {
    return required<HTMLInputElement | HTMLSelectElement>(
      `#${this.#prefix}-wallet-${name}`,
    ).value.trim();
  }

  #radios(): HTMLInputElement[] {
    return [...document.querySelectorAll<HTMLInputElement>(`input[name="${this.#prefix}-wallet"]`)];
  }

  #show(): void {
    const choice = this.choice;
    const kind = this.#keyKind?.value as KeyKind | undefined;
    // The address and key fields are absent from an edition without Bitcoin.
    const field = (name: string, shown: boolean): void => {
      const element = document.querySelector<HTMLElement>(`#${this.#prefix}-wallet-${name}-field`);
      if (element !== null) element.hidden = !shown;
    };
    field("fingerprint", choice === "fingerprint");
    field("address", choice === "address");
    field("key", choice === "key");
    // Where the evidence sits at a place of an account, as MnemoCode tells the kinds apart.
    const evidenceKind = this.#evidenceKind(kind);
    const located = evidenceKind !== undefined && isPlacedKind(evidenceKind);
    field("location", located);
    field("addresses", located && !(choice === "key" && kind === "account-xpub"));
    // An address names its own network, and a master fingerprint is the same on every network.
    field("network", choice === "key");
    field("passphrase", (choice !== undefined && choice !== "none") || this.#listWanted);
    // A WIF is a private key: it is typed concealed, with the command line's warning.
    if (this.#key === null) return;
    const wif = choice === "key" && kind === "wif";
    this.#key.type = wif ? "password" : "text";
    required<HTMLElement>(`#${this.#prefix}-wallet-wif-warning`).hidden = !wif;
  }
}

// How MnemoCode recognises the wallet among the candidates of a search, as its command line asks:
// the master fingerprint, a Bitcoin address, another key of the wallet (a master or account
// extended public key, a compressed public key, or a WIF, which can spend the funds), an address
// of another coin, or nothing. An address, a public key or a WIF is compared at its place and among
// as many addresses from there as the person says (20 by default, MnemoCode's). The Dash Community
// Edition offers the fingerprint and a Dash address, an edition with neither coin the fingerprint
// only: the build removes the other fields and gives it the matching recognition
// (mnemocode-wallet.ts). The evidence is checked by MnemoCode's rules before the search starts.
import {
  defaultAddressCount,
  parseAddressCount,
  parsePlaceNumber,
  DEFAULT_ADDRESS_COUNT,
  MAX_ADDRESS_COUNT,
  ADDRESS_COUNT_RANGE,
  LAST_NORMAL_INDEX,
} from "../../../../packages/recovery-mnemocode/source/core/address-scan.js";
import { MAX_PASSPHRASE_BYTES } from "../../../../packages/recovery-mnemocode/source/core/candidate-list.js";
import type { AddressLocation } from "../../../../packages/recovery-mnemocode/source/core/coins/coin.js";
import type {
  BitcoinNetworkName,
  BitcoinProfile,
  DerivationLocation,
} from "../../../../packages/recovery-mnemocode/source/core/wallet-evidence.js";
import type {
  WalletEvidence,
  WalletEvidenceRequest,
} from "@ckd/recovery-backup/mnemocode-wallet.js";
import { MnemoCodeWalletRecognition } from "@ckd/recovery-backup/mnemocode-wallet-bitcoin.js";
import { LiteralSecretField } from "@ckd/ui/literal-secret-field.js";
import { installTextFileImport } from "@ckd/ui/text-file-import.js";
import { installSecretToggle, PHRASE_FILE_IMPORT, required } from "./recovery-workspace-shared.js";

/** The network named with a master fingerprint, which is the same on every network. */
const MASTER_FINGERPRINT_NETWORK: BitcoinNetworkName = "mainnet";

type EvidenceChoice = "fingerprint" | "address" | "key" | "coin" | "none";
/** How many coins the note of "Address of another coin" names, as MnemoCode's menu does. */
const NAMED_COINS = 3;
type KeyKind = "master-xpub" | "account-xpub" | "compressed-public-key" | "wif";

export class WalletEvidenceField {
  readonly #prefix: string;
  /** The key fields, absent from an edition without Bitcoin. */
  readonly #keyKind: HTMLSelectElement | null;
  readonly #key: HTMLInputElement | null;
  readonly #passphrase: LiteralSecretField;
  /** The coin of "Address of another coin", absent from a build that offers no other coin. */
  readonly #coin: HTMLSelectElement | null;
  /** Shows the passphrase also when a candidate list needs it without a wallet check. */
  #listWanted = false;
  #defaultAddresses = true;

  /** `prefix` names the fields, as in `#{prefix}-wallet-fingerprint`. */
  constructor(prefix: string) {
    this.#prefix = prefix;
    this.#installLimits();
    this.#coin = document.querySelector<HTMLSelectElement>(`#${prefix}-wallet-coin`);
    this.#offerCoins();
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
        ?.setAttribute("max", String(LAST_NORMAL_INDEX));
    }
    const count = document.querySelector<HTMLInputElement>(`#${this.#prefix}-wallet-addresses`);
    if (count !== null) {
      count.setAttribute("min", String(ADDRESS_COUNT_RANGE.min));
      count.setAttribute("max", String(MAX_ADDRESS_COUNT));
      this.#defaultAddresses = count.value === "" || count.value === String(DEFAULT_ADDRESS_COUNT);
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
      note.textContent = `${DEFAULT_ADDRESS_COUNT} by default (or the addresses left at the final index), at most ${MAX_ADDRESS_COUNT.toLocaleString("en-US")}, so that a wallet that skipped addresses is found.`;
    const limit = document.querySelector<HTMLElement>(`#${this.#prefix}-wallet-passphrase-limit`);
    if (limit !== null) limit.textContent = String(MAX_PASSPHRASE_BYTES);
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
    MnemoCodeWalletRecognition.assertEvidence(evidence);
    return { evidence, passphrase: this.#passphrase.read() };
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
          profiles: this.#profiles(),
          location: this.#location(this.#network()),
          addresses: this.#addresses(),
        };
      case "key":
        return this.#keyEvidence(this.#network());
      case "coin":
        return {
          kind: "coin-address",
          coin: (this.#coin?.value ?? "") as Extract<
            WalletEvidence,
            { kind: "coin-address" }
          >["coin"],
          value: this.#value("coin-address"),
          location: this.#place(),
          addresses: this.#addresses(),
        };
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
    const located = { value, profiles: this.#profiles(), location: this.#location(network) };
    // An account xpub is compared at its account; a public key or a WIF among the addresses.
    if (kind === "account-xpub") return { kind, ...located };
    return { kind, ...located, addresses: this.#addresses() };
  }

  /** The coins of this edition in the coin choice, and the row's words for them. */
  #offerCoins(): void {
    const coins = MnemoCodeWalletRecognition.COINS;
    if (this.#coin === null || coins.length === 0) return;
    this.#coin.replaceChildren(
      ...coins.map((coin) => {
        const option = document.createElement("option");
        option.value = coin.id;
        option.textContent = `${coin.name} · ${coin.addressForms}`;
        return option;
      }),
    );
    const label = required<HTMLElement>(`#${this.#prefix}-wallet-coin-label`);
    const note = required<HTMLElement>(`#${this.#prefix}-wallet-coin-note`);
    // One coin, as in the Dash Community Edition, is named itself; several as MnemoCode's menu does.
    if (coins.length === 1) {
      label.textContent = `${coins[0]!.name} address`;
      note.textContent = coins[0]!.addressForms;
      this.#coin.closest<HTMLElement>("label")!.hidden = true;
      return;
    }
    const named = coins.slice(0, NAMED_COINS).map((coin) => coin.name);
    const more = coins.length - named.length;
    note.textContent = more > 0 ? `${named.join(", ")} and ${more} more` : named.join(" or ");
  }

  /** The place of a coin address: account, branch and index, without a network or address type. */
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
    const first = this.#number("index");
    return typed === "" ? defaultAddressCount(first) : parseAddressCount(typed, first);
  }

  /**
   * The address types ticked, as the command line's --bitcoin-profile list; none ticked tries the
   * four single-key profiles, as its auto does.
   */
  #profiles(): readonly BitcoinProfile[] {
    const ticked = MnemoCodeWalletRecognition.PROFILES.filter(
      (profile) =>
        document.querySelector<HTMLInputElement>(`#${this.#prefix}-wallet-profile-${profile}`)
          ?.checked === true,
    );
    return (ticked.length === 0 ? MnemoCodeWalletRecognition.PROFILES : ticked) as BitcoinProfile[];
  }

  #location(network: BitcoinNetworkName): DerivationLocation {
    return { network, ...this.#place() };
  }

  /** An account, branch or index, read as MnemoCode's questions read it. */
  #number(name: string): number {
    return parsePlaceNumber(this.#value(name));
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
    field("coin", choice === "coin");
    const located =
      choice === "address" || choice === "coin" || (choice === "key" && kind !== "master-xpub");
    field("location", located);
    // A coin address names its own type and network; Bitcoin's address and keys are told them.
    const profile = document.querySelector<HTMLElement>(`#${this.#prefix}-wallet-profile-row`);
    if (profile !== null) profile.hidden = !(choice === "address" || choice === "key");
    field("addresses", located && !(choice === "key" && kind === "account-xpub"));
    // A master fingerprint is the same on every network.
    field("network", choice === "address" || choice === "key");
    field("passphrase", (choice !== undefined && choice !== "none") || this.#listWanted);
    // A WIF is a private key: it is typed concealed, with the command line's warning.
    if (this.#key === null) return;
    const wif = choice === "key" && kind === "wif";
    this.#key.type = wif ? "password" : "text";
    required<HTMLElement>(`#${this.#prefix}-wallet-wif-warning`).hidden = !wif;
  }
}

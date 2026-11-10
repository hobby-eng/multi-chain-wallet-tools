// How a person chooses coins and their network: the coin menu, grouped as the coins' facts group
// them (the EVM networks), the candidate scan's coin boxes with one box per group, and the networks
// a chosen coin offers.
import type { RecoveryCoinAdapter, RecoveryNetwork } from "./types.js";

type CoinChoice = Pick<RecoveryCoinAdapter, "id" | "label" | "group" | "groupNote">;

/** Appends an option per coin to `select`, each grouped coin under its group's <optgroup>. */
export function appendCoinOptions(select: HTMLSelectElement, coins: readonly CoinChoice[]): void {
  const document = select.ownerDocument;
  const groups = new Map<string, HTMLOptGroupElement>();
  for (const coin of coins) {
    const option = document.createElement("option");
    option.value = coin.id;
    option.textContent = coin.label;
    if (coin.group === undefined) {
      select.append(option);
      continue;
    }
    let group = groups.get(coin.group);
    if (group === undefined) {
      group = document.createElement("optgroup");
      group.label = coin.group;
      groups.set(coin.group, group);
      select.append(group);
    }
    group.append(option);
  }
}

/**
 * Offers Testnet only when the chosen coin has one (most EVM networks have none here); a Testnet
 * choice the coin cannot scan falls back to Mainnet. `networks` undefined offers both.
 */
export function offerNetworks(
  select: HTMLSelectElement,
  networks: readonly RecoveryNetwork[] | undefined,
): void {
  const testnet = select.querySelector<HTMLOptionElement>('option[value="testnet"]');
  if (testnet === null) return;
  testnet.disabled = networks !== undefined && !networks.includes("testnet");
  if (testnet.disabled && select.value === "testnet") select.value = "mainnet";
}

/** A box that stands for several: checked when all are, mixed when some are. */
function mirror(box: HTMLInputElement, members: readonly HTMLInputElement[]): void {
  box.checked = members.every((input) => input.checked);
  box.indeterminate = !box.checked && members.some((input) => input.checked);
}

/**
 * The coins a candidate scan checks: a box per coin, an "All <group>" box per coin group (unchecked
 * at first) and the picker's "All supported coins" box. Only the first coin starts checked.
 */
export class CandidateCoinPicker {
  readonly #list: HTMLElement;
  readonly #all: HTMLInputElement;
  readonly #changed: () => void;
  readonly #inputs: HTMLInputElement[] = [];
  readonly #groups = new Map<
    string,
    { box: HTMLInputElement; members: HTMLInputElement[]; list: HTMLElement }
  >();

  /** `changed` runs after every change of a box, whichever box the person used. */
  constructor(list: HTMLElement, all: HTMLInputElement, changed: () => void) {
    this.#list = list;
    this.#all = all;
    this.#changed = changed;
    all.addEventListener("change", () => this.#set(this.#inputs, all.checked));
  }

  /** Adds a box per coin, in the registry's order, each grouped coin inside its group. */
  populate(coins: readonly CoinChoice[]): void {
    for (const coin of coins) {
      const { label, checkbox } = this.#box(coin.label, this.#inputs.length === 0);
      checkbox.value = coin.id;
      checkbox.addEventListener("change", () => this.#set([], false));
      this.#inputs.push(checkbox);
      if (coin.group === undefined) this.#list.append(label);
      else this.#group(coin.group, coin.groupNote, label, checkbox);
    }
    this.#sync();
  }

  /** The ids of the checked coins, in the registry's order. */
  selectedIds(): string[] {
    return this.#inputs.filter((input) => input.checked).map((input) => input.value);
  }

  /** Adds a coin to its group, made with its "All" box and `note` beside it on first use. */
  #group(
    name: string,
    note: string | undefined,
    label: HTMLElement,
    checkbox: HTMLInputElement,
  ): void {
    let group = this.#groups.get(name);
    if (group === undefined) {
      const document = this.#list.ownerDocument;
      const { label: boxLabel, checkbox: box } = this.#box(`All ${name}`, false);
      box.dataset.candidateGroup = name;
      const members: HTMLInputElement[] = [];
      box.addEventListener("change", () => this.#set(members, box.checked));
      const element = document.createElement("div");
      element.className = "candidate-coin-group";
      const list = document.createElement("div");
      list.className = "candidate-group-coins";
      element.append(boxLabel);
      if (note !== undefined) {
        const hint = document.createElement("small");
        hint.className = "field-note candidate-group-note";
        hint.textContent = note;
        element.append(hint);
      }
      element.append(list);
      this.#list.append(element);
      group = { box, members, list };
      this.#groups.set(name, group);
    }
    group.members.push(checkbox);
    group.list.append(label);
  }

  /** A checkbox inside its label. */
  #box(text: string, checked: boolean): { label: HTMLLabelElement; checkbox: HTMLInputElement } {
    const document = this.#list.ownerDocument;
    const label = document.createElement("label");
    label.className = "candidate-choice";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    label.append(checkbox, document.createTextNode(` ${text}`));
    return { label, checkbox };
  }

  #set(inputs: readonly HTMLInputElement[], checked: boolean): void {
    for (const input of inputs) input.checked = checked;
    this.#sync();
    this.#changed();
  }

  #sync(): void {
    for (const { box, members } of this.#groups.values()) mirror(box, members);
    mirror(this.#all, this.#inputs);
  }
}

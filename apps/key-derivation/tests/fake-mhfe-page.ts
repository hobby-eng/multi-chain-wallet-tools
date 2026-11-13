// A synthetic page for the MHFE tab tests: elements made on first use, one per selector, with the
// parts of the DOM that the tabs and their fields use, and the radio groups a tab reads by name.
// No WebAssembly, worker or Argon2 runs in a test that uses it.
import { vi } from "vitest";
import type { MhfeEngine } from "../src/ui/recovery-mhfe-engine.js";

/**
 * The package's fixed values as its parameters() give them, the parts the tabs read: the rounds
 * of a stage, the same-length suite, the PIM and memory levels, the wallet check's bits and the
 * coins of an address search.
 */
export function withPackageValues(engine: MhfeEngine): void {
  engine.coreParameters = (async () => ({
    maxInputTextBytes: 8192,
    maxPim: 1023,
    maxMemoryLevel: 21,
    highestBrowserMemoryLevel: 0,
    repairWordCounts: [2, 4, 6, 8],
    rounds: 12,
    progressStages: ["recover", "encrypt", "check", "compare"],
    progressRoundTotals: [12, 24, 36],
    openedWordCount: 24,
    sameLengthSuiteId: "MHFE-BIP39-LP-EXPERIMENTAL-4",
    decoyScanGap: 20,
    wordCounts: [12, 15, 18, 21, 24],
    builtInCheckWordCounts: [12, 15, 18, 21],
    hiddenWalletRefusals: ["PASSWORD_ALREADY_USED", "PASSWORDS_DIFFER", "EMPTY_PASSWORD"],
  })) as never;
  engine.walletParameters = (async () => ({
    maxInputTextBytes: 8192,
    walletCheckBits: 16,
    coins: [{ id: "bitcoin", name: "Bitcoin", addressForms: "synthetic forms" }],
  })) as never;
  engine.passwordParameters = (async () => ({
    maxInputTextBytes: 8192,
    defaultWords: 5,
    recommendedWords: 5,
    mostWords: 32,
    defaultCharacters: 16,
    recommendedCharacters: 16,
    mostCharacters: 64,
    weakBelowBits: 50,
  })) as never;
}

export class FakeClassList {
  readonly #names = new Set<string>();
  add(...names: string[]): void {
    for (const name of names) this.#names.add(name);
  }
  remove(...names: string[]): void {
    for (const name of names) this.#names.delete(name);
  }
  toggle(name: string, force?: boolean): boolean {
    const on = force ?? !this.#names.has(name);
    if (on) this.#names.add(name);
    else this.#names.delete(name);
    return on;
  }
  contains(name: string): boolean {
    return this.#names.has(name);
  }
}

/** The parts of an element that the MHFE tabs and their fields use. */
export class FakeElement extends EventTarget {
  value = "";
  checked = false;
  hidden = false;
  disabled = false;
  readOnly = false;
  rows = 0;
  type = "password";
  className = "";
  textContent = "";
  onclick: (() => void) | null = null;
  /** A number field's state: badInput while its text is no number. */
  readonly validity = { badInput: false };
  readonly dataset: Record<string, string | undefined> = {};
  readonly classList = new FakeClassList();
  readonly children: (FakeElement | string)[] = [];
  readonly #attributes = new Map<string, string>();
  label: FakeElement | null = null;

  /** Its own text and that of everything inside it. */
  get text(): string {
    return [
      this.textContent,
      ...this.children.map((child) => (typeof child === "string" ? child : child.text)),
    ].join(" ");
  }

  /** Native firstElementChild ignores text nodes; diagnostic rendering depends on it. */
  get firstElementChild(): FakeElement | null {
    return this.children.find((child): child is FakeElement => typeof child !== "string") ?? null;
  }

  get childElementCount(): number {
    return this.children.filter((child) => typeof child !== "string").length;
  }

  setAttribute(name: string, value: string): void {
    this.#attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.#attributes.get(name) ?? null;
  }
  append(...nodes: (FakeElement | string)[]): void {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: (FakeElement | string)[]): void {
    this.children.splice(0, this.children.length, ...nodes);
  }
  after(): void {}
  /** The fake keeps no parent, so removing an element changes nothing else. */
  remove(): void {}
  closest(): FakeElement | null {
    return this.label;
  }
  /** Native single-class matching used by private presentation cleanup. */
  matches(selector: string): boolean {
    const name = /^\.([\w-]+)$/u.exec(selector)?.[1];
    return (
      name !== undefined &&
      (this.classList.contains(name) || this.className.split(/\s+/u).includes(name))
    );
  }
  contains(node: FakeElement): boolean {
    return (
      this === node ||
      this.children.some((child) => typeof child !== "string" && child.contains(node))
    );
  }
  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    return this.children.flatMap((child) =>
      typeof child === "string"
        ? []
        : [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)],
    );
  }
  focus(): void {}
  click(): void {
    this.dispatchEvent(new Event("click"));
  }
}

/** A document whose elements are made on first use, one per selector, and a window. */
export function installPage(
  radioGroups: Readonly<Record<string, readonly [string, string][]>> = {},
): (selector: string) => FakeElement {
  const elements = new Map<string, FakeElement>();
  const makeElement = (): FakeElement =>
    Object.assign(new FakeElement(), { ownerDocument: page, isConnected: true });
  const element = (selector: string): FakeElement => {
    let found = elements.get(selector);
    if (found === undefined) {
      found = makeElement();
      elements.set(selector, found);
    }
    return found;
  };
  const documentEvents = new EventTarget();
  const windowEvents = new EventTarget();
  const page = {
    defaultView: windowEvents,
    visibilityState: "visible",
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents),
    body: new FakeElement(),
    querySelector: element,
    querySelectorAll: (selector: string) => {
      if (selector === "[data-recovery-secret-control]")
        return [...elements.values()].filter(
          (node) => node.dataset.recoverySecretControl !== undefined,
        );
      const group = /^input\[name="([^"]+)"\]$/u.exec(selector)?.[1];
      if (group !== undefined) return (radioGroups[group] ?? []).map(([id]) => element(`#${id}`));
      return selector.startsWith("#") ? [element(selector)] : [];
    },
    createElement: makeElement,
  };
  Object.assign(page.body, { ownerDocument: page, isConnected: true });
  for (const radios of Object.values(radioGroups))
    for (const [id, value] of radios) {
      element(`#${id}`).value = value;
      element(`#${id}`).label = makeElement();
    }
  vi.stubGlobal("document", page);
  vi.stubGlobal("window", windowEvents);
  return element;
}

/** Lets every pending promise reaction run. */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await new Promise((done) => setTimeout(done, 0));
}

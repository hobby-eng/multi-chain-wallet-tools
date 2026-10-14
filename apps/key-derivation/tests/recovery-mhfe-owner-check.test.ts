import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerPhraseCheck } from "../src/ui/recovery-mhfe-owner-check.js";

class FakeClassList {
  readonly #names = new Set<string>();
  add(...names: string[]): void {
    for (const name of names) this.#names.add(name);
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

/** The parts of an element that the owner's check uses. */
class FakeElement extends EventTarget {
  value = "";
  textContent = "";
  type = "";
  rows = 0;
  readOnly = false;
  readonly classList = new FakeClassList();
  readonly children: FakeElement[] = [];
  readonly tag: string;

  constructor(tag: string) {
    super();
    this.tag = tag;
  }
  set className(names: string) {
    for (const name of names.split(" ")) this.classList.add(name);
  }
  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...nodes);
  }
  click(): void {
    this.dispatchEvent(new Event("click"));
  }
  /** The first element inside, at any depth, that `matches` accepts. */
  find(matches: (element: FakeElement) => boolean): FakeElement | undefined {
    for (const child of this.children) {
      if (matches(child)) return child;
      const inner = child.find(matches);
      if (inner !== undefined) return inner;
    }
    return undefined;
  }
}

/** A window that counts the listeners added and removed, by event type. */
class FakeWindow extends EventTarget {
  readonly listeners = new Map<string, number>();
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.set(type, (this.listeners.get(type) ?? 0) + 1);
    super.addEventListener(type, listener);
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.set(type, (this.listeners.get(type) ?? 0) - 1);
    super.removeEventListener(type, listener);
  }
}

/** A synthetic check: never a real phrase. */
const CHECK = {
  phrase: "public test phrase",
  words: 24 as const,
  fingerprintWithoutPassphrase: "73c5da0a",
};

let fakeWindow: FakeWindow;

beforeEach(() => {
  fakeWindow = new FakeWindow();
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function prompt(): { host: FakeElement; status: FakeElement; check: OwnerPhraseCheck } {
  const host = new FakeElement("div");
  const status = new FakeElement("p");
  const check = new OwnerPhraseCheck(
    host as unknown as HTMLElement,
    status as unknown as HTMLElement,
  );
  return { host, status, check };
}

const phraseOf = (host: FakeElement) => host.find((element) => element.tag === "textarea")!;
const buttonNamed = (host: FakeElement, text: string) =>
  host.find((element) => element.tag === "button" && element.textContent === text)!;

describe("the owner's check of a rekey", () => {
  for (const [answer, matches] of [
    ["Yes, every word", true],
    ["No, stop", false],
  ] as const) {
    it(`answers ${matches} and removes the phrase and its listener`, async () => {
      const { host, status, check } = prompt();
      const answered = check.ask(CHECK);
      const phrase = phraseOf(host);
      expect(phrase.value).toBe(CHECK.phrase);
      expect(status.textContent).toBe("Waiting for your answer below.");
      expect(fakeWindow.listeners.get("blur")).toBe(1);
      buttonNamed(host, answer).click();
      await expect(answered).resolves.toBe(matches);
      expect(phrase.value).toBe("");
      expect(host.children).toHaveLength(0);
      expect(fakeWindow.listeners.get("blur")).toBe(0);
      expect(check.open).toBe(false);
    });
  }

  it("closes an open question as a No when the job is cancelled or fails", async () => {
    const { host, check } = prompt();
    const answered = check.ask(CHECK);
    const phrase = phraseOf(host);
    buttonNamed(host, "Show phrase").click();
    expect(phrase.classList.contains("concealed")).toBe(false);
    expect(check.open).toBe(true);
    check.dispose();
    await expect(answered).resolves.toBe(false);
    expect(phrase.value).toBe("");
    expect(host.children).toHaveLength(0);
    expect(fakeWindow.listeners.get("blur")).toBe(0);
    // The detached phrase no longer listens to the window.
    fakeWindow.dispatchEvent(new Event("blur"));
    expect(phrase.classList.contains("concealed")).toBe(false);
  });

  it("does nothing when closed twice or with no question open", () => {
    const { check } = prompt();
    expect(() => check.dispose()).not.toThrow();
    void check.ask(CHECK);
    check.dispose();
    expect(() => check.dispose()).not.toThrow();
    expect(check.open).toBe(false);
    expect(fakeWindow.listeners.get("blur")).toBe(0);
  });

  it("closes the older question when a newer one is asked", async () => {
    const { host, check } = prompt();
    const first = check.ask(CHECK);
    const firstPhrase = phraseOf(host);
    const firstYes = buttonNamed(host, "Yes, every word");
    const second = check.ask({ ...CHECK, phrase: "another public test phrase" });
    await expect(first).resolves.toBe(false);
    expect(firstPhrase.value).toBe("");
    expect(fakeWindow.listeners.get("blur")).toBe(1);
    // A detached button of the first question cannot answer the second.
    firstYes.click();
    expect(check.open).toBe(true);
    buttonNamed(host, "No, stop").click();
    await expect(second).resolves.toBe(false);
    expect(fakeWindow.listeners.get("blur")).toBe(0);
  });

  it("does not close by itself when the page is left: the tab does that", () => {
    const { check } = prompt();
    void check.ask(CHECK);
    fakeWindow.dispatchEvent(new Event("pagehide"));
    expect(check.open).toBe(true);
    check.dispose();
  });
});

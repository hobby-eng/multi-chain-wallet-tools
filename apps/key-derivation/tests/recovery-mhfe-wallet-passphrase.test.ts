import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WalletPassphraseQuestion } from "../src/ui/recovery-mhfe-wallet-passphrase.js";

/** The parts of a radio button or a fieldset that the question uses. */
class FakeElement extends EventTarget {
  checked = false;
  hidden = false;
  /** A click as the browser makes it: the radio is checked and says so. */
  choose(): void {
    this.checked = true;
    this.dispatchEvent(new Event("change"));
  }
}

let elements: Map<string, FakeElement>;

beforeEach(() => {
  elements = new Map();
  vi.stubGlobal("document", {
    querySelector: (selector: string) => {
      let found = elements.get(selector);
      if (found === undefined) {
        found = new FakeElement();
        elements.set(selector, found);
      }
      return found;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const UNANSWERED = "Say whether the wallet of this phrase has a BIP39 passphrase.";

describe("the question whether the wallet has a BIP39 passphrase", () => {
  it("has no answer chosen, and a long job is refused until it is answered", () => {
    elements.set(
      "#mhfe-test-wallet-passphrase-yes",
      Object.assign(new FakeElement(), { checked: true }),
    );
    const question = new WalletPassphraseQuestion("test");
    // An answer left from an earlier page is cleared: neither is preselected.
    expect(question.answer).toBeUndefined();
    expect(() => question.required()).toThrow(UNANSWERED);
  });

  it("gives the answer chosen and tells its listener", () => {
    const question = new WalletPassphraseQuestion("test");
    const changes = vi.fn();
    question.onChange(changes);
    elements.get("#mhfe-test-wallet-passphrase-no")!.choose();
    expect(question.required()).toBe(false);
    elements.get("#mhfe-test-wallet-passphrase-no")!.checked = false;
    elements.get("#mhfe-test-wallet-passphrase-yes")!.choose();
    expect(question.required()).toBe(true);
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it("asks again after a reset, and shows or hides its fieldset", () => {
    const question = new WalletPassphraseQuestion("test");
    elements.get("#mhfe-test-wallet-passphrase-yes")!.choose();
    question.reset();
    expect(question.answer).toBeUndefined();
    question.hidden = true;
    expect(elements.get("#mhfe-test-wallet-passphrase")!.hidden).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MhfePasswordReview } from "@ckd/recovery-mhfe-wasm/passwords/passwords.js";
import type { MhfeEngine } from "../src/ui/recovery-mhfe-engine.js";
import { PasswordReview, type PasswordField } from "../src/ui/recovery-mhfe-fields.js";
import { MhfeRun } from "../src/ui/recovery-mhfe-run.js";

class FakeClassList {
  readonly #names = new Set<string>();
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

/** The parts of an element that a password review uses. */
class FakeElement extends EventTarget {
  hidden = false;
  textContent = "";
  value = "";
  checked = false;
  name = "";
  type = "";
  className = "";
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string | undefined> = {};
  readonly children: (FakeElement | string)[] = [];
  readonly #attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.#attributes.set(name, value);
  }
  append(...nodes: (FakeElement | string)[]): void {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: (FakeElement | string)[]): void {
    this.children.splice(0, this.children.length, ...nodes);
  }
  focus(): void {}
  /** The checked radio inside, at any depth: the only query the review makes. */
  querySelector(): FakeElement | null {
    for (const child of this.children) {
      if (typeof child === "string") continue;
      if (child.type === "radio" && child.checked) return child;
      const inner = child.querySelector();
      if (inner !== null) return inner;
    }
    return null;
  }
}

const BOX = "mhfe-test-password-review";
/** Synthetic passwords only. */
const TYPED = "synthetic password";
const OTHER = "another synthetic password";

function review(overrides: Partial<MhfePasswordReview>): MhfePasswordReview {
  return {
    profile: "MHFE-PASSWORD-CHECK-1",
    reading: "notThisShape",
    correction: null,
    correctionText: null,
    offersCorrection: false,
    repairsFirst: false,
    repairs: [],
    ...overrides,
  };
}

/** A review whose check word restores word 3: it needs the user's choice. */
const RESTORABLE = review({
  reading: "restorable",
  repairsFirst: true,
  repairs: [{ position: 3, word: "abandon", typed: null }],
});
/** A review that needs no answer. */
const FITS = review({ reading: "fits" });

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

let elements: Map<string, FakeElement>;
const element = (selector: string): FakeElement => {
  let found = elements.get(selector);
  if (found === undefined) {
    found = new FakeElement();
    elements.set(selector, found);
  }
  return found;
};

beforeEach(() => {
  elements = new Map();
  const documentEvents = new EventTarget();
  vi.stubGlobal("document", {
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    querySelector: element,
    querySelectorAll: () => [],
    createElement: () => new FakeElement(),
  });
  vi.stubGlobal("window", new EventTarget());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A review over two fields whose package answers each review when the test says so. */
function setup() {
  const reviews: { password: string; answer: ReturnType<typeof deferred<MhfePasswordReview>> }[] =
    [];
  const engine = {
    passwords: async () => ({
      review: ({ password }: { password: string }) => {
        const answer = deferred<MhfePasswordReview>();
        reviews.push({ password, answer });
        return answer.promise;
      },
    }),
  } as unknown as MhfeEngine;
  const field = (): { input: FakeElement; clear: () => void } => {
    const input = new FakeElement();
    return { input, clear: () => (input.value = "") };
  };
  const first = field();
  const repeat = field();
  const passwordReview = new PasswordReview(engine, BOX, [
    first as unknown as PasswordField,
    repeat as unknown as PasswordField,
  ]);
  const run = new MhfeRun(() => undefined);
  const edit = (input: FakeElement, value: string): void => {
    input.value = value;
    input.dispatchEvent(new Event("input"));
  };
  return {
    reviews,
    review: passwordReview,
    choose: (password: string) => passwordReview.choose(run, password, password),
    first: first.input,
    repeat: repeat.input,
    edit,
    box: element(`#${BOX}`),
    answers: element(`#${BOX} .mhfe-review-answers`),
    explanation: element(`#${BOX} .mhfe-review-explanation`),
    toggle: element(`#toggle-${BOX}`),
  };
}

/** Lets every pending promise reaction run. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await new Promise((done) => setTimeout(done, 0));
}

const DROPPED = { wait: "The password changed while it was reviewed. Press the button again." };

describe("a password review drops what belongs to a password no longer typed", () => {
  it("shows the answers of an unchanged password, then applies the one chosen", async () => {
    const t = setup();
    const waiting = t.choose(TYPED);
    await settle();
    t.reviews[0]!.answer.resolve(RESTORABLE);
    await expect(waiting).resolves.toEqual({
      wait: "Choose how to use the password, then press the button again.",
    });
    expect(t.box.hidden).toBe(false);
    expect(t.answers.children).toHaveLength(3);
    expect(t.answers.classList.contains("concealed")).toBe(true);
    expect(t.toggle.textContent).toBe("Show words");
    // The first answer, word 3 restored, is preselected.
    await expect(t.choose(TYPED)).resolves.toMatchObject({ repair: { repair: 3 } });
    expect(t.box.hidden).toBe(true);
    expect(t.answers.children).toHaveLength(0);
  });

  for (const which of ["first", "repeat"] as const) {
    it(`drops a running review when the ${which} field changes`, async () => {
      const t = setup();
      const waiting = t.choose(TYPED);
      await settle();
      t.edit(t[which], "");
      t.reviews[0]!.answer.resolve(RESTORABLE);
      await expect(waiting).resolves.toEqual(DROPPED);
      expect(t.box.hidden).toBe(true);
      expect(t.answers.children).toHaveLength(0);
      expect(t.answers.classList.contains("concealed")).toBe(true);
      expect(t.explanation.textContent).toBe("");
      // Nothing of the dropped review is kept: the same text is reviewed again.
      void t.choose(TYPED);
      await settle();
      expect(t.reviews).toHaveLength(2);
    });
  }

  it("does not let a review that needs no answer pass a password no longer typed", async () => {
    const t = setup();
    const waiting = t.choose(TYPED);
    await settle();
    t.edit(t.first, OTHER);
    t.reviews[0]!.answer.resolve(FITS);
    await expect(waiting).resolves.toEqual(DROPPED);
  });

  it("keeps the newest review when two finish in reverse order", async () => {
    const t = setup();
    const older = t.choose(OTHER);
    await settle();
    const newer = t.choose(TYPED);
    await settle();
    t.reviews[1]!.answer.resolve(RESTORABLE);
    await newer;
    const shown = [...t.answers.children];
    t.reviews[0]!.answer.resolve(RESTORABLE);
    await expect(older).resolves.toEqual(DROPPED);
    expect(t.answers.children).toEqual(shown);
    await expect(t.choose(TYPED)).resolves.toMatchObject({ repair: { repair: 3 } });
  });

  it("drops a running review when the review is reset, as a closing session does", async () => {
    const t = setup();
    const waiting = t.choose(TYPED);
    await settle();
    t.review.reset();
    t.reviews[0]!.answer.resolve(RESTORABLE);
    await expect(waiting).resolves.toEqual(DROPPED);
    expect(t.box.hidden).toBe(true);
  });
});

describe("a review choice holds only for the password it was given for", () => {
  const OUTDATED = "The password changed after it was reviewed. Press the button again.";

  /** A choice for TYPED: from a review that needs no answer, or from the answer picked. */
  async function given(t: ReturnType<typeof setup>, answered: boolean) {
    const waiting = t.choose(TYPED);
    await settle();
    t.reviews[0]!.answer.resolve(answered ? RESTORABLE : FITS);
    const result = await waiting;
    const choice = answered ? await t.choose(TYPED) : result;
    if ("wait" in choice) throw new Error(choice.wait);
    return choice;
  }

  for (const answered of [false, true]) {
    const kind = answered ? "an answered review" : "a review that needs no answer";

    it(`keeps the choice of ${kind} while the fields are unchanged`, async () => {
      const t = setup();
      const choice = await given(t, answered);
      expect(() => t.review.assertCurrent(choice)).not.toThrow();
    });

    for (const which of ["first", "repeat"] as const) {
      it(`withdraws the choice of ${kind} when the ${which} field changes`, async () => {
        const t = setup();
        const choice = await given(t, answered);
        t.edit(t[which], OTHER);
        expect(() => t.review.assertCurrent(choice)).toThrow(OUTDATED);
      });
    }
  }

  it("withdraws a choice when the review is reset", async () => {
    const t = setup();
    const choice = await given(t, false);
    t.review.reset();
    expect(() => t.review.assertCurrent(choice)).toThrow(OUTDATED);
  });
});

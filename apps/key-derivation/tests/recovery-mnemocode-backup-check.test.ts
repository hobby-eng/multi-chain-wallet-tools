import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The hints below the backup field need a browser; recovery-mnemocode-word-hints.test.ts checks them.
vi.mock("../src/ui/recovery-mnemocode-word-hints.js", () => ({
  attachMnemoCodeWordHints: () => undefined,
}));

import { loadMnemoCode } from "@ckd/recovery-backup/mnemocode-module.js";
import { encodeMnemoCode } from "@ckd/recovery-backup/mnemocode.js";
import {
  EncodedBackupCheck,
  ShareBackupCheck,
} from "@ckd/recovery-backup/mnemocode-backup-check.js";
import { splitShares } from "@ckd/recovery-backup/mnemocode-shares.js";
import { BackupCheckSection } from "../src/ui/recovery-mnemocode-backup-check.js";

// The public BIP39 test phrase and MnemoCode's published date example.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const DATES = "23-09-2026";
const PREFIX = "p";

beforeAll(async () => {
  await loadMnemoCode();
});
afterEach(() => vi.unstubAllGlobals());

/** Just enough of an element for the section: its fields, attributes and the children it shows. */
class FakeElement extends EventTarget {
  hidden = false;
  value = "";
  textContent = "";
  className = "";
  children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly classList = { toggle: (): boolean => true };
  readonly #attributes = new Map<string, string>();

  getAttribute(name: string): string | null {
    return this.#attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.#attributes.set(name, value);
  }

  closest(): null {
    return null;
  }

  querySelectorAll(): FakeElement[] {
    return [];
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children = children;
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }
}

/** A section on a fake page, with the fields a person types into and the result it shows. */
function page() {
  const ids = ["section", "backup", "dates-field", "dates", "result"].map(
    (field) => `#${PREFIX}-check-${field}`,
  );
  const elements = new Map<string, FakeElement>(
    [...ids, `#toggle-${PREFIX}-check-backup`, `#${PREFIX}-check`].map((selector) => [
      selector,
      new FakeElement(),
    ]),
  );
  const element = (selector: string): FakeElement => elements.get(selector)!;
  // An EventTarget, as the page's document is: secret controls listen to its visibility.
  const pageDocument = Object.assign(new EventTarget(), {
    body: new FakeElement(),
    defaultView: new EventTarget(),
    querySelector: (selector: string) => elements.get(selector) ?? null,
    querySelectorAll: (selector: string) => (elements.has(selector) ? [element(selector)] : []),
    createElement: () => Object.assign(new FakeElement(), { ownerDocument: pageDocument }),
  });
  for (const control of elements.values()) Object.assign(control, { ownerDocument: pageDocument });
  vi.stubGlobal("document", pageDocument);
  const section = new BackupCheckSection(PREFIX, undefined);
  const result = element(`#${PREFIX}-check-result`);
  return {
    section,
    sectionElement: element(`#${PREFIX}-check-section`),
    datesField: element(`#${PREFIX}-check-dates-field`),
    backup: element(`#${PREFIX}-check-backup`),
    dates: element(`#${PREFIX}-check-dates`),
    type(field: FakeElement, value: string): void {
      field.value = value;
      field.dispatchEvent(new Event("input"));
    },
    press(): void {
      element(`#${PREFIX}-check`).dispatchEvent(new Event("click"));
    },
    shown(): { className: string; text: string }[] {
      return result.children.map((child) => ({
        className: child.className,
        text: child.textContent,
      }));
    },
  };
}

describe("Check the written backup in the Deriver", () => {
  it("says that codes written down restore the phrase, and that a miscopied code does not", () => {
    const view = page();
    const encoded = encodeMnemoCode(PHRASE, "seedshift", "english", DATES);
    view.section.offer(
      new EncodedBackupCheck({
        mnemonic: PHRASE,
        format: "english",
        mode: "seedshift",
        dates: DATES,
      }),
    );
    view.type(view.backup, encoded.payload);
    view.type(view.dates, DATES);
    view.press();
    expect(view.shown()[0]).toMatchObject({ className: "success-callout" });
    expect(view.shown()[0]?.text.startsWith("✓ ")).toBe(true);
    const miscopied = encoded.payload.split(" ");
    miscopied[2] = miscopied[2] === "zoo" ? "abandon" : "zoo";
    view.type(view.backup, miscopied.join(" "));
    // An edit drops the verdict of the text before it.
    expect(view.shown()).toEqual([]);
    view.press();
    expect(view.shown()[0]).toMatchObject({ className: "warning-callout" });
  });

  it("asks for the dates only of a backup that has them", () => {
    const view = page();
    view.section.offer(
      new EncodedBackupCheck({
        mnemonic: PHRASE,
        format: "unicode",
        mode: "direct",
        dates: undefined,
      }),
    );
    expect(view.datesField.hidden).toBe(true);
    view.section.offer(
      new EncodedBackupCheck({
        mnemonic: PHRASE,
        format: "english",
        mode: "seedshift",
        dates: DATES,
      }),
    );
    expect(view.datesField.hidden).toBe(false);
  });

  it("checks shares written down against the split they came from", () => {
    const view = page();
    const split = splitShares({
      phrase: PHRASE,
      mode: "direct",
      dates: undefined,
      threshold: 2,
      count: 3,
      form: "words",
    });
    view.section.offer(
      new ShareBackupCheck({ mnemonic: PHRASE, mode: "direct", threshold: 2, dates: undefined }),
    );
    view.type(view.backup, split.shares.join("\n"));
    view.press();
    expect(view.shown()[0]).toMatchObject({ className: "success-callout" });
  });

  it("clears what was typed and hides the section when the result goes", () => {
    const view = page();
    const check = new EncodedBackupCheck({
      mnemonic: PHRASE,
      format: "english",
      mode: "seedshift",
      dates: DATES,
    });
    view.section.offer(check);
    view.type(view.backup, "public text typed for the earlier result");
    view.section.offer(undefined);
    expect(view.backup.value).toBe("");
    expect(view.sectionElement.hidden).toBe(true);
    // The check wiped what it held: it no longer compares.
    expect(() => check.check({ backup: "", dates: DATES })).toThrow();
  });
});

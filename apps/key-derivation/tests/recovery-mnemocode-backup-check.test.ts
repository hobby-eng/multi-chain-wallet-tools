import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@ckd/recovery-sskr-wasm/recovery_sskr_wasm_bg.wasm", async () => ({
  default: readFileSync(
    new URL(
      "../../../packages/recovery-sskr-wasm/generated/recovery_sskr_wasm_bg.wasm",
      import.meta.url,
    ),
  ),
}));

// The hints below the backup field need a browser; recovery-mnemocode-word-hints.test.ts checks them.
vi.mock("../src/ui/recovery-mnemocode-word-hints.js", () => ({
  attachMnemoCodeWordHints: () => undefined,
}));

import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { fingerprintWithoutPassphrase } from "@ckd/recovery-backup/fingerprint.js";
import { MnemoCodeShares, sskrSharePlatform } from "@ckd/recovery-backup/mnemocode-shares.js";
import { sskrCodec } from "@ckd/recovery-backup/sskr.js";
import {
  RESTORES_MESSAGE,
  ShareBackupCheck,
  type BackupCheck,
  type BackupResult,
  type WrittenBackup,
} from "../../../packages/recovery-mnemocode/source/core/backup-check.js";
import { SHARE_WORD_HINTS } from "../../../packages/recovery-mnemocode/source/sskr/share-input.js";
import { BackupCheckSection } from "../src/ui/recovery-mnemocode-backup-check.js";

// The public BIP39 test phrase.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const PREFIX = "p";
const RESTORES: BackupResult = { verdict: "restores", message: RESTORES_MESSAGE, notes: [] };
const DIFFERS: BackupResult = {
  verdict: "differs",
  message: "Synthetic: word 3 differs from the seed phrase.",
  notes: [],
};

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
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), {
      body: new FakeElement(),
      defaultView: new EventTarget(),
      querySelector: (selector: string) => elements.get(selector) ?? null,
      querySelectorAll: (selector: string) => (elements.has(selector) ? [element(selector)] : []),
      createElement: () => new FakeElement(),
    }),
  );
  const section = new BackupCheckSection(PREFIX, SHARE_WORD_HINTS);
  const result = element(`#${PREFIX}-check-result`);
  return {
    section,
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

interface HeldCall {
  readonly written: WrittenBackup;
  readonly resolve: (result: BackupResult) => void;
  readonly reject: (cause: Error) => void;
}

/** A check whose verdicts the test hands out by hand, one per press, in any order. */
class GatedCheck implements BackupCheck {
  readonly dated: boolean;
  readonly wordCount = 12;
  readonly calls: HeldCall[] = [];

  constructor(dated = false) {
    this.dated = dated;
  }

  check(written: WrittenBackup): Promise<BackupResult> {
    return new Promise((resolve, reject) => this.calls.push({ written, resolve, reject }));
  }
}

/** The real share check, after one macrotask: it yields as a long check on the page does. */
class YieldingCheck implements BackupCheck {
  readonly #inner: BackupCheck;
  readonly runs: Promise<BackupResult>[] = [];

  constructor(inner: BackupCheck) {
    this.#inner = inner;
  }

  get dated(): boolean {
    return this.#inner.dated;
  }

  get wordCount(): number {
    return this.#inner.wordCount;
  }

  check(written: WrittenBackup): Promise<BackupResult> {
    const run = settle().then(() => this.#inner.check(written));
    this.runs.push(run);
    return run;
  }
}

/** Lets pending promises and the section's continuations run. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

const SUCCESS = { className: "success-callout", text: `✓ ${RESTORES_MESSAGE}` };
const MISMATCH = { className: "warning-callout", text: DIFFERS.message };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Check the written backup in the Deriver", () => {
  it("drops a verdict when the backup is edited while the check runs (AUD-022-API006)", async () => {
    const view = page();
    const check = new GatedCheck();
    view.section.offer(check);
    view.type(view.backup, "synthetic backup as written");
    view.press();
    view.type(view.backup, "synthetic backup, corrected");
    check.calls[0]!.resolve(RESTORES);
    await settle();
    expect(check.calls[0]!.written.backup).toBe("synthetic backup as written");
    expect(view.shown()).toEqual([]);
  });

  it("drops a verdict when only the dates are edited while the check runs", async () => {
    const view = page();
    const check = new GatedCheck(true);
    view.section.offer(check);
    view.type(view.backup, "synthetic dated backup");
    view.type(view.dates, "01-01-2001");
    view.press();
    view.type(view.dates, "02-01-2001");
    check.calls[0]!.resolve(RESTORES);
    await settle();
    expect(check.calls[0]!.written.dates).toBe("01-01-2001");
    expect(view.shown()).toEqual([]);
  });

  it("drops the warning of a failed check when the backup is edited meanwhile", async () => {
    const view = page();
    const check = new GatedCheck();
    view.section.offer(check);
    view.type(view.backup, "synthetic backup as written");
    view.press();
    view.type(view.backup, "synthetic backup, corrected");
    check.calls[0]!.reject(new Error("Synthetic failure."));
    await settle();
    expect(view.shown()).toEqual([]);
  });

  it("an older success that finishes last is not shown", async () => {
    const view = page();
    const check = new GatedCheck();
    view.section.offer(check);
    view.type(view.backup, "synthetic backup");
    view.press();
    view.press();
    check.calls[1]!.resolve(DIFFERS);
    await settle();
    check.calls[0]!.resolve(RESTORES);
    await settle();
    expect(view.shown()).toEqual([MISMATCH]);
  });

  it("an older press that finishes first shows nothing, and the latest its own verdict", async () => {
    const view = page();
    const check = new GatedCheck();
    view.section.offer(check);
    view.type(view.backup, "synthetic backup");
    view.press();
    view.press();
    check.calls[0]!.resolve(RESTORES);
    await settle();
    expect(view.shown()).toEqual([]);
    check.calls[1]!.resolve(DIFFERS);
    await settle();
    expect(view.shown()).toEqual([MISMATCH]);
  });

  it("drops a pending verdict when another original or none is offered", async () => {
    const view = page();
    const first = new GatedCheck();
    view.section.offer(first);
    view.type(view.backup, "synthetic backup");
    view.press();
    view.section.offer(new GatedCheck());
    first.calls[0]!.resolve(RESTORES);
    await settle();
    expect(view.shown()).toEqual([]);

    const second = new GatedCheck();
    view.section.offer(second);
    view.type(view.backup, "synthetic backup");
    view.press();
    view.section.offer(undefined);
    second.calls[0]!.resolve(RESTORES);
    await settle();
    expect(view.shown()).toEqual([]);
  });

  it("shows the verdict of a press whose text stayed the same", async () => {
    const view = page();
    const check = new GatedCheck();
    view.section.offer(check);
    view.type(view.backup, "synthetic backup");
    view.press();
    check.calls[0]!.resolve(RESTORES);
    await settle();
    expect(view.shown()).toEqual([SUCCESS]);
  });

  it("drops a real share check's success after an edit, and shows it for unchanged shares", async () => {
    const platform = sskrSharePlatform(sskrCodec());
    /** A fixed byte stream: the shares come out the same in every run. */
    const fixedRandom = (bytes: Uint8Array): void =>
      bytes.forEach((_, index) => (bytes[index] = (index * 37 + 11) & 0xff));
    const split = await new MnemoCodeShares(platform, fixedRandom, (mnemonic) =>
      fingerprintWithoutPassphrase(mnemonic, mnemonicToSeed),
    ).split({ phrase: PHRASE, mode: "direct", dates: "", threshold: 2, count: 3, form: "words" });
    // The second share with its eighth word unreadable, as a person marks it with ?.
    const marked = split.shares[1]!.split(" ")
      .map((word, index) => (index === 7 ? "?" : word))
      .join(" ");
    const written = `${split.shares[0]}\n${marked}`;
    const view = page();
    const check = new YieldingCheck(
      new ShareBackupCheck({ mnemonic: PHRASE, mode: "direct", threshold: 2 }, platform, {
        decodeEntry: "MnemoCode › Decode",
      }),
    );
    view.section.offer(check);

    view.type(view.backup, written);
    view.press();
    view.type(view.backup, `${written}\nsynthetic extra line`);
    const [dropped] = await Promise.all(check.runs);
    await settle();
    expect(dropped!.verdict).toBe("restores");
    expect(view.shown()).toEqual([]);

    view.type(view.backup, written);
    view.press();
    await Promise.all(check.runs);
    await settle();
    expect(view.shown()).toEqual([SUCCESS]);
  });
});

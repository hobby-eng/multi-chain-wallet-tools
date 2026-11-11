import { afterEach, describe, expect, it, vi } from "vitest";

// The test replaces the engine's classes, so the package's WebAssembly is never compiled; the
// import only needs a value.
vi.mock("@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm", () => ({ default: new Uint8Array() }));

import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import { MhfeEncodeTab } from "../src/ui/recovery-mhfe-encode.js";
import { MhfeEngine } from "../src/ui/recovery-mhfe-engine.js";
import { type FakeElement, installPage, settle, withPackageValues } from "./fake-mhfe-page.js";

// A new container password made by MHFE, as mhfe offers it where one is set (made_password.rs):
// shown once, typed back from the person's copy, used only as an exact copy, and named in the
// result by how it was made, never by its words. Driven through the real Encode tab with a
// synthetic package.

// The public BIP39 test phrase.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
// A synthetic password as MhfePasswords.make() would give it: five words.
const MADE = "synthetic made password five words";
const KINDS = ["own", "words", "checkWord", "characters"] as const;
const RADIO_GROUPS = {
  "mhfe-encrypt-password-kind": KINDS.map(
    (kind) => [`mhfe-encrypt-password-kind-${kind}`, kind] as [string, string],
  ),
};

/** Every text under `element`, depth first. */
function texts(element: FakeElement | string): string[] {
  if (typeof element === "string") return [element];
  return [element.textContent, ...element.children.flatMap(texts)];
}

function setup() {
  const element = installPage(RADIO_GROUPS);
  element("#mhfe-encrypt-password-kind-own").checked = true;
  // The person's explicit choice of no repair words: an absent choice is refused, never read as 0.
  element('input[name="mhfe-repair-count"]:checked').value = "0";
  const gate = new RecoveryJobGate();
  gate.setReady(true);
  const engine = new MhfeEngine();
  withPackageValues(engine);
  const made: Record<string, unknown>[] = [];
  const encrypted: Record<string, unknown>[] = [];
  engine.client = (async () => ({
    // The 24-word container the package offers for a 12-word phrase.
    readPhrase: async (phrase: string) => ({
      phrase,
      words: 12,
      otherLengths: [],
      containers: [{ sameLength: false, words: 24, wrongWordPassesOneIn: 256, otherLengths: [] }],
    }),
    encrypt: async (request: Record<string, unknown>) => {
      encrypted.push(request);
      return {
        container: "synthetic container",
        containerFingerprint: "00000000",
        suiteId: "MHFE-BIP39-256-EXPERIMENTAL-3",
        otherLengths: [],
        repairWords: null,
        repairProfile: null,
        keep: [{ item: "containerWords", words: 24 }, { item: "password" }],
      };
    },
  })) as never;
  engine.passwords = (async () => ({
    review: async () => ({
      profile: "MHFE-PASSWORD-CHECK-1",
      reading: "notThisShape",
      correction: null,
      correctionText: null,
      offersCorrection: false,
      repairsFirst: false,
      repairs: [],
    }),
    strength: async () => ({ weak: false }),
    make: async (options: Record<string, unknown>) => {
      made.push(options);
      return { password: MADE, bits: 64.625, weak: false, checkWord: false };
    },
  })) as never;
  const copied: string[] = [];
  const writeClipboard = async (text: string) => {
    copied.push(text);
  };
  new MhfeEncodeTab({ jobs: gate, writeClipboard, readMnemonic: () => PHRASE } as never, engine);
  const choose = async (kind: (typeof KINDS)[number]): Promise<void> => {
    for (const other of KINDS)
      element(`#mhfe-encrypt-password-kind-${other}`).checked = other === kind;
    element(`#mhfe-encrypt-password-kind-${kind}`).dispatchEvent(new Event("change"));
    // The fake page does not bubble: the panel hears the change as a page's would.
    element("#mhfe-create-panel").dispatchEvent(new Event("change"));
    await settle();
  };
  const encrypt = async (): Promise<void> => {
    element("#mhfe-encrypt").click();
    await settle();
  };
  /** Opens MHFE's fields, as its panel check does, so that every memory level is offered. */
  const open = async (): Promise<void> => {
    engine.passed();
    await settle();
  };
  /** Chooses a memory level, as a person does in its list. */
  const level = async (chosen: number): Promise<void> => {
    element("#mhfe-encrypt-memory-level").value = String(chosen);
    for (const target of ["#mhfe-encrypt-memory-level", "#mhfe-create-panel"])
      element(target).dispatchEvent(new Event("change"));
    await settle();
  };
  return { element, engine, made, encrypted, copied, choose, encrypt, open, level };
}

/** The command line shown: its parts, an option with its value each, joined by spaces. */
function commandShown(page: ReturnType<typeof setup>): string {
  return page
    .element("#mhfe-encrypt-command-text")
    .children.map((part) => (typeof part === "string" ? part : part.textContent))
    .join("");
}

describe("a container password made by MHFE in Encode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("makes five dice words and shows them once, privately", async () => {
    const page = setup();
    await page.choose("words");
    expect(page.made).toEqual([{ kind: "words" }]);
    expect(page.element("#mhfe-encrypt-own-password").hidden).toBe(true);
    expect(page.element("#mhfe-encrypt-made-shown").hidden).toBe(false);
    expect(page.element("#mhfe-encrypt-made-text").textContent).toBe(MADE);
    expect(page.element("#mhfe-encrypt-made-strength").textContent).toBe(
      "5 words from the EFF list, about 64.6 bits.",
    );
    page.element("#mhfe-encrypt-made-written").click();
    expect(page.element("#mhfe-encrypt-made-text").textContent).toBe("");
    expect(page.element("#mhfe-encrypt-made-copy-field").hidden).toBe(false);
  });

  it("asks each kind of mhfe password", async () => {
    const page = setup();
    await page.choose("checkWord");
    await page.choose("characters");
    expect(page.made).toEqual([{ kind: "checkWord" }, { kind: "characters" }]);
  });

  it("refuses a wrong copy, shows the password again and encrypts nothing", async () => {
    const page = setup();
    await page.choose("words");
    page.element("#mhfe-encrypt-made-written").click();
    page.element("#mhfe-encrypt-made-copy").value = "synthetic made words fiv";
    await page.encrypt();
    expect(page.encrypted).toEqual([]);
    expect(page.element("#mhfe-encrypt-status").textContent).toBe(
      "That is not the password shown: correct your copy from the screen.",
    );
    expect(page.element("#mhfe-encrypt-made-text").textContent).toBe(MADE);
  });

  it("encrypts with an exact copy and names how the password was made, not its words", async () => {
    const page = setup();
    await page.choose("words");
    page.element("#mhfe-encrypt-made-written").click();
    page.element("#mhfe-encrypt-made-copy").value = MADE;
    await page.encrypt();
    expect(page.encrypted).toHaveLength(1);
    expect(page.encrypted[0]).toMatchObject({ password: MADE, passwordRepeat: MADE });
    const result = texts(page.element("#mhfe-encrypt-result"));
    expect(result).toContain("made by MHFE: 5 words from the EFF list, about 64.6 bits.");
    expect(result.join(" ")).not.toContain(MADE);
    // A password made is used once: the next encryption asks again.
    expect(page.element("#mhfe-encrypt-password-kind-own").checked).toBe(true);
  });

  it("keeps the person's own password, typed twice", async () => {
    const page = setup();
    page.element("#mhfe-encrypt-password").value = "synthetic own password";
    page.element("#mhfe-encrypt-password-confirm").value = "synthetic own password";
    await page.encrypt();
    expect(page.made).toEqual([]);
    expect(page.encrypted[0]).toMatchObject({
      password: "synthetic own password",
      passwordRepeat: "synthetic own password",
    });
  });
});

describe("no password made in Encode at a memory level the browser cannot run", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Says that no password made is held or shown. */
  function noneShown(page: ReturnType<typeof setup>): void {
    expect(page.element("#mhfe-encrypt-made-shown").hidden).toBe(true);
    expect(page.element("#mhfe-encrypt-made-text").textContent).toBe("");
    expect(page.element("#mhfe-encrypt-made-copy-field").hidden).toBe(true);
  }

  it("makes and shows none when the kind is chosen at a higher level", async () => {
    const page = setup();
    await page.open();
    await page.level(2);
    await page.choose("checkWord");
    expect(page.made).toEqual([]);
    noneShown(page);
    expect(commandShown(page)).toBe(
      "mhfe encrypt --pim 0 --mem 2 --new-password check-word --repair-words 0",
    );
    expect(page.element("#mhfe-encrypt-command-made").hidden).toBe(false);
  });

  it("keeps a password made at level 0 out of sight above it, and asks for its copy back at 0", async () => {
    const page = setup();
    await page.open();
    await page.choose("words");
    expect(page.made).toHaveLength(1);
    page.element("#mhfe-encrypt-made-written").click();
    page.element("#mhfe-encrypt-made-copy").value = MADE;
    await page.level(2);
    noneShown(page);
    // Its typed-back copy is emptied, and nothing encrypts at this level.
    expect(page.element("#mhfe-encrypt-made-copy").value).toBe("");
    page.element("#mhfe-encrypt-made-copy").value = MADE;
    await page.encrypt();
    expect(page.encrypted).toEqual([]);
    page.element("#mhfe-encrypt-made-again").click();
    noneShown(page);
    await page.level(0);
    // The same password, not a new one: the copy the person wrote down stays valid.
    expect(page.made).toHaveLength(1);
    expect(page.element("#mhfe-encrypt-made-copy-field").hidden).toBe(false);
    expect(page.element("#mhfe-encrypt-made-text").textContent).toBe("");
    page.element("#mhfe-encrypt-made-again").click();
    expect(page.element("#mhfe-encrypt-made-text").textContent).toBe(MADE);
    page.element("#mhfe-encrypt-made-written").click();
    page.element("#mhfe-encrypt-made-copy").value = MADE;
    await page.encrypt();
    expect(page.encrypted).toHaveLength(1);
    expect(page.encrypted[0]).toMatchObject({ password: MADE, pim: 0, memoryLevel: 0 });
  });

  it("drops a password still being made when the level rises, and makes another back at 0", async () => {
    const page = setup();
    await page.open();
    const passwords = await page.engine.passwords();
    let arrive!: () => void;
    const late = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    page.engine.passwords = (async () => ({
      ...passwords,
      make: async (options: Record<string, unknown>) => {
        page.made.push(options);
        await late;
        return { password: MADE, bits: 64.625, weak: false, checkWord: false };
      },
    })) as never;
    await page.choose("words");
    await page.level(2);
    arrive();
    await settle();
    noneShown(page);
    await page.level(0);
    expect(page.made).toHaveLength(2);
    expect(page.element("#mhfe-encrypt-made-text").textContent).toBe(MADE);
  });

  it("never puts a password made at level 0 into the command or the clipboard", async () => {
    const page = setup();
    await page.open();
    await page.choose("words");
    page.element("#mhfe-encrypt-use-pim").checked = true;
    page.element("#mhfe-encrypt-pim").value = "3";
    page.element("#mhfe-create-panel").dispatchEvent(new Event("input"));
    const line = "mhfe encrypt --pim 3 --mem 0 --new-password words --repair-words 0";
    expect(commandShown(page)).toBe(line);
    page.element("#mhfe-encrypt-command-copy").click();
    await settle();
    expect(page.copied).toEqual([line]);
    expect(page.element("#mhfe-encrypt-made-text").textContent).toBe(MADE);
    for (const shown of [commandShown(page), ...page.copied]) expect(shown).not.toContain(MADE);
  });
});

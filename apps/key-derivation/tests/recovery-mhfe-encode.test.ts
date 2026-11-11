import { afterEach, describe, expect, it, vi } from "vitest";

// The test replaces the engine's client and password review, so the package's WebAssembly is
// never compiled; the import only needs a value.
vi.mock("@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm", () => ({ default: new Uint8Array() }));

import { RecoveryJobGate, bindJobGate } from "../src/ui/recovery-job-gate.js";
import { MhfeEncodeTab } from "../src/ui/recovery-mhfe-encode.js";
import { MhfeEngine } from "../src/ui/recovery-mhfe-engine.js";
import { type FakeElement, installPage, settle, withPackageValues } from "./fake-mhfe-page.js";

// The Encode tab asks nothing about a BIP39 passphrase, as mhfe encrypt asks nothing (MHFE 0.6.0,
// owner's decision of 2026-10-08): it leaves walletHasPassphrase out, and the list of what to keep
// that the package returns names any passphrase of the wallet. Driven through the real tab with a
// synthetic client; no WebAssembly or Argon2 runs.

// The public BIP39 test phrase.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

/** A synthetic container password, typed twice. */
const PASSWORD = "synthetic password";

/** What the package seals without an answer about the passphrase (mhfe web/client.d.ts). */
const SEALED = {
  container: "synthetic container",
  containerFingerprint: "00000000",
  suiteId: "MHFE-BIP39-256-EXPERIMENTAL-3",
  otherLengths: [],
  repairWords: null,
  repairProfile: null,
  keep: [{ item: "containerWords", words: 24 }, { item: "password" }, { item: "passphraseIfAny" }],
};

/** Every text under `element`, depth first. */
function texts(element: FakeElement | string): string[] {
  if (typeof element === "string") return [element];
  return [element.textContent, ...element.children.flatMap(texts)];
}

/** The containers the package offers for the phrase, each with its own note on the length. */
type Offered = {
  sameLength: boolean;
  words: number;
  wrongWordPassesOneIn: number;
  otherLengths: number[];
};

function setup(
  containers: Offered[] = [
    { sameLength: false, words: 24, wrongWordPassesOneIn: 256, otherLengths: [] },
  ],
) {
  const element = installPage();
  const gate = new RecoveryJobGate();
  // The page binds the gate to Encrypt before the panels install, as installRecoveryWorkspace does.
  element("#mhfe-encrypt").dataset.heavyJob = "";
  bindJobGate(gate, [element("#mhfe-encrypt") as never], element("#recovery-busy") as never);
  gate.setReady(true);
  const engine = new MhfeEngine();
  withPackageValues(engine);
  const requests: Record<string, unknown>[] = [];
  engine.client = (async () => ({
    // The 24-word container the package offers for a 12-word phrase.
    readPhrase: async (phrase: string) => ({
      phrase,
      words: 12,
      otherLengths: [],
      containers,
    }),
    encrypt: async (request: Record<string, unknown>) => {
      requests.push(request);
      return SEALED;
    },
  })) as never;
  // A synthetic review that needs no answer.
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
  })) as never;
  const copied: string[] = [];
  const writeClipboard = async (text: string) => {
    copied.push(text);
  };
  const readMnemonic = vi.fn(() => PHRASE);
  new MhfeEncodeTab({ jobs: gate, writeClipboard, readMnemonic } as never, engine);
  element("#mhfe-encrypt-password").value = PASSWORD;
  element("#mhfe-encrypt-password-confirm").value = PASSWORD;
  element('input[name="mhfe-repair-count"]:checked').value = "0";
  return { element, requests, engine, gate, copied, readMnemonic };
}

/** The command line shown: its parts, an option with its value each, joined by spaces. */
function commandShown(element: ReturnType<typeof installPage>): string {
  return element("#mhfe-encrypt-command-text")
    .children.map((part) => (typeof part === "string" ? part : part.textContent))
    .join("");
}

/** Sets the memory level and the PIM as a person does, and lets the form react. */
function choose(
  element: ReturnType<typeof installPage>,
  settings: { level?: number; pim?: string; sameLength?: boolean },
): void {
  if (settings.level !== undefined) {
    element("#mhfe-encrypt-memory-level").value = String(settings.level);
    element("#mhfe-encrypt-memory-level").dispatchEvent(new Event("change"));
  }
  if (settings.pim !== undefined) {
    element("#mhfe-encrypt-use-pim").checked = true;
    element("#mhfe-encrypt-pim").value = settings.pim;
  }
  if (settings.sameLength !== undefined) element("#mhfe-length-same").checked = settings.sameLength;
  element("#mhfe-create-panel").dispatchEvent(new Event("change"));
}

describe("MHFE Encode's note on the word count, from the container chosen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const sameLength of [false, true])
    it(`says to note the word count only where its container's reading needs it (same length: ${sameLength})`, async () => {
      const tab = setup([
        { sameLength: false, words: 24, wrongWordPassesOneIn: 256, otherLengths: [21] },
        { sameLength: true, words: 12, wrongWordPassesOneIn: 16, otherLengths: [] },
      ]);
      tab.element("#mhfe-length-same").checked = sameLength;
      tab.element("#mhfe-encrypt").click();
      await settle();
      const status = tab.element("#mhfe-encrypt-status").textContent;
      if (sameLength) expect(status).not.toContain("also passes");
      else expect(status).toContain("by chance it also passes the check of 21 words");
    });
});

describe("MHFE Encode without a question about the BIP39 passphrase", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("encrypts at once and leaves walletHasPassphrase out", async () => {
    const tab = setup();
    tab.element("#mhfe-encrypt").click();
    await settle();
    expect(tab.requests).toHaveLength(1);
    expect(tab.requests[0]).not.toHaveProperty("walletHasPassphrase");
    expect(tab.element("#mhfe-encrypt-status").textContent).toMatch(/^Encryption complete/u);
  });

  it("names any BIP39 passphrase of the wallet in what to keep", async () => {
    const tab = setup();
    tab.element("#mhfe-encrypt").click();
    await settle();
    expect(texts(tab.element("#mhfe-encrypt-result"))).toContain(
      "Keep: the 24 words, the password, and any BIP39 passphrase of the wallet.",
    );
  });

  for (const action of ["cancel", "clear", "source edit"])
    it(`does not seal a late result after ${action} during final metadata`, async () => {
      const tab = setup();
      const parameters = tab.engine.coreParameters.bind(tab.engine);
      let resolve!: (value: Awaited<ReturnType<typeof parameters>>) => void;
      const late = new Promise<Awaited<ReturnType<typeof parameters>>>((done) => {
        resolve = done;
      });
      let calls = 0;
      tab.engine.coreParameters = () => (++calls === 1 ? parameters() : late);
      tab.element("#mhfe-encrypt").click();
      await settle();
      expect(tab.requests).toHaveLength(1);
      expect(calls).toBe(2);
      if (action === "cancel") tab.element("#mhfe-encrypt-stop").onclick!();
      else if (action === "clear") tab.element("#clear-all").click();
      else document.dispatchEvent(new CustomEvent("recovery-source-change", { detail: "mhfe" }));
      resolve(await parameters());
      await settle();
      expect(tab.element("#mhfe-encrypt-result").childElementCount).toBe(0);
      expect(tab.element("#mhfe-encrypt-status").textContent).not.toContain("Encryption complete");
      expect(tab.gate.runningJob).toBeNull();
      // Even a retained worker callback cannot put the old container back.
      (tab.requests[0]!.onUnverified as (value: typeof SEALED) => void)(SEALED);
      expect(tab.element("#mhfe-encrypt-result").childElementCount).toBe(0);
    });
});

describe("MHFE Encode's memory level and the mhfe command for settings the page does not run", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** The tab once MHFE has passed its panel check and its parameters are read. */
  async function opened() {
    const tab = setup();
    tab.engine.passed();
    await settle();
    return tab;
  }

  it("offers every level the package takes, level 0 chosen, and no command at the defaults", async () => {
    const tab = await opened();
    const select = tab.element("#mhfe-encrypt-memory-level");
    expect(select.children.map((option) => (option as typeof select).textContent)).toEqual(
      expect.arrayContaining(["0 · 2 GiB (default)", "1 · 3 GiB", "21 · 3 TiB"]),
    );
    expect(select.childElementCount).toBe(22);
    expect(select.value).toBe("0");
    expect(tab.element("#mhfe-encrypt-command").hidden).toBe(true);
    expect(tab.element("#mhfe-encrypt").disabled).toBe(false);
  });

  it("closes Encrypt above level 0, also after the job gate changes, and opens it at level 0", async () => {
    const tab = await opened();
    choose(tab.element, { level: 2 });
    expect(tab.element("#mhfe-encrypt").disabled).toBe(true);
    tab.gate.setReady(true);
    expect(tab.element("#mhfe-encrypt").disabled).toBe(true);
    choose(tab.element, { level: 0 });
    expect(tab.element("#mhfe-encrypt").disabled).toBe(false);
    expect(tab.element("#mhfe-encrypt-command").hidden).toBe(true);
  });

  it("encrypts with a custom PIM at level 0 and shows the command beside it", async () => {
    const tab = await opened();
    choose(tab.element, { pim: "3" });
    expect(tab.element("#mhfe-encrypt").disabled).toBe(false);
    expect(tab.element("#mhfe-encrypt-command").hidden).toBe(false);
    expect(commandShown(tab.element)).toBe(
      "mhfe encrypt --pim 3 --mem 0 --new-password own --repair-words 0",
    );
    expect(tab.element("#mhfe-encrypt-command-length").hidden).toBe(false);
    tab.element("#mhfe-encrypt").click();
    await settle();
    expect(tab.requests).toHaveLength(1);
    expect(tab.requests[0]).toMatchObject({ pim: 3, memoryLevel: 0, repairWordCount: 0 });
  });

  it("copies exactly the command shown, and nothing while a setting is refused", async () => {
    const tab = await opened();
    choose(tab.element, { level: 2, pim: "3", sameLength: true });
    const line = "mhfe encrypt --pim 3 --mem 2 --same-length --new-password own --repair-words 0";
    expect(commandShown(tab.element)).toBe(line);
    expect(tab.element("#mhfe-encrypt-command-length").hidden).toBe(true);
    tab.element("#mhfe-encrypt-command-copy").click();
    await settle();
    expect(tab.copied).toEqual([line]);
    expect(tab.element("#mhfe-encrypt-command-status").textContent).toBe("Copied to clipboard.");
    choose(tab.element, { pim: "1024" });
    expect(commandShown(tab.element)).toBe("");
    expect(tab.element("#mhfe-encrypt-command-copy").disabled).toBe(true);
    expect(tab.element("#mhfe-encrypt-command-status").textContent).toBe(
      "Type a PIM from 1 to 1023, or untick “Use a custom PIM”.",
    );
    tab.element("#mhfe-encrypt-command-copy").click();
    await settle();
    expect(tab.copied).toEqual([line]);
    // The typed password never reaches the command, its status or the clipboard.
    choose(tab.element, { pim: "3" });
    expect(commandShown(tab.element)).toBe(line);
    for (const shown of [commandShown(tab.element), ...tab.copied])
      expect(shown).not.toContain(PASSWORD);
    expect(tab.element("#mhfe-encrypt-command-status").textContent).not.toContain(PASSWORD);
  });

  it("keeps Encrypt closed above level 0 while another heavy job runs and after it ends", async () => {
    const tab = await opened();
    choose(tab.element, { level: 2 });
    await tab.gate.runHeavy("other", async () => {
      expect(tab.element("#mhfe-encrypt").disabled).toBe(true);
    });
    expect(tab.element("#mhfe-encrypt").disabled).toBe(true);
    choose(tab.element, { level: 0 });
    expect(tab.element("#mhfe-encrypt").disabled).toBe(false);
  });

  it("refuses to encrypt above level 0 before the phrase is read, even if Encrypt is pressed", async () => {
    const tab = await opened();
    choose(tab.element, { level: 2 });
    // The fake page delivers a click to a closed button too: the run refuses on its own,
    // whatever the button's state.
    tab.element("#mhfe-encrypt").click();
    await settle();
    expect(tab.requests).toHaveLength(0);
    expect(tab.readMnemonic).not.toHaveBeenCalled();
    expect(tab.element("#mhfe-encrypt-status").textContent).toBe(
      "A browser runs memory level 0 only: encrypt at level 2 with the mhfe command.",
    );
  });

  for (const [field, badInput] of [
    ["empty", false],
    ["not a number", true],
  ] as const)
    it(`refuses a ticked PIM field that is ${field}, never encrypting at PIM 0`, async () => {
      const tab = await opened();
      tab.element("#mhfe-encrypt-pim").validity.badInput = badInput;
      choose(tab.element, { pim: "" });
      expect(tab.element("#mhfe-encrypt-command").hidden).toBe(false);
      expect(commandShown(tab.element)).toBe("");
      expect(tab.element("#mhfe-encrypt-command-status").textContent).toBe(
        "Type the PIM as a whole number, or untick “Use a custom PIM”.",
      );
      tab.element("#mhfe-encrypt").click();
      await settle();
      expect(tab.requests).toHaveLength(0);
      expect(tab.readMnemonic).not.toHaveBeenCalled();
      expect(tab.element("#mhfe-encrypt-status").textContent).toBe(
        "Type the PIM as a whole number, or untick “Use a custom PIM”.",
      );
    });
});

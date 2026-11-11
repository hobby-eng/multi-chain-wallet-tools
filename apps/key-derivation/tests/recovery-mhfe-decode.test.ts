import { afterEach, describe, expect, it, vi } from "vitest";

// The test replaces the engine's classes, so the package's WebAssembly is never compiled; the
// import only needs a value.
vi.mock("@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm", () => ({ default: new Uint8Array() }));

import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import { MhfeDecodeTab } from "../src/ui/recovery-mhfe-decode.js";
import { MhfeEngine } from "../src/ui/recovery-mhfe-engine.js";
import { installPage, settle, withPackageValues } from "./fake-mhfe-page.js";

// Decode with one password or several: every PIM is settled before any recovery, so a ticked PIM
// field without a usable PIM is named at once instead of being read as PIM 0, or refused by the
// package only after the passwords before it have run their full work. Driven through the real
// tab with a synthetic package; no Argon2 runs.

/** What the package reads from a synthetic 24-word container. */
const FACTS = {
  container: "synthetic container",
  words: 24,
  suiteId: "MHFE-BIP39-256-EXPERIMENTAL-3",
  phraseLengths: [12, 15, 18, 21, 24],
  builtInCheckLengths: [12, 15, 18, 21],
  confirmationFor: { "0": "walletOrOwner" },
  hiddenWallets: true,
  offersWalletCheck: true,
  containerFingerprint: "00000000",
};

function setup() {
  const element = installPage();
  const gate = new RecoveryJobGate();
  gate.setReady(true);
  const engine = new MhfeEngine();
  withPackageValues(engine);
  const decrypted: Record<string, unknown>[] = [];
  engine.repair = (async () => ({
    inspectContainer: async () => ({ reading: "container", wordCount: 24, unreadable: [] }),
  })) as never;
  engine.client = (async () => ({
    readContainer: async () => FACTS,
    // The first recovery stays running: the test looks at what started.
    decrypt: (request: Record<string, unknown>) => {
      decrypted.push(request);
      return new Promise(() => undefined);
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
  })) as never;
  new MhfeDecodeTab({ jobs: gate, writeClipboard: async () => undefined } as never, engine);
  element("#mhfe-container").value = FACTS.container;
  element("#mhfe-decrypt-password").value = "synthetic password one";
  /** Ticks a password's custom PIM and types `typed` into it; `id` is its field prefix. */
  const pim = (id: string, typed: string): void => {
    element(`#${id}-use-pim`).checked = true;
    element(`#${id}-use-pim`).dispatchEvent(new Event("change"));
    element(`#${id}-pim`).value = typed;
  };
  const press = async (): Promise<void> => {
    element("#mhfe-decrypt").click();
    await settle();
  };
  return { element, decrypted, pim, press, status: () => element("#mhfe-decrypt-status") };
}

describe("MHFE Decode settles every PIM before any recovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses an empty PIM of the one password instead of recovering at PIM 0", async () => {
    const tab = setup();
    tab.pim("mhfe-decrypt", "");
    await tab.press();
    expect(tab.decrypted).toEqual([]);
    expect(tab.status().textContent).toBe(
      "Type the PIM as a whole number, or untick “Use a custom PIM”.",
    );
  });

  for (const [typed, message] of [
    ["", "Password 2: Type the PIM as a whole number, or untick “Use a custom PIM”."],
    ["2000", "Password 2: Type a PIM from 1 to 1023, or untick “Use a custom PIM”."],
  ] as const)
    it(`names an added password whose PIM holds "${typed}" before password 1 runs`, async () => {
      const tab = setup();
      tab.element("#mhfe-decrypt-add-password").click();
      tab.element("#mhfe-decrypt-2-password").value = "synthetic password two";
      tab.pim("mhfe-decrypt-2", typed);
      await tab.press();
      expect(tab.decrypted).toEqual([]);
      expect(tab.status().textContent).toBe(message);
    });

  it("recovers with every PIM as typed once each is usable", async () => {
    const tab = setup();
    tab.pim("mhfe-decrypt", "3");
    tab.element("#mhfe-decrypt-add-password").click();
    tab.element("#mhfe-decrypt-2-password").value = "synthetic password two";
    tab.pim("mhfe-decrypt-2", "2");
    await tab.press();
    expect(tab.decrypted).toHaveLength(1);
    expect(tab.decrypted[0]).toMatchObject({ pim: 3, password: "synthetic password one" });
    expect(tab.status().textContent).toBe("Recovering the seed phrase of password 1.");
  });
});

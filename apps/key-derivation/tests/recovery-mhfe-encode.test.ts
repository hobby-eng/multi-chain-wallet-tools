import { afterEach, describe, expect, it, vi } from "vitest";

// The test replaces the engine's client and password review, so the package's WebAssembly is
// never compiled; the import only needs a value.
vi.mock("@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm", () => ({ default: new Uint8Array() }));

import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
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
  new MhfeEncodeTab(
    { jobs: gate, writeClipboard: async () => undefined, readMnemonic: () => PHRASE } as never,
    engine,
  );
  element("#mhfe-encrypt-password").value = "synthetic password";
  element("#mhfe-encrypt-password-confirm").value = "synthetic password";
  return { element, requests, engine, gate };
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

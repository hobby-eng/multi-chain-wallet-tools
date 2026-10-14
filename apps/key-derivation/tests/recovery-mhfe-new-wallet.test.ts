import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm", () => ({ default: new Uint8Array() }));
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import { MhfeEngine } from "../src/ui/recovery-mhfe-engine.js";
import { MhfeNewWalletTab } from "../src/ui/recovery-mhfe-new-wallet.js";
import { installPage, settle, withPackageValues } from "./fake-mhfe-page.js";

const SEALED = {
  container: "synthetic container",
  containerFingerprint: "00000000",
  suiteId: "SYNTHETIC",
  otherLengths: [],
  repairWords: null,
  repairProfile: null,
  keep: [{ item: "containerWords", words: 24 }, { item: "password" }],
};

function setup() {
  const element = installPage();
  const gate = new RecoveryJobGate();
  gate.setReady(true);
  const engine = new MhfeEngine();
  withPackageValues(engine);
  engine.passwords = (async () => ({
    review: async () => ({
      reading: "notThisShape",
      correction: null,
      repairs: [],
      offersCorrection: false,
    }),
    strength: async () => ({ weak: false }),
  })) as never;
  engine.wallet = (async () => ({
    describeDraw: async () => ({ expectedDraws: 1 }),
    drawPhrase: async () => ({
      phrase: "synthetic public phrase",
      words: 24,
      fingerprintWithPassphrase: "00000000",
      walletCheck: false,
      workers: 1,
    }),
  })) as never;
  const encrypt = vi.fn(async () => SEALED);
  engine.client = (async () => ({ encrypt })) as never;
  new MhfeNewWalletTab(
    {
      jobs: gate,
      writeClipboard: async () => undefined,
      useMnemonicInDeriver: () => undefined,
      mnemonicToSeed: () => new Uint8Array(64),
    } as never,
    engine,
  );
  element("#mhfe-new-password").value = "synthetic password";
  element("#mhfe-new-password-confirm").value = "synthetic password";
  return { element, gate, engine, encrypt };
}

describe("New wallet result lifetime", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("seals an unchanged generated phrase", async () => {
    const tab = setup();
    tab.element("#mhfe-new").click();
    await settle();
    expect(tab.encrypt).toHaveBeenCalledTimes(1);
    expect(tab.element("#mhfe-new-status").textContent).toContain("New wallet encrypted");
    expect(tab.element("#mhfe-new-result").childElementCount).toBeGreaterThan(0);
    expect(tab.gate.runningJob).toBeNull();
  });

  for (const event of ["input", "change"])
    it(`drops a pending draw after a ${event} edit of its wishes (AUD-026-SEC001)`, async () => {
      const tab = setup();
      let release!: (value: unknown) => void;
      const draw = new Promise((done) => {
        release = done;
      });
      const drawPhrase = vi.fn(() => draw);
      tab.engine.wallet = (async () => ({
        describeDraw: async () => ({ expectedDraws: 1 }),
        drawPhrase,
      })) as never;
      tab.element("#mhfe-new").click();
      await settle();
      expect(drawPhrase).toHaveBeenCalledOnce();
      // Text wishes emit input; word-position selectors and checkboxes emit change at the panel.
      tab.element("#mhfe-new-panel").dispatchEvent(new Event(event));
      release({ phrase: "synthetic public phrase", words: 24, walletCheck: false, workers: 1 });
      await settle();
      expect(tab.encrypt).not.toHaveBeenCalled();
      expect(tab.element("#mhfe-new-phrase").childElementCount).toBe(0);
      expect(tab.element("#mhfe-new-result").childElementCount).toBe(0);
      expect(tab.gate.runningJob).toBeNull();
    });

  for (const clear of [false, true])
    it(`drops a late sealed result after ${clear ? "Clear all" : "Cancel"}`, async () => {
      const tab = setup();
      const parameters = tab.engine.coreParameters.bind(tab.engine);
      let resolve!: (value: Awaited<ReturnType<typeof parameters>>) => void;
      const late = new Promise<Awaited<ReturnType<typeof parameters>>>((done) => {
        resolve = done;
      });
      let calls = 0;
      tab.engine.coreParameters = () => (++calls === 1 ? parameters() : late);
      tab.element("#mhfe-new").click();
      await settle();
      expect(tab.encrypt).toHaveBeenCalledTimes(1);
      expect(calls).toBe(2);
      if (clear) tab.element("#clear-all").click();
      else tab.element("#mhfe-new-stop").onclick!();
      resolve(await parameters());
      await settle();
      expect(tab.element("#mhfe-new-result").childElementCount).toBe(0);
      expect(tab.element("#mhfe-new-status").textContent).not.toContain("New wallet encrypted");
      if (clear) expect(tab.element("#mhfe-new-phrase").childElementCount).toBe(0);
      expect(tab.gate.runningJob).toBeNull();
    });
});

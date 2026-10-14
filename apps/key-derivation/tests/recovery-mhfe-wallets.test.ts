import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm", () => ({ default: new Uint8Array() }));
import { MhfeError } from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import { MhfeEngine } from "../src/ui/recovery-mhfe-engine.js";
import { MhfeWalletsTab } from "../src/ui/recovery-mhfe-wallets.js";
import { installPage, settle, withPackageValues } from "./fake-mhfe-page.js";

function setup(
  openError = new MhfeError("INVALID_CONTAINER", "Synthetic fatal refusal"),
  closeFails = false,
) {
  const element = installPage();
  const engine = new MhfeEngine();
  const gate = new RecoveryJobGate();
  gate.setReady(true);
  withPackageValues(engine);
  const cancel = vi.fn();
  engine.cancelCore = cancel;
  const close = vi.fn(async () => {
    if (closeFails) throw new Error("synthetic close failure");
  });
  const open = vi.fn(async () => {
    throw openError;
  });
  const openHiddenWallets = vi.fn(async () => ({ open, close }));
  engine.client = (async () => ({
    readContainer: async (container: string) => ({ container }),
    openHiddenWallets,
  })) as never;
  engine.repair = (async () => ({
    inspectContainer: async () => ({ reading: "container", wordCount: 24, unreadable: [] }),
  })) as never;
  engine.passwords = (async () => ({
    review: async () => ({
      reading: "notThisShape",
      correction: null,
      repairs: [],
      offersCorrection: false,
    }),
    strength: async () => ({ weak: false }),
  })) as never;
  new MhfeWalletsTab({ jobs: gate, writeClipboard: async () => undefined } as never, engine);
  element("#mhfe-wallets-container").value = "synthetic container";
  return { element, engine, gate, cancel, close, open, openHiddenWallets };
}

describe("hidden-wallet sessions close independently of late metadata", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads refusal policy before reserving a session", async () => {
    const tab = setup();
    tab.engine.coreParameters = async () => {
      throw new Error("synthetic metadata failure");
    };
    tab.element("#mhfe-wallets-start").click();
    await settle();
    expect(tab.openHiddenWallets).not.toHaveBeenCalled();
    expect(tab.gate.runningJob).toBeNull();
  });

  for (const closeFails of [false, true])
    it(`discards a fatally refused session even when close fails: ${closeFails}`, async () => {
      const tab = setup(undefined, closeFails);
      tab.element("#mhfe-wallets-start").click();
      await settle();
      expect(tab.gate.runningJob).not.toBeNull();
      // Later metadata is unavailable: classification must use the admitted session policy.
      tab.engine.coreParameters = async () => {
        throw new Error("late metadata failure");
      };
      tab.engine.progress = (async () => ({
        line: () => "synthetic progress",
        elapsed: () => "0 s",
      })) as never;
      tab.element("#mhfe-wallets-password").value = "synthetic password";
      tab.element("#mhfe-wallets-password-confirm").value = "synthetic password";
      tab.element("#mhfe-wallets-open").click();
      await settle();
      expect(tab.open).toHaveBeenCalledTimes(1);
      expect(tab.close).toHaveBeenCalledTimes(1);
      expect(tab.cancel).toHaveBeenCalled();
      expect(tab.gate.runningJob).toBeNull();
      expect(tab.element("#mhfe-wallets-session").hidden).toBe(true);
    });

  it("Clear all ends an idle session and releases the heavy-job gate", async () => {
    const tab = setup();
    tab.element("#mhfe-wallets-start").click();
    await settle();
    expect(tab.gate.runningJob).not.toBeNull();
    tab.element("#mhfe-wallets-status").textContent = "Opened in 0 s.";
    tab.element("#clear-all").click();
    await settle();
    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(tab.cancel).toHaveBeenCalled();
    expect(tab.gate.runningJob).toBeNull();
    expect(tab.element("#mhfe-wallets-session").hidden).toBe(true);
    expect(tab.element("#mhfe-wallets-status").textContent).toBe("");
  });
});

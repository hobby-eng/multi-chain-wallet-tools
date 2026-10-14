import { afterEach, describe, expect, it, vi } from "vitest";

// Only the real page's asynchronous publication is exercised. No WASM, KDF or real secrets run.
vi.mock("@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm", () => ({ default: new Uint8Array() }));

import { RecoveryJobGate } from "../../../apps/key-derivation/src/ui/recovery-job-gate.js";
import { MhfeCheckTab } from "../../../apps/key-derivation/src/ui/recovery-mhfe-check.js";
import { MhfeRekeyTab } from "../../../apps/key-derivation/src/ui/recovery-mhfe-rekey.js";
import { MhfeEngine } from "../../../apps/key-derivation/src/ui/recovery-mhfe-engine.js";
import {
  installPage,
  settle,
  withPackageValues,
} from "../../../apps/key-derivation/tests/fake-mhfe-page.js";

class Deferred<T> {
  readonly promise: Promise<T>;
  resolve!: (value: T) => void;

  constructor() {
    this.promise = new Promise<T>((resolve) => (this.resolve = resolve));
  }
}

/** A synthetic package behind the real tabs; all changes go through the page's event listeners. */
class PageFixture {
  readonly engine = new MhfeEngine();
  readonly gate = new RecoveryJobGate();
  readonly element: ReturnType<typeof installPage>;
  readonly context: ConstructorParameters<typeof MhfeCheckTab>[0];

  constructor(tab: "check" | "rekey") {
    const kinds = tab === "check" ? ["fingerprint"] : ["address", "fingerprint", "owner"];
    this.element = installPage({
      [`mhfe-${tab}-reference`]: kinds.map((kind) => [`mhfe-${tab}-ref-${kind}`, kind]),
    });
    this.gate.setReady(true);
    this.context = { jobs: this.gate, writeClipboard: async () => undefined } as never;
    withPackageValues(this.engine);
    this.engine.repair = (async () => ({
      inspectContainer: async () => ({ reading: "container", wordCount: 12, unreadable: [] }),
    })) as never;
    this.engine.passwords = (async () => ({
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
    // Cancellation is latched by the real MhfeRun even after the synthetic worker has returned.
    this.engine.cancelCore = () => undefined;
  }

  fill(prefix: string, fields: Record<string, string>): void {
    for (const [suffix, value] of Object.entries(fields))
      this.element(`#mhfe-${prefix}-${suffix}`).value = value;
  }
}

describe("AUD-027: metadata waits must preserve the task's publication guard", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not publish a Check match after an edit during the final parameters request", async () => {
    const page = new PageFixture("check");
    const parameters = await page.engine.walletParameters();
    const late = new Deferred<typeof parameters>();
    const asked = vi.fn(() => late.promise);
    page.engine.walletParameters = asked;
    page.engine.client = (async () => ({
      readContainer: async (container: string) => ({
        container,
        suiteId: "SYNTHETIC",
        containerFingerprint: "00000000",
        builtInCheckLengths: [],
        offersWalletCheck: false,
      }),
      check: async () => ({
        matches: true,
        path: null,
        evidence: { builtInCheck: null, walletCheck: null },
      }),
    })) as never;
    new MhfeCheckTab(page.context, page.engine);
    page.fill("check", {
      words: "12",
      container: "synthetic container a",
      password: "synthetic password",
      fingerprint: "00000000",
    });
    page.element("#mhfe-check-ref-fingerprint").checked = true;
    page.element("#mhfe-check").click();
    await settle();
    expect(asked).toHaveBeenCalledOnce();
    expect(page.gate.runningJob).not.toBeNull();
    page.element("#mhfe-check-fingerprint").value = "11111111";
    page.element("#mhfe-check-panel").dispatchEvent(new Event("input"));
    late.resolve(parameters);
    await settle();
    expect(page.gate.runningJob).toBeNull();
    expect(page.element("#mhfe-check-result").text).not.toContain("Matches");
  });

  it("does not publish password-change success after Cancel during final card metadata", async () => {
    const page = new PageFixture("rekey");
    const parameters = await page.engine.coreParameters();
    const late = new Deferred<typeof parameters>();
    let requests = 0;
    page.engine.coreParameters = () =>
      ++requests === 1 ? Promise.resolve(parameters) : late.promise;
    page.engine.client = (async () => ({
      readContainer: async (container: string) => ({
        container,
        suiteId: "SYNTHETIC",
        containerFingerprint: "00000000",
        builtInCheckLengths: [12],
        phraseLengths: [12],
        confirmationFor: { 12: "builtInCheck" },
      }),
      rekey: async () => ({
        container: "synthetic new container",
        containerFingerprint: "00000000",
        suiteId: "MHFE-BIP39-EXPERIMENTAL-1",
        otherLengths: [],
        repairWords: null,
        repairProfile: null,
        keep: [{ item: "containerWords", words: 12 }, { item: "password" }],
      }),
    })) as never;
    new MhfeRekeyTab(page.context, page.engine);
    page.fill("rekey", {
      words: "12",
      container: "synthetic old container",
      password: "synthetic old password",
      "new-password": "synthetic new password",
      "new-password-confirm": "synthetic new password",
    });
    page.element("#mhfe-rekey-wallet-passphrase-no").checked = true;
    page.element("#mhfe-rekey").click();
    await settle();
    expect(requests).toBe(2);
    const cancel = page.element("#mhfe-rekey-stop");
    expect(cancel.hidden).toBe(false);
    expect(page.gate.runningJob).not.toBeNull();
    cancel.onclick!();
    late.resolve(parameters);
    await settle();
    expect(page.gate.runningJob).toBeNull();
    expect(page.element("#mhfe-rekey-status").textContent).not.toContain("Password changed");
    expect(page.element("#mhfe-rekey-result").text).not.toContain("Checked:");
  });
});

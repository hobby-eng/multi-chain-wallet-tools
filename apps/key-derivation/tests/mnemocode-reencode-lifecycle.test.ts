// Real confirmation controller and core, with a passive worker and public phrase only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MnemoCodeReEncodeTab } from "../src/ui/recovery-mnemocode-reencode.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import type { RecoveryFeatureContext } from "../src/ui/recovery-workspace-shared.js";
import type { RecoverySourceReference } from "../src/ui/recovery-source-link.js";
import { RecoveryTestPage, edit, settlePromises } from "./fake-recovery-page.js";
import { FINGERPRINT_WARNING } from "../../../packages/recovery-mnemocode/source/core/wallet-check.js";

const PUBLIC_PHRASE = `${"abandon ".repeat(11)}about`;
const PREFIX = "mnemocode-reencode";
const pending = vi.hoisted(() => ({
  runs: [] as {
    request: unknown;
    resolve(value: unknown): void;
    reject(cause: Error): void;
    terminated: boolean;
  }[],
}));
vi.mock("@ckd/recovery-backup/fingerprint.js", () => ({
  fingerprintWithoutPassphrase: () => "73c5da0a",
}));
vi.mock("@ckd/ui/qr-image-import.js", () => ({ installQrImageImport: () => undefined }));
vi.mock("@ckd/ui/text-file-import.js", () => ({ installTextFileImport: () => undefined }));
vi.mock("../src/ui/recovery-mnemocode-word-hints.js", () => ({
  attachMnemoCodeWordHints: () => undefined,
}));
vi.mock("@ckd/recovery-backup/mnemocode-wallet-bitcoin.js", () => ({
  MnemoCodeWalletRecognition: class {
    static readonly COINS = [];
    static readonly PROFILES = [];
    static assertEvidence(): void {}
  },
}));
vi.mock("../src/workers/mnemocode-worker-client.js", () => ({
  MnemoCodeWorker: class {
    #run: (typeof pending.runs)[number] | undefined;
    run(request: unknown): Promise<unknown> {
      return new Promise((resolve, reject) => {
        this.#run = { request, resolve, reject, terminated: false };
        pending.runs.push(this.#run);
      });
    }
    terminate(): void {
      if (this.#run !== undefined && !this.#run.terminated) {
        this.#run.terminated = true;
        this.#run.reject(new Error("Stopped. The worker and its memory were discarded."));
      }
    }
  },
}));

describe("MnemoCode Re-encode result ownership", () => {
  let page: RecoveryTestPage;
  let links: RecoverySourceReference[];
  let jobs: RecoveryJobGate;

  beforeEach(() => {
    pending.runs.length = 0;
    links = [];
    page = new RecoveryTestPage();
    vi.stubGlobal("__MNEMOCODE_SEARCH_WORKER_SOURCE__", "public-test-worker");
    const panel = page.add(`${PREFIX}-panel`);
    const inputs = page.add(`${PREFIX}-inputs`, "div", panel);
    const confirmation = page.add(`${PREFIX}-confirmation`, "div", panel);
    const wallet = page.add(`${PREFIX}-wallet-inputs`, "div", confirmation);
    for (const [id, tag] of [
      ["input", "textarea"],
      ["mode", "select"],
      ["format", "select"],
      ["words", "select"],
      ["last-word", "input"],
      ["dates", "textarea"],
    ])
      page.add(`${PREFIX}-${id}`, tag!, inputs);
    page.add(`${PREFIX}-dates-field`, "div", inputs);
    for (const id of ["input", "last-word"]) page.add(`toggle-${PREFIX}-${id}`, "button", inputs);
    for (const kind of ["mode", "format"]) {
      const help = page.add(`${PREFIX}-${kind}-help`, "details", inputs);
      const popover = page.add(`${PREFIX}-${kind}-popover`, "div", help);
      popover.className = "recovery-help-popover";
    }
    for (const id of ["result", "status"]) page.add(`${PREFIX}-${id}`, "div", panel);
    for (const id of ["read", "wallet-check", "cancel", "continue"])
      page.add(`${PREFIX}-${id}`, "button", panel);
    page.add(`${PREFIX}-person`, "input", confirmation).type = "checkbox";
    for (const choice of ["fingerprint", "none"]) {
      const label = page.add(`${PREFIX}-${choice}-label`, "label", wallet);
      const input = page.add(
        `${PREFIX}-wallet-${choice === "none" ? "none" : "fingerprint-choice"}`,
        "input",
        label,
      );
      input.type = "radio";
      input.name = `${PREFIX}-wallet`;
      input.value = choice;
    }
    for (const id of ["fingerprint", "passphrase"]) {
      page.add(`${PREFIX}-wallet-${id}-field`, "div", wallet);
      page.add(`${PREFIX}-wallet-${id}`, "input", wallet);
    }
    page.add(`toggle-${PREFIX}-wallet-passphrase`, "button", wallet);
    page.add("clear-all", "button");
    page.require(`${PREFIX}-input`).value = "2027 10 24 2027 10 24 2027 10 24 2027 10 377";
    page.require(`${PREFIX}-mode`).value = "seedshift";
    page.require(`${PREFIX}-format`).value = "indexes";
    page.require(`${PREFIX}-dates`).value = "23-09-2026";
    page.require(`${PREFIX}-wallet-fingerprint`).value = "73c5da0a";
    jobs = new RecoveryJobGate();
    jobs.setReady(true);
    const context = {
      jobs,
      mnemonicToSeed: () => {
        throw new Error("The controller fixture must not derive a seed.");
      },
      writeClipboard: async () => {
        throw new Error("No fixture copies are permitted.");
      },
      useRecoverySource: (reference: RecoverySourceReference) => links.push(reference),
    } as unknown as RecoveryFeatureContext;
    new MnemoCodeReEncodeTab(context);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function read(): void {
    page.require(`${PREFIX}-read`).click();
  }
  function recognise(): void {
    const checkbox = page.require(`${PREFIX}-person`);
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  }
  async function walletCheck(): Promise<void> {
    const choice = page.require(`${PREFIX}-wallet-fingerprint-choice`);
    choice.checked = true;
    choice.dispatchEvent(new Event("change", { bubbles: true }));
    page.require(`${PREFIX}-wallet-check`).click();
    await settlePromises();
  }

  it("requires confirmation before the shared Encode handoff", () => {
    read();
    expect(page.require(`${PREFIX}-continue`).disabled).toBe(true);
    page.require(`${PREFIX}-continue`).dispatchEvent(new Event("click"));
    expect(links).toHaveLength(0);
    recognise();
    page.require(`${PREFIX}-continue`).click();
    expect(links).toHaveLength(1);
    expect(links[0]!.read()?.mnemonic).toBe(PUBLIC_PHRASE);
  });

  it.each(["input", "dates", "mode", "format", "words", "last-word"])(
    "revokes a linked confirmation when old %s changes",
    (field) => {
      read();
      recognise();
      page.require(`${PREFIX}-continue`).click();
      expect(links[0]!.read()?.mnemonic).toBe(PUBLIC_PHRASE);
      edit(page.require(`${PREFIX}-${field}`), "changed");
      expect(links[0]!.read()).toBeNull();
      expect(page.require(`${PREFIX}-confirmation`).hidden).toBe(true);
    },
  );

  it("preserves the captured wallet passphrase and shows fingerprint warning before continuation", async () => {
    read();
    edit(page.require(`${PREFIX}-wallet-passphrase`), "TREZOR");
    await walletCheck();
    expect(pending.runs).toHaveLength(1);
    expect(pending.runs[0]!.request).toMatchObject({
      type: "reencoding-wallet",
      mnemonic: PUBLIC_PHRASE,
      wallet: { passphrase: "TREZOR" },
    });
    pending.runs[0]!.resolve({ matched: true, warning: FINGERPRINT_WARNING, path: "m" });
    await settlePromises();
    expect(page.require(`${PREFIX}-status`).textContent).toContain(FINGERPRINT_WARNING);
    expect(links).toHaveLength(0);
    page.require(`${PREFIX}-continue`).click();
    expect(links[0]!.read()).toEqual({ mnemonic: PUBLIC_PHRASE, passphrase: "TREZOR" });
    edit(page.require(`${PREFIX}-wallet-passphrase`), "another factor");
    expect(links[0]!.read()).toBeNull();
  });

  it("never accepts an unmatched wallet", async () => {
    read();
    await walletCheck();
    pending.runs[0]!.resolve({ matched: false });
    await settlePromises();
    expect(page.require(`${PREFIX}-continue`).disabled).toBe(true);
    page.require(`${PREFIX}-continue`).dispatchEvent(new Event("click"));
    expect(links).toHaveLength(0);
  });

  it("revokes confirmed output and refuses new operations after a self-test failure", async () => {
    read();
    recognise();
    page.require(`${PREFIX}-continue`).click();
    expect(links[0]!.read()?.mnemonic).toBe(PUBLIC_PHRASE);
    jobs.setReady(false);
    expect(links[0]!.read()).toBeNull();
    expect(page.require(`${PREFIX}-continue`).disabled).toBe(true);
    read();
    recognise();
    page.require(`${PREFIX}-continue`).dispatchEvent(new Event("click"));
    page.require(`${PREFIX}-wallet-check`).dispatchEvent(new Event("click"));
    await settlePromises();
    expect(links).toHaveLength(1);
    expect(pending.runs).toHaveLength(0);
  });

  it("drops an old worker reply after a source edit", async () => {
    read();
    await walletCheck();
    const run = pending.runs[0]!;
    edit(page.require(`${PREFIX}-dates`), "24-09-2026");
    run.resolve({ matched: true });
    await settlePromises();
    expect(run.terminated).toBe(true);
    expect(links).toHaveLength(0);
    expect(page.require(`${PREFIX}-confirmation`).hidden).toBe(true);
  });

  it("cancels the comparison without authorizing a handoff", async () => {
    read();
    await walletCheck();
    page.require(`${PREFIX}-cancel`).click();
    await settlePromises();
    expect(pending.runs[0]!.terminated).toBe(true);
    expect(page.require(`${PREFIX}-continue`).disabled).toBe(true);
    expect(links).toHaveLength(0);
  });

  it.each(["clear-all", "pagehide"])("revokes confirmed output on %s", (action) => {
    read();
    recognise();
    page.require(`${PREFIX}-continue`).click();
    if (action === "clear-all") page.require("clear-all").click();
    else page.window.dispatchEvent(new Event("pagehide"));
    expect(links[0]!.read()).toBeNull();
  });
});

// Real UI, worker entry, searches and wire protocol. The browser Worker/DOM transport is local.
import { afterEach, expect, it, vi } from "vitest";
import { createCoinRegistry } from "@ckd/coins/registry-base.js";
import { loadMnemoCode } from "@ckd/recovery-backup/mnemocode-module.js";
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  MnemoCodeMissingCodes,
  type MissingCodesFound,
} from "../src/ui/recovery-mnemocode-missing-codes.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import type { RecoveryFeatureContext } from "../src/ui/recovery-workspace-shared.js";
import type { MnemoCodeSearchRequest } from "../src/workers/mnemocode-search-worker.js";
import { RecoveryTestPage, settlePromises } from "./fake-recovery-page.js";

type Handler = (event: MessageEvent<MnemoCodeSearchRequest>) => Promise<void>;
const port: { onmessage?: Handler } = {};

/** A native transport stand-in; it invokes the actual imported worker message handler. */
class LocalWorker {
  static latest: LocalWorker | undefined;
  onmessage: ((event: MessageEvent<unknown>) => void) | undefined;
  onerror: ((event: Event) => void) | undefined;
  work = Promise.resolve();
  ended = false;
  readonly messages: unknown[] = [];

  constructor() {
    LocalWorker.latest = this;
    queueMicrotask(() => this.reply({ type: "ready" }));
  }
  postMessage(request: MnemoCodeSearchRequest): void {
    if (port.onmessage === undefined) throw new Error("The real worker entry was not loaded.");
    this.work = port.onmessage(new MessageEvent("message", { data: structuredClone(request) }));
  }
  reply(data: unknown): void {
    if (!this.ended) {
      this.messages.push(structuredClone(data));
      this.onmessage?.(new MessageEvent("message", { data: structuredClone(data) }));
    }
  }
  terminate(): void {
    this.ended = true;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function view() {
  const page = new RecoveryTestPage();
  const prefix = "mnemocode-decode";
  const block = page.add(`${prefix}-missing`);
  for (const suffix of [
    "missing-summary",
    "missing-way-list",
    "encoded-fingerprint-field",
    "missing-wallet",
    "missing-dates-note",
    "missing-status",
    "search-settings",
  ])
    page.add(`${prefix}-${suffix}`, "div", block);
  for (const suffix of ["missing-search", "missing-stop"])
    page.add(`${prefix}-${suffix}`, "button", block);
  page.add(`${prefix}-encoded-fingerprint`, "input", block);
  page.add(`${prefix}-wallet-passphrase`, "textarea", block);
  page.add(`${prefix}-wallet-none`, "input", block);
  page.add(`toggle-${prefix}-wallet-passphrase`, "button", block);
  const jobs = new RecoveryJobGate();
  jobs.setReady(true);
  const context: RecoveryFeatureContext = {
    jobs,
    registry: createCoinRegistry([]),
    detectTargets: () => [],
    linkedValue: () => null,
    linkedSourceRevealed: () => false,
    mnemonicToSeed: () => {
      throw new Error("This UI does not derive a seed.");
    },
    readMnemonic: () => {
      throw new Error("This UI does not read a phrase.");
    },
    writeClipboard: async () => undefined,
    downloadText: () => undefined,
    useMnemonicInDeriver: () => undefined,
  };
  const found = vi.fn<(result: MissingCodesFound) => void>();
  const feature = new MnemoCodeMissingCodes(
    context,
    () => "",
    found,
    () => () => true,
  );
  return { page, feature, found, jobs };
}

it("refuses actual list overflow through the real worker and UI, and retains complete small lists", async () => {
  await loadMnemoCode();
  vi.stubGlobal("self", port);
  vi.stubGlobal("Worker", LocalWorker);
  vi.stubGlobal("postMessage", (message: unknown) => LocalWorker.latest?.reply(message));
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:public-list-worker");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  await import("../src/workers/mnemocode-search-worker.js");
  const prefix = "abandon ".repeat(11);
  const endings = wordlist.filter((word) => validateMnemonic(prefix + word, wordlist));
  expect(endings).toHaveLength(128);
  for (const count of [128, 17, 16]) {
    const { page, feature, found, jobs } = view();
    expect(feature.offer(prefix + endings.slice(0, count).join("|"), "english", "direct")).toBe(
      true,
    );
    const list = page
      .require("mnemocode-decode-missing-way-list")
      .querySelectorAll("input")
      .find((radio) => radio.value === "list");
    if (list === undefined) throw new Error("The real UI did not offer its bounded list.");
    list.checked = true;
    list.dispatchEvent(new Event("change", { bubbles: true }));
    page.require("mnemocode-decode-missing-search").click();
    const worker = LocalWorker.latest;
    if (worker === undefined) throw new Error("The UI did not start a worker.");
    await worker.work;
    await settlePromises();
    expect(worker.ended).toBe(true);
    expect(jobs.runningJob).toBeNull();
    if (count > 16) {
      expect(worker.messages.at(-1)).toMatchObject({
        type: "error",
        code: "core.missing-codes-search.list-overflow",
      });
      expect(found).not.toHaveBeenCalled();
      expect(page.require("mnemocode-decode-missing-status").textContent).toMatch(/list|16/u);
      expect(page.require("mnemocode-decode-missing-status").classList.contains("warning")).toBe(
        true,
      );
    } else {
      expect(found).toHaveBeenCalledOnce();
      const result = found.mock.calls[0]?.[0];
      expect(result?.kind).toBe("list");
      expect(result?.kind === "list" ? result.rows : undefined).toHaveLength(count);
    }
    feature.hide();
  }
  expect(revoke).toHaveBeenCalledTimes(3);
});

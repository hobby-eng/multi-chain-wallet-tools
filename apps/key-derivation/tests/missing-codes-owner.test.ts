// Actual admission, page controllers and worker client; only native transport is passive.
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { loadMnemoCode } from "@ckd/recovery-backup/mnemocode-module.js";
import { MnemoCodeMissingCodes } from "../src/ui/recovery-mnemocode-missing-codes.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import type { RecoveryFeatureContext } from "../src/ui/recovery-workspace-shared.js";
import { PassiveQrPage } from "../../../test/support/qr-page.js";
import { FakeRecoveryWorker } from "./fake-recovery-worker.js";
import { settlePromises } from "./fake-recovery-page.js";
import * as registry from "@ckd/coins/registry.js";

const MARKED = `${"abandon ".repeat(11)}?`;
const PREFIX = "mnemocode-decode";

beforeAll(async () => {
  await loadMnemoCode();
});

function mount() {
  const page = new PassiveQrPage();
  vi.stubGlobal("document", page.asDocument());
  vi.stubGlobal("window", page.window);
  vi.stubGlobal("__MNEMOCODE_SEARCH_WORKER_SOURCE__", "Public passive MnemoCode source");
  const workers: FakeRecoveryWorker[] = [];
  vi.stubGlobal(
    "Worker",
    class extends FakeRecoveryWorker {
      constructor() {
        super();
        workers.push(this);
      }
    },
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:public-missing-codes");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const block = page.add(`${PREFIX}-missing`);
  for (const suffix of [
    "search-settings",
    "missing-summary",
    "missing-way-list",
    "encoded-fingerprint-field",
    "missing-wallet",
    "missing-dates-note",
    "missing-status",
    "wallet-fingerprint-field",
    "wallet-passphrase-field",
  ])
    page.add(`${PREFIX}-${suffix}`, "div", block);
  for (const suffix of ["missing-search", "missing-stop"])
    page.add(`${PREFIX}-${suffix}`, "button", block);
  for (const suffix of ["encoded-fingerprint", "wallet-fingerprint", "wallet-passphrase"])
    page.add(`${PREFIX}-${suffix}`, "input", block);
  page.add(`toggle-${PREFIX}-wallet-passphrase`, "button", block);
  page.add("clear-all", "button");
  for (const value of ["fingerprint", "none"]) {
    const row = page.createElement("label");
    const radio = page.add(
      `${PREFIX}-wallet-${value === "none" ? "none" : "fingerprint-choice"}`,
      "input",
      row,
    );
    radio.type = "radio";
    radio.name = `${PREFIX}-wallet`;
    radio.value = value;
    radio.checked = value === "fingerprint";
    block.append(row);
  }
  page.require(`${PREFIX}-wallet-fingerprint`).value = "01020304";
  page.require(`${PREFIX}-wallet-passphrase`).value = "TREZOR";
  Object.assign(page.require(`${PREFIX}-wallet-passphrase`), { setCustomValidity: vi.fn() });
  const jobs = new RecoveryJobGate();
  jobs.setReady(true);
  const context: RecoveryFeatureContext = {
    registry,
    detectTargets: () => [],
    mnemonicToSeed: () => {
      throw new Error("Admission must not derive a seed.");
    },
    writeClipboard: async () => undefined,
    downloadText: () => undefined,
    useMnemonicInDeriver: () => undefined,
    readMnemonic: () => "",
    linkedValue: () => null,
    linkedSourceRevealed: () => false,
    jobs,
  };
  const codes = new MnemoCodeMissingCodes(
    context,
    () => "",
    vi.fn(),
    () => () => true,
  );
  expect(codes.offer(MARKED, "english", "direct")).toBe(true);
  const choose = (value: string): void => {
    const radios = page.require(`${PREFIX}-missing-way-list`).querySelectorAll("input");
    for (const radio of radios) radio.checked = radio.value === value;
  };
  const search = async (): Promise<number> => {
    page.require(`${PREFIX}-missing-search`).click();
    await settlePromises();
    const posted = workers.reduce((sum, worker) => sum + worker.postMessage.mock.calls.length, 0);
    for (const worker of workers)
      worker.reply({ type: "result", outcome: { kind: "none", message: "Synthetic no result" } });
    await settlePromises();
    return posted;
  };
  return { page, codes, choose, search, workers, jobs };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("revokes a previously offered search before later marked-code admission refuses", async () => {
  const view = mount();
  expect(() => view.codes.offer(Array<string>(12).fill("?").join(" "), "auto", "direct")).toThrow();
  view.choose("wallet");
  expect(await view.search()).toBe(0);
});

it("rejects a forged radio value using the offered library ways before posting a request", async () => {
  const view = mount();
  const radio = view.page.require(`${PREFIX}-missing-way-list`).querySelectorAll("input")[0];
  if (radio === undefined) throw new Error("The real admission offered no way.");
  radio.value = "synthetic-unknown-way";
  radio.checked = true;
  expect(await view.search()).toBe(0);
});

it("posts the healthy offered wallet search with exact metadata and passphrase", async () => {
  const view = mount();
  view.choose("wallet");
  expect(await view.search(), view.page.require(`${PREFIX}-missing-status`).textContent).toBe(1);
  // The worker is given the page's compiled MnemoCode with the request.
  const posted = view.workers[0]?.postMessage.mock.calls[0]?.[0];
  expect(posted?.module).toBeInstanceOf(WebAssembly.Module);
  expect(posted?.request).toMatchObject({
    type: "missing-codes",
    text: MARKED,
    format: "english",
    mode: "direct",
    way: "wallet",
    wallet: { passphrase: "TREZOR", evidence: { kind: "master-fingerprint", value: "01020304" } },
  });
});

it.each(["clear", "pagehide", "readiness"] as const)(
  "revokes an offered search on %s",
  async (event) => {
    const view = mount();
    view.choose("wallet");
    if (event === "clear") view.page.require("clear-all").click();
    else if (event === "pagehide") view.page.window.dispatchEvent(new Event("pagehide"));
    else view.jobs.setReady(false);
    expect(view.page.require(`${PREFIX}-missing`).hidden).toBe(true);
    expect(await view.search()).toBe(0);
  },
);

// Production controllers with MnemoCode's real share and marked-code reading, a synthetic decode
// and deferred transport. Public BIP39 diagnostics run as shipped; the deferred search port keeps
// heavy KDF work out.
import { afterEach, beforeAll, beforeEach, expect, vi } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { loadMnemoCode } from "@ckd/recovery-backup/mnemocode-module.js";
import { MnemoCodeDecodeTab } from "../src/ui/recovery-mnemocode-decode.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import { type RecoveryFeatureContext } from "../src/ui/recovery-workspace-shared.js";
import { edit, settlePromises, type RecoveryTestPage } from "./fake-recovery-page.js";
import { PassiveQrPage } from "@ckd/test-support/qr-page.js";

const fixture = vi.hoisted(() => ({
  phrase:
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  otherPhrase: "legal winner thank year wave sausage worth useful legal winner thank yellow",
  marked:
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon ?",
  passphrase: "TREZOR",
  fingerprint: "01020304",
  date: "01-01-2000",
  otherDate: "02-01-2000",
  entropyBytes: 16,
  seedBytes: 64,
  seedMarker: 7,
  otherSeedMarker: 8,
}));

const trace = vi.hoisted(() => ({
  decode: vi.fn(),
  encodedFingerprint: vi.fn((): string | undefined => undefined),
  features: [] as import("../src/ui/recovery-feature.js").RecoveryFeature[],
  workerRuns: [] as {
    request: Record<string, unknown>;
    resolve(outcome: unknown): void;
    terminate(): void;
  }[],
  forbiddenCrypto: vi.fn((): never => {
    throw new Error(
      "Recovery lifecycle Deriver probes forbid the page's randomness and KDF execution.",
    );
  }),
}));

vi.mock("../src/ui/recovery-feature-selection.js", () => ({
  selectedRecoveryFeatures: trace.features,
}));

vi.mock("@ckd/core/secure-random.js", () => ({
  checkSecureRandom: () => undefined,
  secureRandomBytes: trace.forbiddenCrypto,
  fillSecureRandom: trace.forbiddenCrypto,
}));
vi.mock("@ckd/recovery-backup/fingerprint.js", () => ({
  fingerprintWithoutPassphrase: () => fixture.fingerprint,
}));
vi.mock("@ckd/ui/qr-image-import.js", () => ({ installQrImageImport: () => undefined }));
vi.mock("@ckd/ui/text-file-import.js", () => ({ installTextFileImport: () => undefined }));
// The hints below a word field need a browser; recovery-mnemocode-word-hints.test.ts checks them.
vi.mock("../src/ui/recovery-mnemocode-word-hints.js", () => ({
  attachMnemoCodeWordHints: () => undefined,
}));
vi.mock("@ckd/recovery-backup/mnemocode.js", async (importOriginal) => ({
  // MnemoCode's own reading and rules; only the decode and the codes' fingerprint are traced.
  ...(await importOriginal<typeof import("@ckd/recovery-backup/mnemocode.js")>()),
  decodeMnemoCode: trace.decode,
  mnemoCodeEncodedFingerprint: trace.encodedFingerprint,
}));
vi.mock("../src/workers/mnemocode-worker-client.js", () => ({
  JOB_STOPPED: "Stopped. The worker and its memory were discarded.",
  MnemoCodeWorker: class {
    #reject: ((cause: Error) => void) | undefined;
    run(request: Record<string, unknown>): Promise<unknown> {
      return new Promise((resolve, reject) => {
        this.#reject = reject;
        trace.workerRuns.push({
          request,
          resolve: (outcome) => {
            this.#reject = undefined;
            resolve(outcome);
          },
          terminate: () => this.terminate(),
        });
      });
    }
    terminate(): void {
      this.#reject?.(new Error("Stopped. The worker and its memory were discarded."));
      this.#reject = undefined;
    }
  },
}));

export function recoveryContext() {
  const useMnemonicInDeriver = vi.fn<(phrase: string, passphrase?: string) => void>();
  const jobs = new RecoveryJobGate();
  jobs.setReady(true);
  const context = {
    registry: {},
    detectTargets: () => [],
    mnemonicToSeed,
    writeClipboard: vi.fn(async () => undefined),
    downloadText: vi.fn(),
    useMnemonicInDeriver,
    readMnemonic: () => fixture.phrase,
    linkedValue: () => null,
    linkedSourceRevealed: () => false,
    jobs,
  } as unknown as RecoveryFeatureContext;
  return { context, useMnemonicInDeriver };
}

export function decodeHarness(mode: "direct" | "seedshift" = "direct", install = true) {
  const page = new PassiveQrPage();
  const panel = page.add("mnemocode-decode-panel");
  panel.className = "backup-operation";
  for (const id of ["mnemocode-input", "mnemocode-decode-dates"]) page.add(id, "textarea", panel);
  for (const id of ["mnemocode-decode-mode", "mnemocode-decode-format", "mnemocode-decode-words"])
    page.add(id, "select", panel);
  for (const id of [
    "mnemocode-decode-record-note",
    "mnemocode-decode-codes-note",
    "mnemocode-decode-dates-field",
    "mnemocode-decode-result",
    "mnemocode-decode-input-kind",
  ])
    page.add(id, "div", panel);
  const interpretation = page.require("mnemocode-decode-input-kind");
  interpretation.hidden = true;
  for (const value of ["share", "codes"]) {
    const radio = page.add(`mnemocode-decode-input-kind-${value}`, "input", interpretation);
    radio.type = "radio";
    radio.name = "mnemocode-decode-input-kind";
    radio.value = value;
  }
  page.add("decode-mnemocode", "button", panel).className = "primary";
  for (const id of ["mnemocode-decode-mode-help", "mnemocode-decode-format-help"]) {
    const help = page.add(id, "div", panel);
    const popover = page.createElement("div");
    popover.className = "recovery-help-popover";
    help.append(popover);
  }
  const block = page.add("mnemocode-decode-missing", "div", panel);
  block.hidden = true;
  page.add("mnemocode-decode-search-settings", "div", block);
  for (const suffix of [
    "missing-summary",
    "missing-way-list",
    "encoded-fingerprint-field",
    "missing-wallet",
    "missing-dates-note",
    "missing-status",
    "wallet-fingerprint-field",
    "wallet-passphrase-field",
  ])
    page.add(`mnemocode-decode-${suffix}`, "div", block);
  for (const suffix of ["missing-search", "missing-stop"])
    page.add(`mnemocode-decode-${suffix}`, "button", block);
  page.require("mnemocode-decode-missing-search").textContent = "Search";
  for (const suffix of ["encoded-fingerprint", "wallet-fingerprint", "wallet-passphrase"])
    page.add(`mnemocode-decode-${suffix}`, "input", block);
  page.add("toggle-mnemocode-decode-wallet-passphrase", "button", block);
  for (const value of ["fingerprint", "none"]) {
    const row = page.createElement("label");
    const suffix = value === "fingerprint" ? "fingerprint-choice" : value;
    const radio = page.add(`mnemocode-decode-wallet-${suffix}`, "input", row);
    radio.type = "radio";
    radio.name = "mnemocode-decode-wallet";
    radio.value = value;
    radio.checked = value === "fingerprint";
    block.append(row);
  }
  page.require("mnemocode-decode-wallet-fingerprint").value = fixture.fingerprint;
  page.require("mnemocode-decode-wallet-passphrase").value = fixture.passphrase;
  page.require("mnemocode-decode-mode").value = mode;
  page.require("mnemocode-decode-format").value = "english";
  page.require("mnemocode-decode-dates").value = fixture.date;
  const context = recoveryContext();
  if (install) new MnemoCodeDecodeTab(context.context);
  return { page, ...context, result: page.require("mnemocode-decode-result") };
}

export function startMissingCodeSearch(page: RecoveryTestPage, selectedWay = "wallet"): void {
  edit(page.require("mnemocode-input"), fixture.marked);
  page.require("decode-mnemocode").click();
  startOfferedCodeSearch(page, selectedWay);
}

export function startOfferedCodeSearch(page: RecoveryTestPage, selectedWay = "wallet"): void {
  const way = page
    .require("mnemocode-decode-missing-way-list")
    .querySelectorAll("input")
    .find((radio) => radio.value === selectedWay);
  expect(way, "setup: actual Decode must offer the selected way").toBeDefined();
  way!.checked = true;
  way!.dispatchEvent(new Event("change", { bubbles: true }));
  page.require("mnemocode-decode-missing-search").click();
  expect(trace.workerRuns.length).toBeGreaterThan(0);
}

export function action(result: ReturnType<RecoveryTestPage["add"]>, text: string) {
  return result.querySelectorAll("button").find((button) => button.textContent === text);
}

beforeAll(async () => {
  await loadMnemoCode();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  trace.encodedFingerprint.mockReset();
  trace.workerRuns.length = 0;
  trace.features.length = 0;
  trace.decode.mockImplementation((_text: string, options: { mode: string; format: string }) => ({
    mode: options.mode,
    format: options.format,
    checksumValid: true,
    mnemonic: fixture.phrase,
  }));
});

afterEach(async () => {
  for (const worker of trace.workerRuns) worker.terminate();
  await settlePromises();
  expect(trace.forbiddenCrypto).not.toHaveBeenCalled();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

export { fixture, trace };

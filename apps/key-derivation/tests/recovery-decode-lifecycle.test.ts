// Production controllers with real ambiguous-share admission, synthetic codec and deferred transport.
// Public BIP39 phrases and TREZOR are argument fixtures; no wallet search, KDF or WASM runs.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MnemoCodeDecodeTab } from "../src/ui/recovery-mnemocode-decode.js";
import { RecoveryDeriverHandoff } from "../src/ui/recovery-deriver-handoff.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import {
  installSecretToggle,
  installTabs,
  renderRecoveredSecret,
  type RecoveryFeatureContext,
} from "../src/ui/recovery-workspace-shared.js";
import { installRecoveryWorkspace } from "../src/ui/recovery-workspace.js";
import { PasswordField } from "../src/ui/recovery-mhfe-fields.js";
import { fullSelfTestParts } from "../src/ui/full-self-test.js";
import { RecoveryUiSelfTest } from "../src/ui/recovery-ui-self-test.js";
import { PHRASE_ONLY_NOTE } from "../src/ui/recovery-feature.js";
import { BackupReading } from "../../../packages/recovery-mnemocode/source/core/backup-reading.js";
import { sskrVector } from "../../../packages/recovery-mnemocode/source/sskr/known-answers.js";
import { MAX_SEARCH_COMBINATIONS } from "../../../packages/recovery-mnemocode/source/core/candidates.js";
import { InputRevision } from "../src/ui/recovery-input-revision.js";
import {
  renderFoundCodes,
  renderInvalidMnemonic,
  renderLegacyCandidates,
  renderMissingCodesList,
  renderMissingWordCandidates,
} from "../src/ui/recovery-mnemocode-results.js";
import { RecoveryTestPage, edit, keyDown, settlePromises } from "./fake-recovery-page.js";
import { installControllerFixture } from "./fake-deriver-controller.js";

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
  readBackup: vi.fn(),
  encodedPhrase: vi.fn((): string | undefined => undefined),
  features: [] as import("../src/ui/recovery-feature.js").RecoveryFeature[],
  workerRuns: [] as {
    request: Record<string, unknown>;
    resolve(outcome: unknown): void;
    terminate(): void;
  }[],
  forbiddenCrypto: vi.fn((): never => {
    throw new Error(
      "Recovery lifecycle Deriver probes forbid crypto, randomness, WASM and KDF execution.",
    );
  }),
}));

vi.mock("../src/ui/recovery-feature-selection.js", () => ({
  selectedRecoveryFeatures: trace.features,
}));

vi.mock("@ckd/core/bip39.js", () => ({
  assertValidMnemonic: (text: string) => text,
  diagnoseMnemonic: (text: string) => ({
    normalized: text,
    wordCount: text.trim() === "" ? 0 : text.trim().split(/\s+/u).length,
    wordCountValid: false,
    allWordsKnown: false,
    checksumValid: false,
    entropyBits: null,
    checksumBits: null,
    unknownWords: [],
    words: [],
    construction: null,
  }),
  // Only the source-offer boundary needs entropy. No checksum or hash is evaluated.
  englishMnemonicToEntropy: (text: string) => {
    if (text !== fixture.phrase && text !== fixture.otherPhrase)
      throw new Error("Recovery lifecycle synthetic source is incomplete.");
    return new Uint8Array(fixture.entropyBytes);
  },
  mnemonicToSeed: trace.forbiddenCrypto,
  generateMnemonic: trace.forbiddenCrypto,
  entropyToEnglishMnemonic: trace.forbiddenCrypto,
  masterFingerprintFromSeed: trace.forbiddenCrypto,
}));
vi.mock("@ckd/core/secure-random.js", () => ({
  checkSecureRandom: () => undefined,
  secureRandomBytes: trace.forbiddenCrypto,
  fillSecureRandom: trace.forbiddenCrypto,
}));
vi.mock("@ckd/recovery-backup/fingerprint.js", () => ({
  fingerprintWithoutPassphrase: () => fixture.fingerprint,
}));
vi.mock("../src/ui/seed-diagnostic-view.js", () => ({
  renderSeedDiagnostic: () => undefined,
}));
vi.mock("@ckd/ui/qr-image-import.js", () => ({ installQrImageImport: () => undefined }));
vi.mock("@ckd/ui/text-file-import.js", () => ({ installTextFileImport: () => undefined }));
// The hints below a word field need a browser; recovery-mnemocode-word-hints.test.ts checks them.
vi.mock("../src/ui/recovery-mnemocode-word-hints.js", () => ({
  attachMnemoCodeWordHints: () => undefined,
}));
vi.mock("../src/workers/webcrypto-pbkdf2.js", () => ({
  webCryptoPbkdf2: trace.forbiddenCrypto,
}));
vi.mock("@ckd/recovery-backup/mnemocode-wallet-bitcoin.js", () => ({
  MnemoCodeWalletRecognition: class {
    static readonly COINS = [];
    static readonly PROFILES = [];
    static assertEvidence(): void {}
  },
}));
vi.mock("@ckd/recovery-backup/mnemocode.js", async () => {
  // The real lengths, from MnemoCode, so that the word-count choices are those of the page.
  const { BIP39_WORD_COUNTS } = await vi.importActual<
    typeof import("../../../packages/recovery-mnemocode/source/core/bip39-sizes.js")
  >("../../../packages/recovery-mnemocode/source/core/bip39-sizes.js");
  const { ENCODED_FORMATS, MASKING_MODES } = await vi.importActual<
    typeof import("../../../packages/recovery-mnemocode/source/core/types.js")
  >("../../../packages/recovery-mnemocode/source/core/types.js");
  const dates = (text: string) =>
    text === "" ? [] : [{ day: Number(text.slice(0, 2)), month: 1, year: 2000 }];
  return {
    MNEMOCODE_VERSION: "Recovery lifecycle-codec-stub",
    MNEMOCODE_PHRASE_WORD_COUNTS: BIP39_WORD_COUNTS,
    MASKING_MODES,
    ENCODED_FORMATS,
    decodeMnemoCode: trace.decode,
    effectiveMnemoCodeMode: (_text: string, mode: string) => mode,
    mnemoCodeEncodedPhrase: trace.encodedPhrase,
    parseMnemoCodeRecord: () => undefined,
    parseMnemoCodeDates: dates,
    mnemoCodeTakesDates: (mode: string) => mode !== "direct",
    mnemoCodeDatesFor: (mode: string, text: string) => (mode === "direct" ? [] : dates(text)),
    readMnemoCodeBackup: trace.readBackup,
  };
});
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

function recoveryContext() {
  const useMnemonicInDeriver = vi.fn<(phrase: string, passphrase?: string) => void>();
  const jobs = new RecoveryJobGate();
  jobs.setReady(true);
  const context = {
    registry: {},
    detectTargets: () => [],
    mnemonicToSeed: trace.forbiddenCrypto,
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

function decodeHarness(mode: "direct" | "seedshift" = "direct", install = true) {
  const page = new RecoveryTestPage();
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

function startMissingCodeSearch(page: RecoveryTestPage, selectedWay = "wallet"): void {
  edit(page.require("mnemocode-input"), fixture.marked);
  page.require("decode-mnemocode").click();
  startOfferedCodeSearch(page, selectedWay);
}

function startOfferedCodeSearch(page: RecoveryTestPage, selectedWay = "wallet"): void {
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

function action(result: ReturnType<RecoveryTestPage["add"]>, text: string) {
  return result.querySelectorAll("button").find((button) => button.textContent === text);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  trace.encodedPhrase.mockReset();
  trace.workerRuns.length = 0;
  trace.features.length = 0;
  vi.spyOn(BackupReading, "shareKind").mockReturnValue(undefined);
  trace.readBackup.mockImplementation((text: string) => ({
    marked: text === fixture.marked,
    markedFormats: () => ["english"],
    mode: (mode: string) => mode,
    missingCodes: () => ({
      withMode: (mode: string) => ({
        format: "english",
        mode,
        wordCount: 12,
        missingPlaces: [12],
        combinations: 2048,
        expected: 128,
        checksummed: true,
      }),
    }),
  }));
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

describe("AUD-028-API005 captured recovery factors", () => {
  for (const passphrase of [fixture.passphrase, ""])
    it(`hands off the captured ${passphrase === "" ? "empty" : "public vector"} passphrase to both primary fields`, async () => {
      const harness = decodeHarness();
      const mnemonic = harness.page.add("mnemonic", "textarea");
      const password = harness.page.add("passphrase", "input");
      password.value = "synthetic previous wallet factor";
      const open = vi.fn();
      const handoff = new RecoveryDeriverHandoff(harness.page as unknown as Document, open);
      harness.useMnemonicInDeriver.mockImplementation(handoff.use.bind(handoff));
      const observed: string[][] = [];
      for (const field of [mnemonic, password])
        field.addEventListener("input", () => observed.push([mnemonic.value, password.value]));
      harness.page.require("mnemocode-decode-wallet-passphrase").value = passphrase;
      startMissingCodeSearch(harness.page);
      const run = trace.workerRuns[0]!;
      expect(run.request.wallet).toEqual({
        evidence: { kind: "master-fingerprint", value: fixture.fingerprint, network: "mainnet" },
        passphrase,
      });
      run.resolve({ kind: "found", places: "Code 12", codes: fixture.phrase });
      await settlePromises();
      expect(action(harness.result, "Use in Generate & Derive")).toBeDefined();
      // Even a host assignment without an edit event cannot replace the request's factor.
      harness.page.require("mnemocode-decode-wallet-passphrase").value = "synthetic later value";
      action(harness.result, "Use in Generate & Derive")!.click();
      expect(harness.useMnemonicInDeriver).toHaveBeenCalledWith(fixture.phrase, passphrase);
      expect(observed).toEqual([
        [fixture.phrase, passphrase],
        [fixture.phrase, passphrase],
      ]);
      expect(open).toHaveBeenCalledOnce();
      expect(harness.page.activeElement).toBe(mnemonic);
    });

  it("publishes a search after the wallet field repeats its typed text as change (Firefox)", async () => {
    const harness = decodeHarness("seedshift");
    const fingerprint = harness.page.require("mnemocode-decode-wallet-fingerprint");
    edit(fingerprint, fixture.fingerprint);
    startMissingCodeSearch(harness.page);
    // Firefox delivers the field's blur change after the click that started the search.
    fingerprint.dispatchEvent(new Event("change", { bubbles: true }));
    trace.workerRuns[0]!.resolve({ kind: "found", places: "Code 12", codes: fixture.phrase });
    await settlePromises();
    expect(action(harness.result, "Use in Generate & Derive")).toBeDefined();
  });

  it("keeps non-wallet recovery phrase-only and clears an earlier primary passphrase", async () => {
    const harness = decodeHarness("seedshift");
    startMissingCodeSearch(harness.page, "encoded");
    expect(trace.workerRuns[0]!.request.wallet).toBeUndefined();
    trace.workerRuns[0]!.resolve({ kind: "found", places: "Code 12", codes: fixture.phrase });
    await settlePromises();
    action(harness.result, "Use in Generate & Derive")!.click();
    expect(harness.useMnemonicInDeriver).toHaveBeenCalledWith(fixture.phrase);
    const mnemonic = harness.page.add("mnemonic", "textarea");
    const password = harness.page.add("passphrase", "input");
    password.value = fixture.passphrase;
    new RecoveryDeriverHandoff(harness.page as unknown as Document, () => undefined).use(
      fixture.phrase,
    );
    expect([mnemonic.value, password.value]).toEqual([fixture.phrase, ""]);
  });

  it("refuses a handoff when either primary field is unavailable", () => {
    const page = new RecoveryTestPage();
    page.add("mnemonic", "textarea");
    const open = vi.fn();
    expect(() =>
      new RecoveryDeriverHandoff(page as unknown as Document, open).use(fixture.phrase),
    ).toThrow("The primary recovery source fields are unavailable.");
    expect(open).not.toHaveBeenCalled();
  });
});

describe("AUD-028-API006 Decode result ownership", () => {
  for (const [id, value, event] of [
    ["mnemocode-input", fixture.otherPhrase, "input"],
    ["mnemocode-decode-mode", "direct", "change"],
    ["mnemocode-decode-format", "indexes", "change"],
    ["mnemocode-decode-dates", fixture.otherDate, "input"],
  ])
    it(`revokes retained Show, Copy and Use callbacks after ${id} changes`, () => {
      const harness = decodeHarness("seedshift");
      harness.page.require("mnemocode-input").value = fixture.phrase;
      harness.page.require("decode-mnemocode").click();
      const show = action(harness.result, "Show phrase")!;
      const copy = action(harness.result, "Copy")!;
      const use = action(harness.result, "Use in Generate & Derive")!;
      const output = harness.result.querySelector("textarea")!;
      show.click();
      expect(copy.disabled).toBe(false);
      edit(harness.page.require(id!), value!, event!);
      // Retained nodes are deliberately dispatched too: DOM removal alone is not the guard.
      for (const button of [show, copy, use]) button.dispatchEvent(new Event("click"));
      expect(harness.useMnemonicInDeriver).not.toHaveBeenCalled();
      expect(harness.context.writeClipboard).not.toHaveBeenCalled();
      expect(harness.result.querySelector("textarea")).toBeNull();
      expect(output.value).toBe(fixture.phrase);
      harness.page.require("decode-mnemocode").click();
      action(harness.result, "Show phrase")!.click();
      action(harness.result, "Copy")!.click();
      action(harness.result, "Use in Generate & Derive")!.click();
      expect(harness.context.writeClipboard).toHaveBeenCalledWith(fixture.phrase);
      expect(harness.useMnemonicInDeriver).toHaveBeenCalledWith(fixture.phrase);
    });

  for (const foundDates of [fixture.date, undefined]) {
    it(`drops an old-date worker outcome with ${foundDates === undefined ? "supplied" : "found"} dates`, async () => {
      const harness = decodeHarness("seedshift");
      startMissingCodeSearch(harness.page);
      expect(trace.workerRuns[0]!.request.dates).toBe(fixture.date);
      edit(harness.page.require("mnemocode-decode-dates"), fixture.otherDate);
      trace.workerRuns[0]!.resolve({
        kind: "found",
        places: "Code 12",
        codes: fixture.phrase,
        ...(foundDates === undefined ? {} : { dates: foundDates }),
      });
      await settlePromises();
      expect(trace.decode).not.toHaveBeenCalled();
      expect(action(harness.result, "Use in Generate & Derive")).toBeUndefined();
      // A new search reads the new external date, and may publish normally.
      startMissingCodeSearch(harness.page);
      expect(trace.workerRuns[1]!.request.dates).toBe(fixture.otherDate);
      trace.workerRuns[1]!.resolve({
        kind: "found",
        places: "Code 12",
        codes: fixture.phrase,
        ...(foundDates === undefined ? {} : { dates: fixture.otherDate }),
      });
      await settlePromises();
      expect(trace.decode.mock.lastCall?.[1].dates).toEqual([{ day: 2, month: 1, year: 2000 }]);
      const oldUse = action(harness.result, "Use in Generate & Derive")!;
      edit(harness.page.require("mnemocode-decode-dates"), fixture.date, "change");
      oldUse.dispatchEvent(new Event("click"));
      expect(harness.useMnemonicInDeriver).not.toHaveBeenCalled();
    });
  }

  for (const id of ["mnemocode-input", "mnemocode-decode-wallet-passphrase"])
    it(`drops a pending request when ${id} is edited`, async () => {
      const harness = decodeHarness();
      startMissingCodeSearch(harness.page);
      edit(harness.page.require(id), "synthetic changed factor");
      trace.workerRuns[0]!.resolve({ kind: "found", places: "Code 12", codes: fixture.phrase });
      await settlePromises();
      expect(trace.decode).not.toHaveBeenCalled();
      expect(action(harness.result, "Use in Generate & Derive")).toBeUndefined();
    });

  it("does not substitute an edited passphrase into a completed wallet result", async () => {
    const harness = decodeHarness();
    startMissingCodeSearch(harness.page);
    trace.workerRuns[0]!.resolve({ kind: "found", places: "Code 12", codes: fixture.phrase });
    await settlePromises();
    const use = action(harness.result, "Use in Generate & Derive")!;
    edit(harness.page.require("mnemocode-decode-wallet-passphrase"), "");
    use.dispatchEvent(new Event("click"));
    expect(harness.useMnemonicInDeriver).not.toHaveBeenCalled();
    startMissingCodeSearch(harness.page);
    trace.workerRuns[1]!.resolve({ kind: "found", places: "Code 12", codes: fixture.phrase });
    await settlePromises();
    action(harness.result, "Use in Generate & Derive")!.click();
    expect(harness.useMnemonicInDeriver).toHaveBeenCalledWith(fixture.phrase, "");
  });

  it("preserves the explicit long-search confirmation while revoking the previous result", async () => {
    const harness = decodeHarness();
    startMissingCodeSearch(harness.page);
    trace.workerRuns[0]!.resolve({ question: "Synthetic long search requires confirmation" });
    await settlePromises();
    expect(harness.page.require("mnemocode-decode-missing-search").textContent).toBe(
      "Search anyway",
    );
    harness.page.require("mnemocode-decode-missing-search").click();
    expect(trace.workerRuns[1]!.request.confirmed).toBe(true);
    harness.page.require("mnemocode-decode-missing-stop").click();
    await settlePromises();
    expect(action(harness.result, "Use in Generate & Derive")).toBeUndefined();
  });

  it("a cancelled wallet request cannot supply the passphrase of the next recovery", async () => {
    const harness = decodeHarness();
    startMissingCodeSearch(harness.page);
    harness.page.require("mnemocode-decode-missing-stop").click();
    await settlePromises();
    expect(action(harness.result, "Use in Generate & Derive")).toBeUndefined();
    edit(harness.page.require("mnemocode-decode-wallet-passphrase"), "");
    startMissingCodeSearch(harness.page);
    trace.workerRuns[1]!.resolve({ kind: "found", places: "Code 12", codes: fixture.phrase });
    await settlePromises();
    action(harness.result, "Use in Generate & Derive")!.click();
    expect(harness.useMnemonicInDeriver).toHaveBeenCalledWith(fixture.phrase, "");
  });

  it("revokes completed and pending results when the page lifetime ends", async () => {
    const harness = decodeHarness();
    startMissingCodeSearch(harness.page);
    harness.page.window.dispatchEvent(new Event("pagehide"));
    trace.workerRuns[0]!.resolve({ kind: "found", places: "Code 12", codes: fixture.phrase });
    await settlePromises();
    expect(action(harness.result, "Use in Generate & Derive")).toBeUndefined();
  });
});

function selectInterpretation(page: RecoveryTestPage, value: "share" | "codes"): void {
  const radios = page.require("mnemocode-decode-input-kind").querySelectorAll("input");
  for (const radio of radios) radio.checked = radio.value === value;
  page
    .require(`mnemocode-decode-input-kind-${value}`)
    .dispatchEvent(new Event("change", { bubbles: true }));
}

function ambiguousCodesHarness() {
  // Exercise the actual "either" classification, not the default non-share codec fixture.
  vi.mocked(BackupReading.shareKind).mockRestore();
  trace.readBackup.mockImplementation((text: string) =>
    BackupReading.of(text, { seedshiftOnly: false, shareReader: "Restore from shares" }),
  );
  // The published BCR-2020-011 share: repair treats these three partial Unicode codes as
  // 33 unknown bits, but each final hex digit permits at most 16 words for the codes search.
  // Three wholly unknown word numbers would exceed its existing combination guard.
  const markedPlaces = [2, 6, 10];
  const codes = sskrVector.firstShareUnicode
    .split(" ")
    .map((code, index) => (markedPlaces.includes(index + 1) ? `${code.slice(0, -1)}?` : code))
    .join(" ");
  expect(BackupReading.shareKind(codes)).toBe("either");
  const reading = BackupReading.of(codes, {
    seedshiftOnly: false,
    shareReader: "Restore from shares",
  });
  const combinations = reading.missingCodes("unicode").combinations;
  expect(combinations).toBeGreaterThan(1);
  expect(combinations).toBeLessThanOrEqual(MAX_SEARCH_COMBINATIONS);
  const harness = decodeHarness();
  const { page } = harness;
  edit(page.require("mnemocode-decode-format"), "unicode", "change");
  edit(page.require("mnemocode-input"), codes);
  page.require("decode-mnemocode").click();
  expect(page.require("mnemocode-decode-input-kind").hidden).toBe(false);
  expect(trace.workerRuns).toHaveLength(0);
  selectInterpretation(page, "codes");
  expect(page.require("mnemocode-decode-input-kind-codes").checked).toBe(true);
  expect(page.require("mnemocode-decode-input-kind-share").checked).toBe(false);
  page.require("decode-mnemocode").click();
  expect(page.require("mnemocode-decode-missing").hidden).toBe(false);
  return { ...harness, codes };
}

async function expectFreshAmbiguousRecovery(harness: ReturnType<typeof ambiguousCodesHarness>) {
  const copiedBefore = vi.mocked(harness.context.writeClipboard).mock.calls.length;
  const usedBefore = harness.useMnemonicInDeriver.mock.calls.length;
  selectInterpretation(harness.page, "codes");
  // Merely choosing codes again must not revive the previous offer.
  expect(harness.page.require("mnemocode-decode-missing").hidden).toBe(true);
  harness.page.require("decode-mnemocode").click();
  startOfferedCodeSearch(harness.page);
  expect(trace.workerRuns.at(-1)!.request.text).toBe(harness.codes);
  trace.workerRuns.at(-1)!.resolve({
    kind: "found",
    places: "Codes 2, 6 and 10",
    codes: fixture.phrase,
  });
  await settlePromises();
  action(harness.result, "Show codes")!.click();
  action(harness.result, "Copy")!.click();
  action(harness.result, "Use in Generate & Derive")!.click();
  expect(harness.context.writeClipboard).toHaveBeenCalledWith(fixture.phrase);
  expect(harness.context.writeClipboard).toHaveBeenCalledTimes(copiedBefore + 1);
  expect(harness.useMnemonicInDeriver).toHaveBeenCalledWith(fixture.phrase, fixture.passphrase);
  expect(harness.useMnemonicInDeriver).toHaveBeenCalledTimes(usedBefore + 1);
}

describe("AUD-028-API006 ambiguous codes/share interpretation ownership", () => {
  it("revokes an offered search while preserving the selected share radio", async () => {
    const harness = ambiguousCodesHarness();
    const search = harness.page.require("mnemocode-decode-missing-search");
    selectInterpretation(harness.page, "share");
    expect(harness.page.require("mnemocode-decode-input-kind-share").checked).toBe(true);
    expect(harness.page.require("mnemocode-decode-input-kind-codes").checked).toBe(false);
    expect(harness.page.require("mnemocode-decode-input-kind").hidden).toBe(false);
    expect(harness.page.require("mnemocode-decode-missing").hidden).toBe(true);
    search.dispatchEvent(new Event("click"));
    expect(trace.workerRuns).toHaveLength(0);
    await expectFreshAmbiguousRecovery(harness);
  });

  for (const timing of ["before reply", "between promise continuations"] as const)
    it(`drops a pending codes result after choosing shares ${timing}`, async () => {
      const harness = ambiguousCodesHarness();
      startOfferedCodeSearch(harness.page);
      const run = trace.workerRuns[0]!;
      expect(run.request.text).toBe(harness.codes);
      const outcome = { kind: "found", places: "Codes 2, 6 and 10", codes: fixture.phrase };
      if (timing === "before reply") {
        selectInterpretation(harness.page, "share");
        run.resolve(outcome);
      } else {
        run.resolve(outcome);
        // WorkerJob may already have checked its revision; Decode must check its owner again.
        queueMicrotask(() => selectInterpretation(harness.page, "share"));
      }
      await settlePromises();
      expect(harness.page.require("mnemocode-decode-input-kind-share").checked).toBe(true);
      expect(harness.page.require("mnemocode-decode-missing").hidden).toBe(true);
      expect(trace.decode).not.toHaveBeenCalled();
      expect(action(harness.result, "Use in Generate & Derive")).toBeUndefined();
      expect(harness.context.writeClipboard).not.toHaveBeenCalled();
      await expectFreshAmbiguousRecovery(harness);
    });

  it("refuses detached code/phrase Show, Copy and Use actions after interpretation changes", async () => {
    const harness = ambiguousCodesHarness();
    startOfferedCodeSearch(harness.page);
    trace.workerRuns[0]!.resolve({
      kind: "found",
      places: "Codes 2, 6 and 10",
      codes: fixture.phrase,
    });
    await settlePromises();
    const shows = [action(harness.result, "Show codes")!, action(harness.result, "Show phrase")!];
    const copies = harness.result
      .querySelectorAll("button")
      .filter((button) => button.textContent === "Copy");
    const use = action(harness.result, "Use in Generate & Derive")!;
    const outputs = harness.result.querySelectorAll("textarea");
    expect(copies).toHaveLength(2);
    for (const show of shows) show.click();
    expect(outputs.every((output) => !output.classList.contains("concealed"))).toBe(true);
    for (const copy of copies) copy.click();
    use.click();
    expect(harness.context.writeClipboard).toHaveBeenCalledTimes(2);
    expect(harness.useMnemonicInDeriver).toHaveBeenCalledOnce();
    selectInterpretation(harness.page, "share");
    expect(harness.result.querySelector("textarea")).toBeNull();
    expect(harness.page.require("mnemocode-decode-input-kind-share").checked).toBe(true);
    for (const button of [...shows, ...copies, use]) button.dispatchEvent(new Event("click"));
    expect(outputs.every((output) => !output.classList.contains("concealed"))).toBe(true);
    expect(harness.context.writeClipboard).toHaveBeenCalledTimes(2);
    expect(harness.useMnemonicInDeriver).toHaveBeenCalledOnce();
    await expectFreshAmbiguousRecovery(harness);
  });
});

describe("AUD-028-SEC005 alternative MnemoCode output concealment", () => {
  for (const event of ["blur", "hidden"] as const) {
    it(`conceals the actual Decode Show codes output and closes Copy on ${event}`, async () => {
      const harness = decodeHarness();
      startMissingCodeSearch(harness.page);
      trace.workerRuns[0]!.resolve({ kind: "found", places: "Code 12", codes: fixture.phrase });
      await settlePromises();
      const show = action(harness.result, "Show codes")!;
      const copy = action(harness.result, "Copy")!;
      const outputs = harness.result.querySelectorAll("textarea");
      expect(outputs).toHaveLength(2);
      expect(outputs[0]!.rows).toBe(3);
      copy.dispatchEvent(new Event("click"));
      expect(harness.context.writeClipboard).not.toHaveBeenCalled();
      show.click();
      expect(outputs[0]!.classList.contains("concealed")).toBe(false);
      expect(outputs[1]!.classList.contains("concealed")).toBe(true);
      copy.click();
      expect(harness.context.writeClipboard).toHaveBeenCalledOnce();
      harness.page.hideOrBlur(event);
      expect(outputs.every((output) => output.classList.contains("concealed"))).toBe(true);
      expect(show.textContent).toBe("Show codes");
      expect(show.getAttribute("aria-pressed")).toBe("false");
      expect(copy.disabled).toBe(true);
      copy.dispatchEvent(new Event("click"));
      expect(harness.context.writeClipboard).toHaveBeenCalledOnce();
      if (event === "hidden") {
        harness.page.visibilityState = "visible";
        harness.page.dispatchEvent(new Event("visibilitychange"));
      }
      show.click();
      copy.click();
      expect(harness.context.writeClipboard).toHaveBeenCalledTimes(2);
    });
  }

  const renderers: readonly {
    name: string;
    show: string;
    copy: string;
    render(host: HTMLElement, copy: (value: string) => Promise<void>, current: () => boolean): void;
  }[] = [
    {
      name: "invalid phrase",
      show: "Show phrase",
      copy: "Copy",
      render: (host, copy, current) =>
        renderInvalidMnemonic(host, fixture.phrase.replace("about", "abandon"), copy, current),
    },
    {
      name: "legacy candidates",
      show: "Show candidates",
      copy: "Copy all",
      render: (host, copy, current) =>
        renderLegacyCandidates(host, [fixture.phrase], [fixture.fingerprint], copy, current),
    },
    {
      name: "found codes",
      show: "Show codes",
      copy: "Copy",
      render: (host, copy, current) =>
        renderFoundCodes(
          host,
          { places: "Code 12", codes: fixture.phrase },
          "Synthetic advice",
          copy,
          current,
        ),
    },
    {
      name: "missing-code candidates",
      show: "Show candidates",
      copy: "Copy all",
      render: (host, copy, current) =>
        renderMissingCodesList(
          host,
          [{ codes: fixture.phrase, phrase: fixture.phrase, fingerprint: fixture.fingerprint }],
          "Synthetic list",
          copy,
          current,
        ),
    },
    {
      name: "missing-word phrases",
      show: "Show phrases",
      copy: "Copy all",
      render: (host, copy, current) =>
        renderMissingWordCandidates(
          host,
          [
            {
              position: 12,
              word: "about",
              wordIndex: 3,
              checksumBits: "0011",
              mnemonic: fixture.phrase,
            },
          ],
          copy,
          false,
          current,
        ),
    },
  ];
  for (const renderer of renderers) {
    for (const event of ["blur", "hidden"] as const)
      it(`conceals ${renderer.name} on ${event} and refuses concealed or stale Copy`, () => {
        const page = new RecoveryTestPage();
        const result = page.add("synthetic-result");
        const input = page.add("synthetic-input", "textarea");
        const inputs = new InputRevision(input, () => result.replaceChildren());
        const current = inputs.capture();
        const copy = vi.fn(async () => undefined);
        renderer.render(result as unknown as HTMLElement, copy, current);
        const show = action(result, renderer.show)!;
        const copyButton = action(result, renderer.copy)!;
        const output = result.querySelector("textarea.concealed")!;
        copyButton.dispatchEvent(new Event("click"));
        expect(copy).not.toHaveBeenCalled();
        show.click();
        copyButton.click();
        expect(copy).toHaveBeenCalledWith(output.value);
        expect(output.classList.contains("concealed")).toBe(false);
        page.hideOrBlur(event);
        expect(output.classList.contains("concealed")).toBe(true);
        expect(copyButton.disabled).toBe(true);
        expect(show.getAttribute("aria-pressed")).toBe("false");
        copyButton.dispatchEvent(new Event("click"));
        expect(copy).toHaveBeenCalledOnce();
        edit(input, "Changed source");
        show.dispatchEvent(new Event("click"));
        copyButton.dispatchEvent(new Event("click"));
        expect(output.classList.contains("concealed")).toBe(true);
        expect(copy).toHaveBeenCalledOnce();
      });
  }
});

/** The real workspace composes actual Decode, manual secret controls and an MHFE PasswordField. */
function workspaceHarness(enable = true) {
  const harness = decodeHarness("direct", false);
  const { page } = harness;
  const root = page.add("recovery-workspace");
  page.add("recovery-busy", "p", root);
  const panels = Array.from({ length: 3 }, (_, index) => {
    const tab = page.add(`workspace-tab-${index}`, "button", root);
    tab.dataset.recoveryTab = "";
    tab.setAttribute("aria-controls", `workspace-panel-${index}`);
    const panel = page.add(`workspace-panel-${index}`, "section", root);
    panel.dataset.recoveryPanel = "";
    return panel;
  });
  const method = page.add("workspace-method", "div", panels[0]!);
  method.className = "backup-method";
  const operations = Array.from({ length: 3 }, (_, index) => {
    const tab = page.add(`workspace-operation-tab-${index}`, "button", method);
    tab.dataset.operationTab = "";
    const panel =
      index === 0
        ? page.require("mnemocode-decode-panel")
        : page.add(`workspace-operation-panel-${index}`, "section", method);
    if (index === 0) method.append(panel);
    panel.dataset.operationPanel = "";
    return panel;
  });
  const manual = page.add("workspace-manual", "article", panels[0]!);
  manual.className = "backup-operation";
  page.add("workspace-manual-phrase", "textarea", manual).value = fixture.phrase;
  const actions = page.add("workspace-manual-actions", "div", manual);
  page.add("workspace-manual-toggle", "button", actions);
  const manualCopy = page.add("workspace-manual-copy", "button", actions);
  manualCopy.className = "secret-copy-action";
  page.add("workspace-password", "input", panels[0]!).type = "password";
  page.add("toggle-workspace-password", "button", panels[0]!);
  const main = installControllerFixture(page, fixture);
  trace.features.push({
    phraseSlot: {
      target: "mnemocode",
      panelId: "workspace-panel-0",
      phraseField: "#workspace-manual-phrase",
      manualBlock: "#workspace-manual",
      linkedNote: PHRASE_ONLY_NOTE,
    },
    install(context) {
      new MnemoCodeDecodeTab(context);
      new PasswordField("workspace-password", "synthetic MHFE password");
      installSecretToggle("#workspace-manual-toggle", "#workspace-manual-phrase", "Show", "Hide");
    },
  });
  const workspace = installRecoveryWorkspace(harness.context);
  if (enable) workspace.setCryptoEnabled(true);
  return { ...harness, workspace, main, panels, operations, manualCopy };
}

describe("AUD-028-SEC005 actual workspace automatic concealment", () => {
  for (const event of ["blur", "hidden"] as const)
    it(`conceals manual, Decode and MHFE password controls on ${event} with parent reveal flags false`, async () => {
      const harness = workspaceHarness();
      await settlePromises();
      const { page } = harness;
      page.require("mnemocode-input").value = fixture.phrase;
      page.require("decode-mnemocode").click();
      action(harness.result, "Show phrase")!.click();
      page.require("workspace-manual-toggle").click();
      page.require("toggle-workspace-password").click();
      const output = harness.result.querySelector("textarea")!;
      const copy = action(harness.result, "Copy")!;
      const diagnostic = harness.result.querySelector(".recovered-seed-diagnostic")!;
      expect(output.classList.contains("concealed")).toBe(false);
      expect(copy.disabled).toBe(false);
      expect(diagnostic.hidden).toBe(false);
      expect(page.require("workspace-password").type).toBe("text");
      expect(harness.manualCopy.disabled).toBe(false);
      // Neither main reveal control was pressed; recovery must own its own local state.
      page.hideOrBlur(event);
      expect(output.classList.contains("concealed")).toBe(true);
      expect(copy.disabled).toBe(true);
      expect(diagnostic.hidden).toBe(true);
      expect(page.require("workspace-password").type).toBe("password");
      expect(page.require("workspace-manual-phrase").classList.contains("concealed")).toBe(true);
      expect(page.require("workspace-manual-toggle").getAttribute("aria-pressed")).toBe("false");
      expect(harness.manualCopy.disabled).toBe(true);
      copy.dispatchEvent(new Event("click"));
      expect(harness.context.writeClipboard).not.toHaveBeenCalled();
      action(harness.result, "Show phrase")!.click();
      expect(output.classList.contains("concealed")).toBe(false);
      expect(copy.disabled).toBe(false);
      // The linked-source handler still owns its reference, independently of manual controls.
      harness.workspace.useSource(
        {
          label: "Public vector source",
          read: () => ({ mnemonic: fixture.phrase, passphrase: "" }),
        },
        "mnemocode",
      );
      const linked = page.querySelector('[data-linked-source-for="mnemocode"]')!;
      linked.querySelector("button")!.click();
      expect(linked.querySelector("textarea")!.hidden).toBe(false);
      page.hideOrBlur(event);
      expect(linked.querySelector("textarea")!.hidden).toBe(true);
      expect(linked.querySelector("textarea")!.value).toBe("");
    });

  it("runs the same small UI checks at startup enable and in the full self-test", async () => {
    const check = vi.spyOn(RecoveryUiSelfTest, "run");
    const harness = workspaceHarness();
    expect(check).toHaveBeenCalledOnce();
    expect(harness.workspace.jobs).toHaveProperty("ready", true);
    const rows = await fullSelfTestParts.parts.at(-1)!();
    expect(rows.map((row) => row.name)).toEqual([
      "Recovery tab keyboard navigation",
      "Recovery input and result ownership",
      "Recovery automatic concealment and Copy gating",
    ]);
    expect(check).toHaveBeenCalledTimes(2);
    expect(harness.page.querySelectorAll("[data-test-tab]")).toHaveLength(0);
  });

  it("leaves a phrase the person revealed on the page revealed while the full self-test runs", async () => {
    const harness = workspaceHarness();
    const result = harness.page.createElement("div");
    harness.page.body.append(result);
    renderRecoveredSecret(
      result as unknown as HTMLElement,
      "public revealed test text",
      { reveal: "Show", hide: "Hide", copy: "Copy test" },
      async () => undefined,
    );
    const [reveal, copy] = result.querySelectorAll("button");
    reveal!.click();
    expect(copy!.disabled).toBe(false);
    await fullSelfTestParts.parts.at(-1)!();
    // The check conceals its own fixture only, not the page's revealed results.
    expect(copy!.disabled).toBe(false);
    expect(result.querySelector("textarea")!.classList.contains("concealed")).toBe(false);
  });

  it("keeps the recovery gate closed when the UI startup check fails", () => {
    const harness = workspaceHarness(false);
    expect(harness.page.require("decode-mnemocode").disabled).toBe(true);
    vi.spyOn(RecoveryUiSelfTest, "run").mockImplementation(() => {
      throw new Error("Synthetic lifecycle failure");
    });
    expect(() => harness.workspace.setCryptoEnabled(true)).toThrow("Synthetic lifecycle failure");
    expect(harness.page.require("decode-mnemocode").disabled).toBe(true);
    expect(harness.workspace.jobs).toHaveProperty("ready", false);
  });
});

describe("MnemoCode Decode layout while the codes fingerprint waits", () => {
  it("keeps the note's line while typing and shows the fingerprint with the result", () => {
    trace.encodedPhrase.mockReturnValue(fixture.phrase);
    const harness = decodeHarness();
    const note = harness.page.require("mnemocode-decode-codes-note");
    edit(harness.page.require("mnemocode-input"), fixture.phrase);
    // The line is kept before the typing pause, so the button below does not move later.
    expect(note.hidden).toBe(false);
    expect(note.textContent?.trim()).toBe("");
    harness.page.require("decode-mnemocode").click();
    // Decode shows the waiting fingerprint at once, above its result.
    expect(note.textContent).toContain(fixture.fingerprint);
    expect(harness.result.querySelectorAll("textarea")).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(note.textContent).toContain(fixture.fingerprint);
    edit(harness.page.require("mnemocode-input"), "");
    expect(note.hidden).toBe(true);
  });
});

describe("AUD-028-UI001 actual workspace keyboard tabs", () => {
  for (const kind of ["recovery", "operation"] as const) {
    for (const { key, start, next } of [
      { key: "ArrowRight", start: 0, next: 1 },
      { key: "ArrowLeft", start: 0, next: 2 },
      { key: "Home", start: 2, next: 0 },
      { key: "End", start: 0, next: 2 },
    ])
      it(`${kind} tabs select, show and focus the ${key} destination`, () => {
        const harness = workspaceHarness();
        const panels = kind === "recovery" ? harness.panels : harness.operations;
        const tabs = panels.map((_, index) =>
          harness.page.require(
            kind === "recovery" ? `workspace-tab-${index}` : `workspace-operation-tab-${index}`,
          ),
        );
        tabs[start]!.click();
        tabs[start]!.focus();
        const event = keyDown(tabs[start]!, key);
        expect(event.defaultPrevented).toBe(true);
        expect(tabs.map((tab) => tab.tabIndex)).toEqual(
          tabs.map((_, index) => (index === next ? 0 : -1)),
        );
        expect(tabs[next]!.getAttribute("aria-selected")).toBe("true");
        expect(harness.page.activeElement).toBe(tabs[next]);
        expect(panels.map((panel) => panel.hidden)).toEqual(
          panels.map((_, index) => index !== next),
        );
      });
  }

  it("handles disabled, empty and unrelated-key cases without changing the selection", () => {
    const harness = workspaceHarness();
    const tabs = harness.panels.map((_, index) => harness.page.require(`workspace-tab-${index}`));
    tabs[1]!.disabled = true;
    expect(keyDown(tabs[0]!, "ArrowRight").defaultPrevented).toBe(true);
    expect(harness.page.activeElement).toBe(tabs[2]);
    tabs[1]!.dispatchEvent(new Event("click"));
    expect(tabs[2]!.tabIndex).toBe(0);
    expect(keyDown(tabs[2]!, "Escape").defaultPrevented).toBe(false);
    const empty = harness.page.add("empty-tabs");
    expect(() => installTabs(empty as unknown as ParentNode, "button", "section")).not.toThrow();
    for (const tab of tabs) tab.disabled = true;
    installTabs(
      harness.page as unknown as ParentNode,
      "[data-recovery-tab]",
      "[data-recovery-panel]",
    );
    expect(tabs.every((tab) => tab.tabIndex === -1)).toBe(true);
    expect(harness.panels.every((panel) => panel.hidden)).toBe(true);
  });
});

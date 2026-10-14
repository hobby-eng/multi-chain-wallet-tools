// Real share controllers and import helper, with passive importers and deferred worker replies.
// Synthetic share text only; no QR decoding, image rendering, SSKR, wallet checks or KDF runs.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { installQrImageImport } from "@ckd/ui/qr-image-import.js";
import type { installTextFileImport } from "@ckd/ui/text-file-import.js";
import type {
  RepairOutcome,
  RestoreOutcome,
  SplitOutcome,
  SplitRequest,
} from "@ckd/recovery-backup/mnemocode-shares.js";
import { recoveryFeature } from "../src/ui/recovery-mnemocode-shares.js";
import { latestShares } from "../src/ui/recovery-mnemocode-share-store.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import {
  QR_IMAGES_IMPORT,
  SHARES_FILE_IMPORT,
  type RecoveryFeatureContext,
} from "../src/ui/recovery-workspace-shared.js";
import { RecoveryTestPage, edit, settlePromises } from "./fake-recovery-page.js";

type QrImportOptions = NonNullable<Parameters<typeof installQrImageImport>[2]>;
type FileImportOptions = NonNullable<Parameters<typeof installTextFileImport>[2]>;

const REPAIR = "mnemocode-forgotten-shares";
const RESTORE = "mnemocode-restore";
const FIRST_SHARE = "public synthetic share one ?";
const NEXT_SHARE = "public synthetic share two ?";
const PUBLIC_PHRASE = `${"abandon ".repeat(11)}about`;

const trace = vi.hoisted(() => ({
  qr: [] as { field: HTMLTextAreaElement; options: QrImportOptions }[],
  files: [] as { field: HTMLTextAreaElement; options: FileImportOptions }[],
  runs: [] as {
    request: Record<string, unknown>;
    resolve(outcome: RepairOutcome | RestoreOutcome): void;
    reject(cause: Error): void;
    terminated: boolean;
  }[],
  splits: [] as {
    request: SplitRequest;
    resolve(outcome: SplitOutcome): void;
    reject(cause: Error): void;
  }[],
  displayShares: vi.fn(),
  displayMnemonic: vi.fn(),
  backupOffers: vi.fn(),
  forbidden: vi.fn((): never => {
    throw new Error("Share import lifecycle fixtures forbid decoding, rendering and cryptography.");
  }),
}));

vi.mock("@ckd/ui/qr-image-import.js", () => ({
  installQrImageImport: (
    _document: Document,
    field: HTMLTextAreaElement,
    options: QrImportOptions,
  ) => {
    trace.qr.push({ field, options });
  },
}));
vi.mock("@ckd/ui/text-file-import.js", () => ({
  installTextFileImport: (
    _document: Document,
    field: HTMLTextAreaElement,
    options: FileImportOptions,
  ) => {
    trace.files.push({ field, options });
  },
}));
vi.mock("../src/ui/recovery-workspace-shared.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/ui/recovery-workspace-shared.js")>()),
  renderSensitiveShares: trace.displayShares,
  renderRecoveredMnemonic: trace.displayMnemonic,
  renderRecoveredSecret: trace.forbidden,
}));
vi.mock("@ckd/recovery-backup/mnemocode-shares.js", () => ({
  MnemoCodeShares: class {
    split(request: SplitRequest): Promise<SplitOutcome> {
      return new Promise((resolve, reject) => trace.splits.push({ request, resolve, reject }));
    }
  },
  sskrSharePlatform: () => ({}),
}));
vi.mock("@ckd/recovery-backup/sskr.js", () => ({
  sskrCodec: () => ({}),
  sskrWasmBytes: () => Uint8Array.of(1),
}));
vi.mock("@ckd/core/secure-random.js", () => ({ fillSecureRandom: trace.forbidden }));
vi.mock("@ckd/recovery-backup/fingerprint.js", () => ({
  fingerprintWithoutPassphrase: () => "01020304",
}));
vi.mock("@ckd/recovery-backup/mnemocode.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ckd/recovery-backup/mnemocode.js")>()),
  encodeMnemoCode: trace.forbidden,
}));
vi.mock("../../../packages/recovery-mnemocode/source/core/backup-check.js", () => ({
  ShareBackupCheck: class {},
}));
vi.mock("../src/ui/recovery-mnemocode-backup-check.js", () => ({
  BackupCheckSection: class {
    offer = trace.backupOffers;
  },
}));
vi.mock("../src/ui/recovery-mnemocode-self-test.js", () => ({
  mnemoCodeSelfTest: { addShares: () => undefined },
}));
vi.mock("../src/ui/recovery-mnemocode-candidates.js", () => ({
  renderCandidateListSave: () => undefined,
}));
vi.mock("../src/ui/recovery-mnemocode-word-hints.js", () => ({
  attachMnemoCodeWordHints: () => undefined,
}));
vi.mock("../src/ui/recovery-mnemocode-evidence.js", () => ({
  WalletEvidenceField: class {
    readonly choice = undefined;
    optional = true;
    listWanted = false;
    request = trace.forbidden;
  },
}));
vi.mock("../src/ui/recovery-mnemocode-list.js", () => ({
  CandidateListField: class {
    onChange(): void {}
    request = () => undefined;
  },
}));
vi.mock("../src/workers/mnemocode-worker-client.js", () => ({
  JOB_STOPPED: "Stopped. The worker and its memory were discarded.",
  MnemoCodeWorker: class {
    #run: (typeof trace.runs)[number] | undefined;

    run(request: Record<string, unknown>): Promise<RepairOutcome | RestoreOutcome> {
      return new Promise((resolve, reject) => {
        this.#run = { request, resolve, reject, terminated: false };
        trace.runs.push(this.#run);
      });
    }

    terminate(): void {
      if (this.#run === undefined) return;
      this.#run.terminated = true;
      this.#run.reject(new Error("Stopped. The worker and its memory were discarded."));
      this.#run = undefined;
    }
  },
}));

function repaired(): Extract<RepairOutcome, { kind: "shares" }> {
  return {
    kind: "shares",
    lines: [],
    shares: [
      {
        number: 1,
        text: "public uniquely repaired share",
        format: "words",
        record: "ur:sskr/public-synthetic-unique",
      },
    ],
    form: "words",
    repairs: [],
    notes: [],
  };
}

function splitOutcome(): SplitOutcome {
  return {
    original: PUBLIC_PHRASE,
    split: PUBLIC_PHRASE,
    shares: ["public split share one", "public split share two"],
    records: ["public split record one", "public split record two"],
  };
}

function restored(): Extract<RestoreOutcome, { kind: "phrases" }> {
  return {
    kind: "phrases",
    listFull: false,
    listEmpty: false,
    lines: [],
    phrases: [{ mnemonic: PUBLIC_PHRASE, held: PUBLIC_PHRASE, repairs: [] }],
    notes: [],
  };
}

describe("MnemoCode share results and Repair QR import lifecycle", () => {
  let page: RecoveryTestPage;
  let download: ReturnType<typeof vi.fn>;
  let clipboard: ReturnType<typeof vi.fn>;
  let handoff: ReturnType<typeof vi.fn>;
  let jobs: RecoveryJobGate;

  beforeEach(() => {
    vi.clearAllMocks();
    trace.qr.length = 0;
    trace.files.length = 0;
    trace.runs.length = 0;
    trace.splits.length = 0;
    latestShares.shares = undefined;
    page = new RecoveryTestPage();
    vi.stubGlobal("__MNEMOCODE_SHARES_WORKER_SOURCE__", "Passive public share-worker fixture");

    // Install through the existing entry point, with Encode fields outside the Split section.
    const encode = page.add("public-encode-fields");
    for (const id of ["mnemocode-encode-mode", "mnemocode-encode-format"])
      page.add(id, "select", encode);
    for (const id of ["mnemocode-encode-dates", "mnemocode-source"])
      page.add(id, "textarea", encode);
    page.require("mnemocode-encode-mode").value = "direct";
    page.require("mnemocode-encode-format").value = "english";
    page.require("mnemocode-source").value = PUBLIC_PHRASE;
    const split = page.add("mnemocode-split-section");
    split.dataset.secretScope = "";
    for (const id of [
      "mnemocode-split-check-section",
      "mnemocode-split-sets",
      "mnemocode-split-other",
      "mnemocode-split-copy-warning",
      "mnemocode-split-status",
      "mnemocode-split-result",
    ])
      page.add(id, "div", split);
    for (const id of ["count", "threshold"]) {
      const field = page.add(
        `mnemocode-split-${id}`,
        "input",
        page.require("mnemocode-split-other"),
      );
      field.type = "number";
      field.value = id === "count" ? "5" : "3";
    }
    page.add("mnemocode-split-form", "select", split).value = "words";
    page.add("mnemocode-split-copy", "input", split).type = "checkbox";
    for (const id of ["mnemocode-split", "mnemocode-split-save", "toggle-mnemocode-split-result"])
      page.add(id, "button", split);

    const restore = page.add(`${RESTORE}-panel`);
    restore.className = "backup-operation";
    page.add(`${RESTORE}-shares`, "textarea", restore);
    page.add(`${RESTORE}-dates`, "input", restore);
    for (const id of ["dates-field", "status", "result", "search-settings"])
      page.add(`${RESTORE}-${id}`, "div", restore);
    for (const id of [RESTORE, `${RESTORE}-stop`, `toggle-${RESTORE}-shares`])
      page.add(id, "button", restore);

    const repair = page.add("mnemocode-forgotten-share");
    repair.dataset.secretScope = "";
    page.add(REPAIR, "textarea", repair);
    page.add(`${REPAIR}-dates`, "input", repair);
    page.add(`${REPAIR}-form`, "select", repair).value = "words";
    for (const id of ["status", "result", "masked-field", "dates-field", "search-settings"])
      page.add(`${REPAIR}-${id}`, "div", repair);
    for (const id of [
      `${REPAIR}-repair`,
      `${REPAIR}-stop`,
      `toggle-${REPAIR}`,
      `toggle-${REPAIR}-result`,
    ])
      page.add(id, "button", repair);
    page.require(`${REPAIR}-repair`).textContent = "Repair the shares";

    page.add("clear-all", "button");
    jobs = new RecoveryJobGate();
    jobs.setReady(true);
    download = vi.fn();
    clipboard = vi.fn(async () => undefined);
    handoff = vi.fn();
    recoveryFeature.install({
      jobs,
      downloadText: download,
      mnemonicToSeed: trace.forbidden,
      writeClipboard: clipboard,
      useMnemonicInDeriver: handoff,
      readMnemonic: () => page.require("mnemocode-source").value,
    } as unknown as RecoveryFeatureContext);
  });

  afterEach(() => {
    expect(trace.forbidden).not.toHaveBeenCalled();
    latestShares.shares = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function qr(field = REPAIR) {
    const binding = trace.qr.find((entry) => entry.field.id === field);
    if (binding === undefined) throw new Error(`Missing passive QR binding for ${field}.`);
    return binding;
  }

  /** Passive importer delivery: the decoded text is supplied, never read from an image. */
  function deliverQr(text: string): void {
    const { field, options } = qr();
    const incoming = options.onDecoded?.({ text }) ?? text;
    const previous = field.value.trim();
    edit(page.require(REPAIR), previous === "" ? incoming : `${previous}\n${incoming}`);
  }

  async function startRepair(): Promise<void> {
    page.require(`${REPAIR}-repair`).click();
    await settlePromises();
  }

  async function startShareOperation(prefix: string): Promise<void> {
    page.require(prefix === RESTORE ? RESTORE : `${REPAIR}-repair`).click();
    await settlePromises();
  }

  async function startSplit(): Promise<void> {
    page.require("mnemocode-split").click();
    await settlePromises();
  }

  function invalidate(action: string): void {
    if (action === "clear-all") page.require("clear-all").click();
    else if (action === "pagehide") page.window.dispatchEvent(new Event("pagehide"));
    else if (action === "source-handoff")
      page.dispatchEvent(new CustomEvent("recovery-source-change", { detail: "mnemocode" }));
    else jobs.setReady(false);
  }

  it("uses Restore's exact shared QR and file import settings for Repair", () => {
    const restore = qr(`${RESTORE}-shares`);
    const repair = qr();
    for (const binding of [restore, repair]) {
      expect(binding.options).toMatchObject(QR_IMAGES_IMPORT);
      expect(binding.options.onDecoded?.({ text: "  public synthetic share\n" })).toBe(
        "public synthetic share",
      );
      expect(trace.files.find((entry) => entry.field === binding.field)?.options).toMatchObject(
        SHARES_FILE_IMPORT,
      );
    }
    repair.options.onError?.("synthetic Repair import refusal");
    expect(page.require(`${REPAIR}-status`).textContent).toBe("synthetic Repair import refusal");
    expect(page.require(`${RESTORE}-status`).textContent).toBe("");
    restore.options.onError?.("synthetic Restore import refusal");
    expect(page.require(`${RESTORE}-status`).textContent).toBe("synthetic Restore import refusal");
    expect(trace.runs).toHaveLength(0);
  });

  it("appends imported text while clearing old Repair output and card ownership", () => {
    page.require(REPAIR).value = FIRST_SHARE;
    page.require(`${REPAIR}-result`).append("public previous repair result");
    latestShares.shares = {
      records: ["public old repair"],
      form: "words",
      masked: false,
      origin: "repair",
    };
    page.require(`toggle-${REPAIR}-result`).click();
    expect(page.require(`toggle-${REPAIR}-result`).getAttribute("aria-pressed")).toBe("true");
    deliverQr(`  ${NEXT_SHARE}\n`);
    expect(page.require(REPAIR).value).toBe(`${FIRST_SHARE}\n${NEXT_SHARE}`);
    expect(page.require(`${REPAIR}-result`).children).toHaveLength(0);
    expect(latestShares.shares).toBeUndefined();
    expect(page.require(`toggle-${REPAIR}-result`).getAttribute("aria-pressed")).toBe("false");
    expect(trace.runs).toHaveLength(0);
    expect(download).not.toHaveBeenCalled();
  });

  it("drops an older worker reply after an imported QR changes the Repair input", async () => {
    deliverQr(FIRST_SHARE);
    await startRepair();
    const run = trace.runs[0]!;
    expect(run.request).toMatchObject({ type: "repair", answer: FIRST_SHARE });
    deliverQr(NEXT_SHARE);
    run.resolve(repaired());
    await settlePromises();
    expect(run.terminated).toBe(true);
    expect(page.require(`${REPAIR}-status`).textContent).toContain("its result was dropped");
    expect(page.require(`${REPAIR}-result`).children).toHaveLength(0);
    expect(trace.displayShares).not.toHaveBeenCalled();
    expect(latestShares.shares).toBeUndefined();
    expect(download).not.toHaveBeenCalled();
  });

  it("forgets a previous search confirmation after a QR import", async () => {
    deliverQr(FIRST_SHARE);
    await startRepair();
    trace.runs[0]!.resolve({ kind: "question", lines: [], question: "Synthetic search consent" });
    await settlePromises();
    expect(page.require(`${REPAIR}-repair`).textContent).toBe("Search anyway");
    deliverQr(NEXT_SHARE);
    expect(page.require(`${REPAIR}-repair`).textContent).toBe("Repair the shares");
    await startRepair();
    expect(trace.runs[1]!.request).toMatchObject({
      type: "repair",
      answer: `${FIRST_SHARE}\n${NEXT_SHARE}`,
      confirmed: false,
    });
    trace.runs[1]!.resolve({ kind: "trouble", lines: [], message: "Synthetic stopped assessment" });
    await settlePromises();
  });

  it("P44 displays ambiguous variants without publishing share files or card records", async () => {
    deliverQr(FIRST_SHARE);
    latestShares.shares = {
      records: ["public newer split"],
      form: "words",
      masked: false,
      origin: "split",
    };
    const split = latestShares.shares;
    await startRepair();
    trace.runs[0]!.resolve({
      kind: "variants",
      lines: [],
      message: "Two synthetic repairs fit; neither is selected.",
      variants: [
        { fingerprint: undefined, shares: repaired().shares, repairs: [] },
        { fingerprint: undefined, shares: repaired().shares, repairs: [] },
      ],
    });
    await settlePromises();
    expect(trace.displayShares).toHaveBeenCalledTimes(2);
    expect(page.require(`${REPAIR}-result`).text).toContain("Variant 1 of 2");
    expect(page.require(`${REPAIR}-result`).text).not.toContain("Save as a text file");
    expect(latestShares.shares).toBe(split);
    expect(download).not.toHaveBeenCalled();
  });

  it("P45 submits one imported share for independent Repair without requiring Restore quorum", async () => {
    deliverQr(FIRST_SHARE);
    expect(trace.runs).toHaveLength(0);
    await startRepair();
    expect(trace.runs[0]!.request).toMatchObject({
      type: "repair",
      answer: FIRST_SHARE,
      mode: "direct",
      dates: "",
      form: "words",
    });
    expect(trace.runs[0]!.request).not.toHaveProperty("wallet");
    trace.runs[0]!.resolve(repaired());
    await settlePromises();
    expect(trace.runs).toHaveLength(1);
    expect(trace.displayShares).toHaveBeenCalledOnce();
    expect(latestShares.shares).toMatchObject({
      origin: "repair",
      records: ["ur:sskr/public-synthetic-unique"],
    });
    expect(download).not.toHaveBeenCalled();
    const save = page.require(`${REPAIR}-result`).querySelector("button");
    expect(save?.textContent).toBe("Save as a text file");
    save!.click();
    expect(download).toHaveBeenCalledExactlyOnceWith(
      "public uniquely repaired share\n",
      "mnemocode-shares.txt",
      "text/plain",
    );
  });

  it.each([RESTORE, REPAIR])(
    "keeps the core consent defaults for blank %s allowances",
    async (prefix) => {
      edit(page.require(prefix === RESTORE ? `${RESTORE}-shares` : REPAIR), FIRST_SHARE);
      await startShareOperation(prefix);
      expect(trace.runs[0]!.request.limits).toEqual({});
      trace.runs[0]!.resolve({ kind: "trouble", lines: [], message: "Synthetic assessment only" });
      await settlePromises();
    },
  );

  it.each([RESTORE, REPAIR])(
    "forwards both generated %s allowances using the core limits shape",
    async (prefix) => {
      edit(page.require(prefix === RESTORE ? `${RESTORE}-shares` : REPAIR), FIRST_SHARE);
      edit(page.require(`${prefix}-max-tries`), "7");
      edit(page.require(`${prefix}-max-candidates`), "11");
      await startShareOperation(prefix);
      expect(trace.runs[0]!.request.limits).toEqual({ shares: 7, dates: 11 });
      expect(trace.runs[0]!.request).not.toHaveProperty("maxTries");
      expect(trace.runs[0]!.request).not.toHaveProperty("maxCandidates");
      trace.runs[0]!.resolve({ kind: "trouble", lines: [], message: "Synthetic assessment only" });
      await settlePromises();
    },
  );

  it.each([
    [RESTORE, "max-tries"],
    [RESTORE, "max-candidates"],
    [REPAIR, "max-tries"],
    [REPAIR, "max-candidates"],
  ])("revokes a pending %s when its %s allowance changes", async (prefix, suffix) => {
    edit(page.require(prefix === RESTORE ? `${RESTORE}-shares` : REPAIR), FIRST_SHARE);
    await startShareOperation(prefix);
    const bytes = Uint8Array.of(6, 7);
    edit(page.require(`${prefix}-${suffix}`), "2");
    trace.runs[0]!.resolve(
      prefix === REPAIR
        ? repaired()
        : {
            ...restored(),
            list: { bytes, records: 1, encrypted: false, description: "public fixture list" },
          },
    );
    await settlePromises();
    expect(trace.displayShares).not.toHaveBeenCalled();
    expect(trace.displayMnemonic).not.toHaveBeenCalled();
    expect(page.require(`${prefix}-result`).children).toHaveLength(0);
    expect(latestShares.shares).toBeUndefined();
    if (prefix === RESTORE) expect(bytes).toEqual(Uint8Array.of(0, 0));
  });

  it.each([RESTORE, REPAIR])(
    "forgets %s consent after an allowance edit but ignores its repeated blur",
    async (prefix) => {
      edit(page.require(prefix === RESTORE ? `${RESTORE}-shares` : REPAIR), FIRST_SHARE);
      await startShareOperation(prefix);
      trace.runs[0]!.resolve({ kind: "question", lines: [], question: "Synthetic search consent" });
      await settlePromises();
      const allowance = page.require(`${prefix}-max-tries`);
      edit(allowance, "2");
      await startShareOperation(prefix);
      expect(trace.runs[1]!.request).toMatchObject({ confirmed: false, limits: { shares: 2 } });
      allowance.dispatchEvent(new Event("change", { bubbles: true }));
      trace.runs[1]!.resolve(prefix === REPAIR ? repaired() : restored());
      await settlePromises();
      expect(
        prefix === REPAIR ? trace.displayShares : trace.displayMnemonic,
      ).toHaveBeenCalledOnce();
    },
  );

  it.each([
    [RESTORE, "max-tries", "0"],
    [RESTORE, "max-candidates", "1.5"],
    [REPAIR, "max-tries", "0"],
    [REPAIR, "max-candidates", "1.5"],
  ])(
    "refuses an invalid %s %s allowance before starting a worker",
    async (prefix, suffix, value) => {
      edit(page.require(prefix === RESTORE ? `${RESTORE}-shares` : REPAIR), FIRST_SHARE);
      edit(page.require(`${prefix}-${suffix}`), value);
      await startShareOperation(prefix);
      expect(trace.runs).toHaveLength(0);
      expect(page.require(`${prefix}-status`).classList.contains("warning")).toBe(true);
      expect(trace.displayShares).not.toHaveBeenCalled();
      expect(trace.displayMnemonic).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["mnemocode-source", "public replacement phrase", "input"],
    ["mnemocode-encode-mode", "seedshift", "change"],
    ["mnemocode-encode-dates", "02-01-2000", "input"],
    ["mnemocode-encode-format", "indexes", "change"],
    ["mnemocode-split-form", "indexes", "change"],
    ["mnemocode-split-count", "6", "input"],
    ["mnemocode-split-threshold", "4", "input"],
    ["mnemocode-split-copy", "", "change"],
  ])("does not publish a late Split result after editing %s", async (id, value, event) => {
    await startSplit();
    expect(trace.splits).toHaveLength(1);
    if (id === "mnemocode-split-copy") page.require(id).checked = true;
    edit(page.require(id), value, event);
    trace.splits[0]!.resolve(splitOutcome());
    await settlePromises();
    expect(trace.displayShares).not.toHaveBeenCalled();
    expect(page.require("mnemocode-split-result").children).toHaveLength(0);
    expect(page.require("mnemocode-split-save").hidden).toBe(true);
    expect(latestShares.shares).toBeUndefined();
    expect(trace.backupOffers.mock.calls.some(([check]) => check !== undefined)).toBe(false);
    expect(download).not.toHaveBeenCalled();
  });

  it("keeps a Split current through the repeated blur change and backup-check edits", async () => {
    const dates = page.require("mnemocode-encode-dates");
    edit(dates, "01-01-2000");
    await startSplit();
    dates.dispatchEvent(new Event("change", { bubbles: true }));
    trace.splits[0]!.resolve(splitOutcome());
    await settlePromises();
    expect(trace.displayShares).toHaveBeenCalledOnce();
    expect(latestShares.shares).toMatchObject({ origin: "split", records: splitOutcome().records });
    expect(page.require("mnemocode-split-save").hidden).toBe(false);
    const held = latestShares.shares;
    const check = page.add(
      "public-backup-check-input",
      "textarea",
      page.require("mnemocode-split-check-section"),
    );
    edit(check, "public read-back text");
    expect(latestShares.shares).toBe(held);
  });

  it("suppresses a stale Split error without overwriting the new inputs' status", async () => {
    await startSplit();
    edit(page.require("mnemocode-source"), "public replacement phrase");
    trace.splits[0]!.reject(new Error("public old Split failure"));
    await settlePromises();
    expect(page.require("mnemocode-split-status").textContent).toBe("");
    expect(page.require("mnemocode-split-status").classList.contains("warning")).toBe(false);
    expect(trace.displayShares).not.toHaveBeenCalled();
    expect(latestShares.shares).toBeUndefined();
  });

  it.each(["clear-all", "pagehide", "source-handoff", "self-test-loss"])(
    "revokes a pending Split on %s",
    async (action) => {
      await startSplit();
      invalidate(action);
      trace.splits[0]!.resolve(splitOutcome());
      await settlePromises();
      expect(trace.displayShares).not.toHaveBeenCalled();
      expect(page.require("mnemocode-split-result").children).toHaveLength(0);
      expect(page.require("mnemocode-split-save").hidden).toBe(true);
      expect(latestShares.shares).toBeUndefined();
    },
  );

  it.each([
    ["repair", "clear-all"],
    ["repair", "pagehide"],
    ["repair", "self-test-loss"],
    ["restore", "clear-all"],
    ["restore", "pagehide"],
    ["restore", "self-test-loss"],
  ])("revokes a pending %s on %s, wiping late Restore list bytes", async (operation, action) => {
    if (operation === "repair") deliverQr(FIRST_SHARE);
    else edit(page.require(`${RESTORE}-shares`), FIRST_SHARE);
    page.require(operation === "repair" ? `${REPAIR}-repair` : RESTORE).click();
    await settlePromises();
    const bytes = Uint8Array.of(6, 7);
    invalidate(action);
    trace.runs[0]!.resolve(
      operation === "repair"
        ? repaired()
        : {
            ...restored(),
            list: { bytes, records: 1, encrypted: false, description: "public fixture list" },
          },
    );
    await settlePromises();
    expect(trace.displayShares).not.toHaveBeenCalled();
    expect(trace.displayMnemonic).not.toHaveBeenCalled();
    expect(latestShares.shares).toBeUndefined();
    if (operation === "restore") expect(bytes).toEqual(Uint8Array.of(0, 0));
    expect(download).not.toHaveBeenCalled();
  });

  it("keeps old Repair Copy and Save callbacks revoked after a newer result", async () => {
    deliverQr(FIRST_SHARE);
    await startRepair();
    trace.runs[0]!.resolve(repaired());
    await settlePromises();
    const oldCopy = trace.displayShares.mock.calls[0]![2] as (value: string) => Promise<void>;
    const oldSave = page.require(`${REPAIR}-result`).querySelector("button")!;
    deliverQr(NEXT_SHARE);
    await startRepair();
    trace.runs[1]!.resolve(repaired());
    await settlePromises();
    await oldCopy("public old share");
    oldSave.click();
    expect(clipboard).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    const currentCopy = trace.displayShares.mock.calls[1]![2] as (value: string) => Promise<void>;
    await currentCopy("public current share");
    expect(clipboard).toHaveBeenCalledExactlyOnceWith("public current share");
  });

  it.each(["clear-all", "pagehide", "self-test-loss"])(
    "revokes an already published Split and its retained Copy action on %s",
    async (action) => {
      await startSplit();
      trace.splits[0]!.resolve(splitOutcome());
      await settlePromises();
      const copy = trace.displayShares.mock.calls[0]![2] as (value: string) => Promise<void>;
      invalidate(action);
      await copy("public old split share");
      page.require("mnemocode-split-save").dispatchEvent(new Event("click"));
      expect(clipboard).not.toHaveBeenCalled();
      expect(download).not.toHaveBeenCalled();
      expect(latestShares.shares).toBeUndefined();
      expect(page.require("mnemocode-split-save").hidden).toBe(true);
    },
  );

  it("revokes an old Restore handoff after a new input and result", async () => {
    edit(page.require(`${RESTORE}-shares`), FIRST_SHARE);
    page.require(RESTORE).click();
    await settlePromises();
    trace.runs[0]!.resolve(restored());
    await settlePromises();
    const oldUse = trace.displayMnemonic.mock.calls[0]![3] as (mnemonic: string) => void;
    edit(page.require(`${RESTORE}-shares`), NEXT_SHARE);
    page.require(RESTORE).click();
    await settlePromises();
    trace.runs[1]!.resolve(restored());
    await settlePromises();
    oldUse(PUBLIC_PHRASE);
    expect(handoff).not.toHaveBeenCalled();
    const use = trace.displayMnemonic.mock.calls[1]![3] as (mnemonic: string) => void;
    use(PUBLIC_PHRASE);
    expect(handoff).toHaveBeenCalledExactlyOnceWith(PUBLIC_PHRASE, undefined);
  });

  it.each(["clear-all", "pagehide", "self-test-loss"])(
    "wipes an already shown Restore list on %s",
    async (action) => {
      edit(page.require(`${RESTORE}-shares`), FIRST_SHARE);
      page.require(RESTORE).click();
      await settlePromises();
      const bytes = Uint8Array.of(6, 7);
      trace.runs[0]!.resolve({
        ...restored(),
        list: { bytes, records: 1, encrypted: false, description: "public fixture list" },
      });
      await settlePromises();
      expect(bytes).toEqual(Uint8Array.of(6, 7));
      invalidate(action);
      expect(bytes).toEqual(Uint8Array.of(0, 0));
      expect(page.require(`${RESTORE}-result`).children).toHaveLength(0);
    },
  );

  it("keeps all share operations closed when readiness is lost", async () => {
    jobs.setReady(false);
    for (const id of ["mnemocode-split", RESTORE, `${REPAIR}-repair`]) page.require(id).click();
    await settlePromises();
    expect(trace.splits).toHaveLength(0);
    expect(trace.runs).toHaveLength(0);
    expect(trace.displayShares).not.toHaveBeenCalled();
    expect(trace.displayMnemonic).not.toHaveBeenCalled();
  });
});

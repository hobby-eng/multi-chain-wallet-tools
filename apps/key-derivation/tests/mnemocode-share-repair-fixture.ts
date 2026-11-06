// Real share controllers and import helper, with passive importers and deferred worker replies.
// Synthetic share text only; no QR decoding, image rendering, SSKR, wallet checks or KDF runs.
import { afterEach, beforeEach, expect, vi } from "vitest";
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
import { type RecoveryFeatureContext } from "../src/ui/recovery-workspace-shared.js";
import { RecoveryTestPage, edit, settlePromises } from "./fake-recovery-page.js";
import { FakeRecoveryWorker } from "./fake-recovery-worker.js";

type QrImportOptions = NonNullable<Parameters<typeof installQrImageImport>[2]>;
type FileImportOptions = NonNullable<Parameters<typeof installTextFileImport>[2]>;

const REPAIR = "mnemocode-forgotten-shares";
const RESTORE = "mnemocode-restore";
const FIRST_SHARE = "public synthetic share one ?";
const NEXT_SHARE = "public synthetic share two ?";
const PUBLIC_PHRASE = `${"abandon ".repeat(11)}about`;

const trace = vi.hoisted(() => ({
  walletChoice: undefined as string | undefined,
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
  splitShares: (request: SplitRequest): SplitOutcome => {
    trace.splits.push({ request, resolve: () => undefined, reject: () => undefined });
    return splitOutcome();
  },
}));
// The worker is given the page's compiled MnemoCode; this passive worker needs none.
vi.mock("@ckd/recovery-backup/mnemocode-module.js", () => ({
  compiledMnemoCode: () => ({}),
}));
vi.mock("@ckd/core/secure-random.js", () => ({ fillSecureRandom: trace.forbidden }));
vi.mock("@ckd/recovery-backup/fingerprint.js", () => ({
  fingerprintWithoutPassphrase: () => "01020304",
}));
vi.mock("@ckd/recovery-backup/mnemocode.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ckd/recovery-backup/mnemocode.js")>()),
  encodeMnemoCode: trace.forbidden,
}));
vi.mock("@ckd/recovery-backup/mnemocode-backup-check.js", () => ({
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
    get choice(): string | undefined {
      return trace.walletChoice;
    }
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
/** Native transport only: replies reach the real client even after termination. */
class PassiveSharesWorker extends FakeRecoveryWorker {
  constructor() {
    super();
    this.postMessage.mockImplementation((message: unknown) => {
      // The client posts the page's compiled MnemoCode with each job.
      const request =
        typeof message === "object" && message !== null && "request" in message
          ? message.request
          : message;
      if (
        typeof request !== "object" ||
        request === null ||
        !("type" in request) ||
        typeof request.type !== "string"
      )
        throw new Error("The passive share worker needs an operation request.");
      const run = {
        request: { ...request, type: request.type },
        resolve: (outcome: RepairOutcome | RestoreOutcome) =>
          this.reply({ type: "result", outcome }),
        reject: (cause: Error) =>
          this.reply({ type: "error", name: "Error", message: cause.message }),
        terminated: false,
      };
      trace.runs.push(run);
      this.terminate.mockImplementation(() => {
        run.terminated = true;
      });
    });
  }
}

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
    shares: ["public split share one", "public split share two"],
    records: ["public split record one", "public split record two"],
    keepingNote: () => "Any 2 of the 2 shares restore the public test phrase.",
  };
}

function restored(): Extract<RestoreOutcome, { kind: "phrases" }> {
  return {
    kind: "phrases",
    listFull: false,
    listEmpty: false,
    lines: [],
    phrases: [{ mnemonic: PUBLIC_PHRASE, repairs: [] }],
    notes: [],
    warnings: [],
  };
}

let page: RecoveryTestPage;
let download: ReturnType<typeof vi.fn>;
let clipboard: ReturnType<typeof vi.fn>;
let handoff: ReturnType<typeof vi.fn>;
let jobs: RecoveryJobGate;

beforeEach(() => {
  trace.walletChoice = undefined;
  vi.clearAllMocks();
  trace.qr.length = 0;
  trace.files.length = 0;
  trace.runs.length = 0;
  trace.splits.length = 0;
  latestShares.shares = undefined;
  page = new RecoveryTestPage();
  vi.stubGlobal("Worker", PassiveSharesWorker);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:public-share-job");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.stubGlobal("__MNEMOCODE_SHARES_WORKER_SOURCE__", "Passive public share-worker fixture");

  // Install through the existing entry point, with Encode fields outside the Split section.
  const encode = page.add("public-encode-fields");
  for (const id of ["mnemocode-encode-mode", "mnemocode-encode-format"])
    page.add(id, "select", encode);
  for (const id of ["mnemocode-encode-dates", "mnemocode-source"]) page.add(id, "textarea", encode);
  page.require("mnemocode-encode-mode").value = "direct";
  page.require("mnemocode-encode-format").value = "english";
  page.require("mnemocode-source").value = PUBLIC_PHRASE;
  page.add("mnemocode-show-masked-words-field", "div", encode);
  page.add("mnemocode-show-masked-words", "input", encode).type = "checkbox";
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
    const field = page.add(`mnemocode-split-${id}`, "input", page.require("mnemocode-split-other"));
    field.type = "number";
    field.value = id === "count" ? "5" : "3";
  }
  page.add("mnemocode-split-form", "select", split).value = "words";
  page.add("mnemocode-split-copy", "input", split).type = "checkbox";
  page.add("mnemocode-show-original", "select", split).value = "none";
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
  const incoming = options.onDecoded?.({ text, utf8: true }) ?? text;
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

/** Shared passive native/worker ports and per-file lifetimes for share controller regressions. */
export {
  REPAIR,
  RESTORE,
  FIRST_SHARE,
  NEXT_SHARE,
  PUBLIC_PHRASE,
  trace,
  page,
  download,
  clipboard,
  handoff,
  jobs,
  qr,
  deliverQr,
  startRepair,
  startShareOperation,
  startSplit,
  invalidate,
  repaired,
  restored,
  splitOutcome,
};

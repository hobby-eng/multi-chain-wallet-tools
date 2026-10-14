/**
 * AUD-028 bounded Deriver controller probes; execution belongs to the coordinator.
 * Reviewed baseline HEAD: c5b62c2d489e7525326071128095ba95ecca92ac, with dirty source bytes.
 * Use the coordinator's audit Vitest config, maxWorkers=1 and a 1536 MiB Node heap.
 * The author prepares this file without running it. Assertions require the intended contract;
 * none is an expected failure, and a setup assertion must pass before a defect assertion counts.
 *
 * Actual entry points: MnemoCodeDecodeTab (including MnemoCodeMissingCodes, WalletEvidenceField
 * and MnemoCodeWorkerJob), createKeyDerivationController with installSilentPaymentFeature,
 * recovery installTabs, installSecretToggle, renderRecoveredMnemonic and PasswordField.
 *
 * Synthetic DOM extends the existing MHFE FakeElement support. It implements the selectors used
 * here, parent relationships, bubbling input/change/click/keydown, focus, classes and attributes.
 * It models disabled button clicks but not CSS, rendering, accessibility trees, native keyboard
 * default actions, native select restoration, clipboard permissions or file:// behavior. Recovery
 * concealment helpers run beside the actual main controller's blur/visibility listeners; the full
 * feature-composition host and built HTML are not instantiated.
 *
 * No browser, actual Worker, WASM, random sampling, hashing, derivation or KDF runs. Codec output,
 * mnemonic diagnostics, fingerprints and startup checks are explicit stubs. The missing-code
 * parser supplies a shaped 12-word case (one missing final word, 2048 combinations/128 expected
 * candidates); its actual search planner only renders choices, never enumerates candidates.
 * The actual wallet evidence UI makes the request, while recognition validation is a no-op.
 * Deferred fake transports establish UI request ownership, not cryptographic correctness,
 * real-worker delivery guarantees or browser/OS erasure. File/QR import widgets are omitted.
 *
 * Public phrase: eleven "abandon" words and "about". The second phrase is the published
 * "legal winner ... yellow" vector. TREZOR is the public BIP39 vector passphrase; fingerprints
 * and sp1-audit-* addresses below are invented labels, not computed wallet identifiers.
 * Dates 01-01-2000 and 02-01-2000 are synthetic. No owner material is read or recorded.
 *
 * Scope excludes BLD findings, cryptographic math, Clear/pagehide hypotheses and expired links.
 * task.meta.auditDeriverProbe retains synthetic pre-assertion observations for the coordinator.
 * The skeptic revision tests usable stale Use/Copy actions rather than requiring DOM removal.
 * Silent Payments includes a successful explicit refresh from changed phrase/passphrase fields
 * before its completed-output invalidation assertions; seed markers identify mocked source flow.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeElement } from "../../../apps/key-derivation/tests/fake-mhfe-page.js";
import { createKeyDerivationController } from "../../../apps/key-derivation/src/ui/controller.js";
import type { KeyDerivationView } from "../../../apps/key-derivation/src/ui/view.js";
import { installSilentPaymentFeature } from "../../../apps/key-derivation/src/ui/silent-payment-feature.js";
import { MnemoCodeDecodeTab } from "../../../apps/key-derivation/src/ui/recovery-mnemocode-decode.js";
import { PasswordField } from "../../../apps/key-derivation/src/ui/recovery-mhfe-fields.js";
import { RecoveryJobGate } from "../../../apps/key-derivation/src/ui/recovery-job-gate.js";
import {
  installSecretToggle,
  installTabs,
  renderRecoveredMnemonic,
  type RecoveryFeatureContext,
} from "../../../apps/key-derivation/src/ui/recovery-workspace-shared.js";
import { DerivationCancelledError } from "../../../apps/key-derivation/src/workers/derive-client.js";
import type { SilentPaymentResult } from "../../../apps/key-derivation/src/workers/silent-payment.js";
import { BackupReading } from "../../../packages/recovery-mnemocode/source/core/backup-reading.js";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(cause: Error): void;
}

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
  workerRuns: [] as {
    request: Record<string, unknown>;
    resolve(outcome: unknown): void;
    terminate(): void;
  }[],
  forbiddenCrypto: vi.fn((): never => {
    throw new Error("AUD-028 Deriver probes forbid crypto, randomness, WASM and KDF execution.");
  }),
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
      throw new Error("AUD-028 synthetic source is incomplete.");
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
vi.mock("../../../apps/key-derivation/src/ui/seed-diagnostic-view.js", () => ({
  renderSeedDiagnostic: () => undefined,
}));
vi.mock("@ckd/ui/qr-image-import.js", () => ({ installQrImageImport: () => undefined }));
vi.mock("@ckd/ui/text-file-import.js", () => ({ installTextFileImport: () => undefined }));
vi.mock("../../../apps/key-derivation/src/workers/webcrypto-pbkdf2.js", () => ({
  webCryptoPbkdf2: trace.forbiddenCrypto,
}));
vi.mock("@ckd/recovery-backup/mnemocode-wallet-bitcoin.js", () => ({
  MnemoCodeWalletRecognition: class {
    static readonly COINS = [];
    static readonly PROFILES = [];
    static assertEvidence(): void {}
  },
}));
vi.mock("@ckd/recovery-backup/mnemocode.js", () => {
  const dates = (text: string) =>
    text === "" ? [] : [{ day: Number(text.slice(0, 2)), month: 1, year: 2000 }];
  return {
    MNEMOCODE_VERSION: "AUD-028-codec-stub",
    decodeMnemoCode: trace.decode,
    effectiveMnemoCodeMode: (_text: string, mode: string) => mode,
    mnemoCodeEncodedPhrase: () => undefined,
    parseMnemoCodeRecord: () => undefined,
    parseMnemoCodeDates: dates,
    mnemoCodeTakesDates: (mode: string) => mode !== "direct",
    mnemoCodeDatesFor: (mode: string, text: string) => (mode === "direct" ? [] : dates(text)),
    readMnemoCodeBackup: (text: string) => ({
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
    }),
  };
});
vi.mock("../../../apps/key-derivation/src/workers/mnemocode-worker-client.js", () => ({
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

/** Extends existing test support only for interfaces these real controllers consume. */
class ProbeElement extends FakeElement {
  id = "";
  name = "";
  tabIndex = 0;
  parentElement: ProbeElement | null = null;
  readonly style: Record<string, string> = {};

  constructor(
    readonly tagName: string,
    readonly ownerDocument: ProbePage,
  ) {
    super();
    this.type = tagName === "button" ? "button" : "text";
    let classNames: string[] = [];
    Object.defineProperty(this, "className", {
      get: () => classNames.join(" "),
      set: (value: string) => {
        this.classList.remove(...classNames);
        classNames = value.split(/\s+/u).filter(Boolean);
        this.classList.add(...classNames);
      },
    });
    let text = "";
    Object.defineProperty(this, "textContent", {
      get: () => text,
      set: (value: string) => {
        for (const child of this.children)
          if (child instanceof ProbeElement) child.parentElement = null;
        this.children.length = 0;
        text = value;
      },
    });
  }

  get firstElementChild(): ProbeElement | null {
    return (this.children.find((child) => child instanceof ProbeElement) as ProbeElement) ?? null;
  }

  override append(...nodes: (FakeElement | string)[]): void {
    for (const node of nodes) {
      if (node instanceof ProbeElement) {
        node.remove();
        node.parentElement = this;
      }
      super.append(node);
    }
  }

  override replaceChildren(...nodes: (FakeElement | string)[]): void {
    for (const child of this.children)
      if (child instanceof ProbeElement) child.parentElement = null;
    this.children.length = 0;
    this.textContent = "";
    this.append(...nodes);
  }

  remove(): void {
    const siblings = this.parentElement?.children;
    if (siblings !== undefined) {
      const index = siblings.indexOf(this);
      if (index >= 0) siblings.splice(index, 1);
    }
    this.parentElement = null;
  }

  contains(other: ProbeElement): boolean {
    return other === this || this.descendants().includes(other);
  }

  override closest(selector = "label"): ProbeElement | null {
    for (let node: ProbeElement | null = this; node !== null; node = node.parentElement)
      if (node.matches(selector)) return node;
    return null;
  }

  descendants(): ProbeElement[] {
    return this.children.flatMap((child) =>
      child instanceof ProbeElement ? [child, ...child.descendants()] : [],
    );
  }

  matches(selector: string): boolean {
    return selector.split(",").some((alternative) => {
      const parts = alternative.trim().split(/\s+/u);
      if (!this.#simple(parts.pop()!)) return false;
      let ancestor = this.parentElement;
      while (parts.length > 0) {
        const part = parts.pop()!;
        while (ancestor !== null && !ancestor.#simple(part)) ancestor = ancestor.parentElement;
        if (ancestor === null) return false;
        ancestor = ancestor.parentElement;
      }
      return true;
    });
  }

  #simple(selector: string): boolean {
    const tag = /^[a-z][\w-]*/iu.exec(selector)?.[0];
    if (tag !== undefined && tag.toLowerCase() !== this.tagName) return false;
    const id = /#([\w-]+)/u.exec(selector)?.[1];
    if (id !== undefined && id !== this.id) return false;
    for (const [, name] of selector.matchAll(/\.([\w-]+)/gu))
      if (!this.classList.contains(name!)) return false;
    if (selector.includes(":checked") && !this.checked) return false;
    for (const [, name, quoted, plain] of selector.matchAll(
      /\[([\w-]+)(?:=(?:"([^"]*)"|([^\]]+)))?\]/gu,
    )) {
      const value = this.#attribute(name!);
      if (value === null || ((quoted ?? plain) !== undefined && value !== (quoted ?? plain)))
        return false;
    }
    return true;
  }

  #attribute(name: string): string | null {
    if (name === "id") return this.id || null;
    if (name === "name") return this.name || null;
    if (name === "type") return this.type;
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/gu, (_, letter: string) => letter.toUpperCase());
      return this.dataset[key] ?? null;
    }
    return this.getAttribute(name);
  }

  override querySelector(): null;
  override querySelector(selector: string): ProbeElement | null;
  override querySelector(selector?: string): ProbeElement | null {
    return selector === undefined ? null : (this.querySelectorAll(selector)[0] ?? null);
  }
  override querySelectorAll(selector?: string): ProbeElement[] {
    return selector === undefined
      ? []
      : this.descendants().filter((element) => element.matches(selector));
  }
  override focus(): void {
    this.ownerDocument.activeElement = this;
  }
  override click(): void {
    if (this.disabled) return;
    this.dispatchEvent(new Event("click", { bubbles: true }));
    this.onclick?.();
  }
  override dispatchEvent(event: Event): boolean {
    // Preserve the original target while forwarding to parents: Node EventTarget has no DOM tree.
    if (event.target === null) Object.defineProperty(event, "target", { value: this });
    const accepted = super.dispatchEvent(event);
    if (event.bubbles && !event.cancelBubble) {
      if (this.parentElement !== null) this.parentElement.dispatchEvent(event);
      else if (this === this.ownerDocument.body) this.ownerDocument.dispatchEvent(event);
    }
    return accepted;
  }
}

class ProbeInput extends ProbeElement {}

class ProbePage extends EventTarget {
  readonly body = new ProbeElement("body", this);
  readonly window = Object.assign(new EventTarget(), {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  });
  activeElement: ProbeElement | null = null;
  visibilityState = "visible";

  constructor() {
    super();
    vi.stubGlobal("document", this);
    vi.stubGlobal("window", this.window);
    vi.stubGlobal("Node", ProbeElement);
    vi.stubGlobal("HTMLElement", ProbeElement);
    vi.stubGlobal("HTMLInputElement", ProbeInput);
    vi.stubGlobal("__MNEMOCODE_SEARCH_WORKER_SOURCE__", "AUD-028 deferred worker; never executed");
  }

  createElement(tag: string): ProbeElement {
    return tag === "input" ? new ProbeInput(tag, this) : new ProbeElement(tag, this);
  }
  add(id: string, tag = "div", parent = this.body): ProbeElement {
    const element = this.createElement(tag);
    element.id = id;
    parent.append(element);
    return element;
  }
  querySelector(selector: string): ProbeElement | null {
    return this.body.querySelector(selector);
  }
  querySelectorAll(selector: string): ProbeElement[] {
    return this.body.querySelectorAll(selector);
  }
  require(id: string): ProbeElement {
    const element = this.querySelector(`#${id}`);
    if (element === null) throw new Error(`AUD-028 fixture is missing #${id}.`);
    return element;
  }
  hideOrBlur(event: "blur" | "hidden"): void {
    if (event === "blur") this.window.dispatchEvent(new Event("blur"));
    else {
      this.visibilityState = "hidden";
      this.dispatchEvent(new Event("visibilitychange"));
    }
  }
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  // Teardown may discard an injected operation before its owner awaits it.
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}

/** Flushes promise reactions without advancing a debounce or starting a second operation. */
async function settlePromises(): Promise<void> {
  for (let turn = 0; turn < 24; turn += 1) await Promise.resolve();
}

function record(
  task: { meta: Record<string, unknown> },
  root: string,
  observed: Record<string, unknown>,
): void {
  task.meta.auditDeriverProbe = { root, observed, synthetic: true, cryptoExecuted: false };
}

function edit(element: ProbeElement, value: string, event = "input"): void {
  element.value = value;
  element.dispatchEvent(new Event(event, { bubbles: true }));
}

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

function decodeHarness(mode: "direct" | "seedshift" = "direct") {
  const page = new ProbePage();
  const panel = page.add("mnemocode-decode-panel");
  panel.className = "backup-operation";
  for (const id of ["mnemocode-input", "mnemocode-decode-dates"]) page.add(id, "textarea", panel);
  for (const id of ["mnemocode-decode-mode", "mnemocode-decode-format"])
    page.add(id, "select", panel);
  for (const id of [
    "mnemocode-decode-record-note",
    "mnemocode-decode-codes-note",
    "mnemocode-decode-dates-field",
    "mnemocode-decode-result",
    "mnemocode-decode-input-kind",
  ])
    page.add(id, "div", panel);
  page.add("decode-mnemocode", "button", panel);
  for (const id of ["mnemocode-decode-mode-help", "mnemocode-decode-format-help"]) {
    const help = page.add(id, "div", panel);
    const popover = page.createElement("div");
    popover.className = "recovery-help-popover";
    help.append(popover);
  }
  const block = page.add("mnemocode-decode-missing", "div", panel);
  block.hidden = true;
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
  new MnemoCodeDecodeTab(context.context);
  return { page, ...context, result: page.require("mnemocode-decode-result") };
}

function startMissingCodeSearch(page: ProbePage): void {
  edit(page.require("mnemocode-input"), fixture.marked);
  page.require("decode-mnemocode").click();
  const way = page
    .require("mnemocode-decode-missing-way-list")
    .querySelectorAll("input")
    .find((radio) => radio.value === "wallet");
  expect(way, "setup: actual Decode must offer the wallet way").toBeDefined();
  way!.checked = true;
  way!.dispatchEvent(new Event("change", { bubbles: true }));
  page.require("mnemocode-decode-missing-search").click();
  expect(trace.workerRuns, "setup: actual controllers must reach one deferred worker").toHaveLength(
    1,
  );
}

function useButton(result: ProbeElement): ProbeElement | undefined {
  return result
    .querySelectorAll("button")
    .find((button) => button.textContent === "Use in Generate & Derive");
}

/** CSS is not modeled; reject actions disabled, hidden or inert in the synthetic DOM tree. */
function actionAvailable(button: ProbeElement | undefined): boolean {
  if (button === undefined || button.disabled || button.getAttribute("aria-disabled") === "true")
    return false;
  for (let node: ProbeElement | null = button; node !== null; node = node.parentElement)
    if (node.hidden || node.getAttribute("inert") !== null) return false;
  return true;
}

function tryRecoveredActions(result: ProbeElement) {
  const buttons = result.querySelectorAll("button");
  const reveal = buttons.find((button) => button.textContent === "Show phrase");
  const copy = buttons.find((button) => button.textContent === "Copy");
  if (actionAvailable(reveal)) reveal!.click();
  const copyAvailable = actionAvailable(copy);
  if (copyAvailable) copy!.click();
  const use = useButton(result);
  const handoffAvailable = actionAvailable(use);
  if (handoffAvailable) use!.click();
  return { handoffAvailable, copyAvailable };
}

const silentOutcome: SilentPaymentResult = {
  account: 0,
  address: "sp1-audit-old-source",
  changeAddress: "sp1-audit-old-change",
  scanPath: "m/352'/0'/0'/1'/0",
  spendPath: "m/352'/0'/0'/0'/0",
  scanPublicKey: "AUD-028-synthetic-scan-public-key",
  spendPublicKey: "AUD-028-synthetic-spend-public-key",
  labeledAddresses: [],
};
const pendingDerivations: Deferred<SilentPaymentResult>[] = [];

/** The actual controller and feature are installed; its view is a small explicit contract stub. */
function mainHarness(page = new ProbePage(), withSilentPayments = false) {
  const controls = Object.fromEntries(
    [
      "coin",
      "protocolTabs",
      "network",
      "account",
      "branchInput",
      "branchSelect",
      "includeChange",
      "includeCoinJoin",
      "includeLegacyMobile",
      "start",
      "count",
      "preview",
    ].map((name) => [
      name,
      page.add(`audit-control-${name}`, name === "protocolTabs" ? "div" : "input"),
    ]),
  );
  controls.network!.value = "mainnet";
  controls.account!.value = controls.start!.value = "0";
  controls.count!.value = "1";
  const viewElements = Object.fromEntries(
    [
      "form",
      "mnemonic",
      "passphrase",
      "exportFormat",
      "modeBasic",
      "modeAdvanced",
      "resultReceiveTab",
      "resultChangeTab",
      "resultCoinJoinTab",
      "resultCoinJoinExternalTab",
      "resultCoinJoinInternalTab",
      "toggleSensitiveValues",
      "toggleResultSecrets",
      "copyMnemonicButton",
      "copyWatchOnlyButton",
      "downloadWatchOnlyButton",
      "cancelDerivationButton",
      "generate12Button",
      "generate15Button",
      "generate18Button",
      "generate21Button",
      "generate24Button",
      "clearAllButton",
      "selectAllButton",
      "selectNoneButton",
      "selectInvertButton",
    ].map((name) => [
      name,
      page.add(`audit-view-${name}`, name === "mnemonic" ? "textarea" : "button"),
    ]),
  );
  viewElements.mnemonic!.value = "";
  const viewMethods = Object.fromEntries(
    [
      "showError",
      "showStatus",
      "clearMessages",
      "populateCoinSelect",
      "configureControls",
      "updateWordCount",
      "updateSeedDiagnostic",
      "updateMode",
      "updateBulkActions",
      "populateBuildPassport",
      "setCryptoControlsEnabled",
      "showCryptoSelfTestPassed",
      "showCryptoSelfTestFailed",
      "setRecoverySourceVisibility",
      "setResultSecretsVisibility",
      "resetDeriveAction",
      "hideSearchResult",
      "clearResults",
      "updatePathPreview",
      "showDerivationRunning",
      "showDerivationIdle",
      "showResults",
      "renderCurrent",
      "updateResultBranchTabs",
      "scrollResultsIntoView",
      "flashCopied",
      "setDownloadPreparing",
      "resultBranchEnabled",
      "focusResultBranch",
    ].map((name) => [name, vi.fn()]),
  );
  const view = {
    ...viewElements,
    ...viewMethods,
    document: page,
    controls,
    descriptorButtons: {},
    documentActionFrom: () => null,
    setGeneratedMnemonic: (phrase: string) => {
      viewElements.mnemonic!.value = phrase;
    },
    clearAllInputs: () => {
      viewElements.mnemonic!.value = viewElements.passphrase!.value = "";
    },
  } as unknown as KeyDerivationView;
  if (withSilentPayments) {
    const label = page.createElement("label");
    page.add("include-silent-payment", "input", label).checked = true;
    page.body.append(label);
    for (const id of ["silent-payment-tab", "derive-silent-payment"]) page.add(id, "button");
    for (const id of ["silent-payment-network", "silent-payment-account", "silent-payment-labels"])
      page.add(id, "input");
    page.require("silent-payment-network").value = "mainnet";
    page.require("silent-payment-account").value = "0";
    for (const id of [
      "silent-payment-panel",
      "silent-payment-result",
      "silent-payment-error",
      "silent-payment-labeled-list",
      "silent-payment-address",
      "silent-payment-change-address",
      "silent-payment-scan-path",
      "silent-payment-scan-key",
      "silent-payment-spend-path",
      "silent-payment-spend-key",
    ])
      page.add(id);
    page.require("silent-payment-result").hidden = true;
  }
  const selfTest = { passed: true, checks: ["AUD-028 synthetic startup"], durationMs: 0 };
  const deriveSilentPayment = vi.fn(
    (_seed: Uint8Array, _network: string, _account: number, _labels: readonly number[]) => {
      const pending = deferred<SilentPaymentResult>();
      pendingDerivations.push(pending);
      return pending.promise;
    },
  );
  const adapter = {
    id: "bitcoin-bip44",
    label: "Bitcoin",
    variantLabel: "BIP44",
    networkControl: true,
    defaults: { network: "mainnet", account: 0, branch: 0, start: 0, count: 1 },
    batchSize: 1,
  };
  const dependencies = {
    coinFamilies: [{ id: "bitcoin", label: "Bitcoin" }],
    getAdapterFamilyId: () => "bitcoin",
    getCoinAdapter: () => adapter,
    getDefaultCoinAdapter: () => adapter,
    buildInfo: {},
    generateMnemonic: () => fixture.otherPhrase,
    // Distinct byte markers make the new-source dispatch observable without deriving any seed.
    mnemonicToSeed: vi.fn((phrase: string) =>
      new Uint8Array(fixture.seedBytes).fill(
        phrase === fixture.otherPhrase ? fixture.otherSeedMarker : fixture.seedMarker,
      ),
    ),
    runBip39SelfTest: () => selfTest,
    runRecoveryBackupSelfTest: () => selfTest,
    setRecoveryControlsEnabled: vi.fn(),
    writeClipboard: vi.fn(async () => undefined),
    downloadBlob: vi.fn(),
    downloadText: vi.fn(),
    createWorker: () => ({
      ready: async () => undefined,
      selfTest: async () => selfTest,
      deriveSilentPayment,
      derive: async () => ({
        id: adapter.id,
        rows: [{ index: 0, basic: [], advanced: [] }],
        basicSummary: [],
        summary: [],
      }),
      terminate: () => undefined,
    }),
    ...(withSilentPayments ? { installSilentPaymentFeature } : {}),
  } as unknown as Parameters<typeof createKeyDerivationController>[1];
  createKeyDerivationController(view, dependencies).start();
  return { page, view, viewElements, dependencies, deriveSilentPayment };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  trace.workerRuns.length = 0;
  pendingDerivations.length = 0;
  vi.spyOn(BackupReading, "shareKind").mockReturnValue(undefined);
  trace.decode.mockImplementation((_text: string, options: { mode: string; format: string }) => ({
    mode: options.mode,
    format: options.format,
    checksumValid: true,
    mnemonic: fixture.phrase,
  }));
});

afterEach(async () => {
  for (const worker of trace.workerRuns) worker.terminate();
  for (const pending of pendingDerivations) pending.reject(new DerivationCancelledError());
  await settlePromises();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  expect(
    trace.forbiddenCrypto,
    "no probe may accidentally execute crypto or a KDF",
  ).not.toHaveBeenCalled();
});

describe("AUD-028 API: missing-code wallet passphrase handoff", () => {
  it("passes the captured TREZOR passphrase to Use in Generate & Derive", async ({ task }) => {
    const harness = decodeHarness();
    startMissingCodeSearch(harness.page);
    const run = trace.workerRuns[0]!;
    expect(run.request.wallet).toEqual({
      evidence: { kind: "master-fingerprint", value: fixture.fingerprint, network: "mainnet" },
      passphrase: fixture.passphrase,
    });
    run.resolve({ kind: "found", places: "Code 12", codes: fixture.phrase });
    await settlePromises();
    const use = useButton(harness.result);
    expect(use, "setup: the actual result must expose its handoff action").toBeDefined();
    use!.click();
    record(task, "missing-code passphrase", { calls: harness.useMnemonicInDeriver.mock.calls });
    expect(harness.useMnemonicInDeriver).toHaveBeenCalledWith(fixture.phrase, fixture.passphrase);
  });
});

describe("AUD-028 API: Decode output belongs to its current inputs", () => {
  for (const field of ["input", "mode", "format", "dates"] as const)
    it(`prevents stale recovered phrase Use and Copy when ${field} changes`, ({ task }) => {
      const harness = decodeHarness("seedshift");
      harness.page.require("mnemocode-input").value = fixture.phrase;
      harness.page.require("decode-mnemocode").click();
      expect(
        useButton(harness.result),
        "setup: decoding must produce a usable phrase",
      ).toBeDefined();
      const target = {
        input: ["mnemocode-input", fixture.otherPhrase, "input"],
        mode: ["mnemocode-decode-mode", "direct", "change"],
        format: ["mnemocode-decode-format", "indexes", "change"],
        dates: ["mnemocode-decode-dates", fixture.otherDate, "input"],
      }[field]!;
      edit(harness.page.require(target[0]!), target[1]!, target[2]!);
      const actions = tryRecoveredActions(harness.result);
      record(task, "Decode completed-result invalidation", {
        field,
        retainedPhrase: harness.result.querySelector("textarea")?.value,
        ...actions,
        handoffCalls: harness.useMnemonicInDeriver.mock.calls,
      });
      expect(harness.useMnemonicInDeriver).not.toHaveBeenCalled();
      expect(harness.context.writeClipboard).not.toHaveBeenCalled();
    });

  it("does not publish a missing-code result after its external dates field changes", async ({
    task,
  }) => {
    const harness = decodeHarness("seedshift");
    startMissingCodeSearch(harness.page);
    expect(trace.workerRuns[0]!.request.dates).toBe(fixture.date);
    edit(harness.page.require("mnemocode-decode-dates"), fixture.otherDate);
    trace.workerRuns[0]!.resolve({
      kind: "found",
      places: "Code 12",
      codes: fixture.phrase,
      dates: fixture.date,
    });
    await settlePromises();
    const actions = tryRecoveredActions(harness.result);
    record(task, "Decode pending-date invalidation", {
      currentDates: harness.page.require("mnemocode-decode-dates").value,
      ...actions,
      handoffCalls: harness.useMnemonicInDeriver.mock.calls,
      decodeCalls: trace.decode.mock.calls,
    });
    expect(harness.useMnemonicInDeriver).not.toHaveBeenCalled();
    expect(harness.context.writeClipboard).not.toHaveBeenCalled();
  });

  it("control: an input edit reaches the existing missing-code revision gate", async () => {
    const harness = decodeHarness();
    startMissingCodeSearch(harness.page);
    edit(harness.page.require("mnemocode-input"), fixture.otherPhrase);
    trace.workerRuns[0]!.resolve({ kind: "found", places: "Code 12", codes: fixture.phrase });
    await settlePromises();
    expect(useButton(harness.result)).toBeUndefined();
    expect(harness.result.querySelector("textarea")).toBeNull();
  });
});

describe("AUD-028 UI: actual recovery installTabs keyboard contract", () => {
  for (const { key, start, next } of [
    { key: "ArrowRight", start: 0, next: 1 },
    { key: "ArrowLeft", start: 0, next: 2 },
    { key: "Home", start: 2, next: 0 },
    { key: "End", start: 0, next: 2 },
  ])
    it(`moves selection, panel and focus with ${key}`, ({ task }) => {
      const page = new ProbePage();
      const root = page.add("audit-tab-root");
      root.setAttribute("role", "tablist");
      const tabs = Array.from({ length: 3 }, (_, index) => {
        const tab = page.add(`audit-tab-${index}`, "button", root);
        tab.dataset.recoveryTab = "";
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-controls", `audit-panel-${index}`);
        return tab;
      });
      const panels = tabs.map((_, index) => {
        const panel = page.add(`audit-panel-${index}`, "section", root);
        panel.dataset.recoveryPanel = "";
        panel.setAttribute("role", "tabpanel");
        return panel;
      });
      installTabs(root as unknown as ParentNode, "[data-recovery-tab]", "[data-recovery-panel]");
      tabs[start]!.click();
      tabs[start]!.focus();
      expect(tabs[start]!.getAttribute("aria-selected")).toBe("true");
      expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
      const event = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "key", { value: key });
      tabs[start]!.dispatchEvent(event);
      record(task, "recovery keyboard navigation", {
        key,
        selection: tabs.map((tab) => tab.getAttribute("aria-selected")),
        focusedId: page.activeElement?.id,
      });
      expect(tabs[next]!.getAttribute("aria-selected")).toBe("true");
      expect(page.activeElement).toBe(tabs[next]);
      expect(panels.map((panel) => panel.hidden)).toEqual(panels.map((_, index) => index !== next));
    });
});

describe("AUD-028 SEC: manual, recovered and password views auto-conceal", () => {
  for (const event of ["blur", "hidden"] as const) {
    it(`conceals a manually revealed recovery phrase on ${event}`, ({ task }) => {
      const page = new ProbePage();
      mainHarness(page);
      const scope = page.add("audit-manual-scope");
      scope.className = "backup-operation";
      const input = page.add("audit-manual-phrase", "textarea", scope);
      input.value = fixture.phrase;
      input.className = "concealed";
      const toggle = page.add("audit-manual-toggle", "button", scope);
      installSecretToggle("#audit-manual-toggle", "#audit-manual-phrase", "Show", "Hide", "phrase");
      toggle.click();
      expect(input.classList.contains("concealed"), "setup: Show must reveal the field").toBe(
        false,
      );
      page.hideOrBlur(event);
      record(task, "manual recovery concealment", {
        event,
        concealed: input.classList.contains("concealed"),
      });
      expect(input.classList.contains("concealed")).toBe(true);
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
    });

    it(`conceals a recovered phrase and disables its Copy on ${event}`, ({ task }) => {
      const page = new ProbePage();
      mainHarness(page);
      const result = page.add("audit-recovered-result");
      const context = recoveryContext().context;
      renderRecoveredMnemonic(
        result as unknown as HTMLElement,
        fixture.phrase,
        context.writeClipboard,
        context.useMnemonicInDeriver,
        context.mnemonicToSeed,
      );
      const output = result.querySelector("textarea")!;
      const reveal = result
        .querySelectorAll("button")
        .find((button) => button.textContent === "Show phrase")!;
      const copy = result
        .querySelectorAll("button")
        .find((button) => button.textContent === "Copy")!;
      expect(output.value).toBe(fixture.phrase);
      reveal.click();
      expect(output.classList.contains("concealed")).toBe(false);
      expect(copy.disabled).toBe(false);
      page.hideOrBlur(event);
      record(task, "recovered phrase concealment", {
        event,
        concealed: output.classList.contains("concealed"),
        copyDisabled: copy.disabled,
      });
      expect(output.classList.contains("concealed")).toBe(true);
      expect(copy.disabled).toBe(true);
    });

    it(`conceals an MHFE PasswordField on ${event}`, ({ task }) => {
      const page = new ProbePage();
      mainHarness(page);
      const input = page.add("audit-mhfe-password", "input");
      input.type = "password";
      input.value = fixture.passphrase;
      const toggle = page.add("toggle-audit-mhfe-password", "button");
      new PasswordField("audit-mhfe-password", "synthetic MHFE password");
      toggle.click();
      expect(input.type, "setup: PasswordField must reveal the password").toBe("text");
      page.hideOrBlur(event);
      record(task, "MHFE password concealment", { event, inputType: input.type });
      expect(input.type).toBe("password");
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
    });
  }
});

describe("AUD-028 API: Silent Payments belongs to the current parent source", () => {
  function expectCurrentSource(
    harness: ReturnType<typeof mainHarness>,
    phrase: string,
    passphrase: string,
    seedMarker: number,
  ): void {
    expect(harness.dependencies.mnemonicToSeed).toHaveBeenLastCalledWith(phrase, passphrase);
    // Inspect before completion: the actual feature wipes this request's seed in its finally.
    const seed = harness.deriveSilentPayment.mock.calls.at(-1)![0];
    expect(seed).toHaveLength(fixture.seedBytes);
    expect([...seed]).toEqual(Array<number>(fixture.seedBytes).fill(seedMarker));
  }

  async function start() {
    const harness = mainHarness(undefined, true);
    await settlePromises();
    expect(harness.view.showCryptoSelfTestPassed).toHaveBeenCalledOnce();
    harness.viewElements.mnemonic!.value = fixture.phrase;
    harness.page.require("silent-payment-tab").click();
    expect(
      harness.deriveSilentPayment,
      "setup: actual tab must start the feature",
    ).toHaveBeenCalledOnce();
    expectCurrentSource(harness, fixture.phrase, "", fixture.seedMarker);
    return harness;
  }

  async function refreshCurrentSource(harness: ReturnType<typeof mainHarness>): Promise<void> {
    edit(harness.viewElements.mnemonic!, fixture.otherPhrase);
    edit(harness.viewElements.passphrase!, fixture.passphrase);
    harness.page.require("derive-silent-payment").click();
    expect(
      harness.deriveSilentPayment,
      "control: explicit refresh starts a new request",
    ).toHaveBeenCalledTimes(2);
    expectCurrentSource(harness, fixture.otherPhrase, fixture.passphrase, fixture.otherSeedMarker);
    pendingDerivations[1]!.resolve({ ...silentOutcome, address: "sp1-audit-current-source" });
    await settlePromises();
    expect(harness.page.require("silent-payment-result").hidden).toBe(false);
    expect(harness.page.require("silent-payment-address").textContent).toBe(
      "sp1-audit-current-source",
    );
  }

  for (const field of ["mnemonic", "passphrase"] as const)
    it(`clears a completed result immediately when the parent ${field} changes`, async ({
      task,
    }) => {
      const harness = await start();
      pendingDerivations[0]!.resolve(silentOutcome);
      await settlePromises();
      expect(harness.page.require("silent-payment-result").hidden).toBe(false);
      await refreshCurrentSource(harness);
      edit(harness.viewElements[field]!, "");
      record(task, "Silent Payments completed-source invalidation", {
        field,
        currentMnemonic: harness.viewElements.mnemonic!.value,
        currentPassphrase: harness.viewElements.passphrase!.value,
        freshSourceControl: true,
        resultHidden: harness.page.require("silent-payment-result").hidden,
        retainedAddress: harness.page.require("silent-payment-address").textContent,
      });
      expect(harness.page.require("silent-payment-result").hidden).toBe(true);
    });

  for (const field of ["mnemonic", "passphrase"] as const)
    it(`drops a late reply after a parent ${field} edit, before any debounce runs`, async ({
      task,
    }) => {
      const harness = await start();
      edit(harness.viewElements[field]!, field === "mnemonic" ? "" : fixture.passphrase);
      pendingDerivations[0]!.resolve(silentOutcome);
      await settlePromises();
      expect(harness.deriveSilentPayment).toHaveBeenCalledOnce();
      record(task, "Silent Payments pending-source invalidation", {
        field,
        resultHidden: harness.page.require("silent-payment-result").hidden,
        retainedAddress: harness.page.require("silent-payment-address").textContent,
      });
      expect(harness.page.require("silent-payment-result").hidden).toBe(true);
    });

  it("Generate makes the active Silent Payments result from the old phrase unavailable", async ({
    task,
  }) => {
    const harness = await start();
    pendingDerivations[0]!.resolve(silentOutcome);
    await settlePromises();
    harness.viewElements.generate12Button!.click();
    await settlePromises();
    expect(harness.viewElements.mnemonic!.value, "setup: Generate must replace the parent").toBe(
      fixture.otherPhrase,
    );
    record(task, "Silent Payments Generate dispatch", {
      featureRequests: harness.deriveSilentPayment.mock.calls.length,
      retainedAddress: harness.page.require("silent-payment-address").textContent,
    });
    // Safety does not require an immediate automatic request: hiding the old result is essential.
    expect(harness.page.require("silent-payment-result").hidden).toBe(true);
    if (harness.deriveSilentPayment.mock.calls.length > 1)
      expectCurrentSource(harness, fixture.otherPhrase, "", fixture.otherSeedMarker);
  });
});

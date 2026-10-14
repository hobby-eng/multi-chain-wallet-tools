// Real controllers and input readers, passive worker replies and a synthetic DOM; no rendering.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installQrImageImport } from "@ckd/ui/qr-image-import.js";
import { installTextFileImport } from "@ckd/ui/text-file-import.js";
import {
  ENCODED_FORMATS,
  MASKING_MODES,
  mnemoCodeTakesDates,
} from "@ckd/recovery-backup/mnemocode.js";
import { MnemoCodeSearchSettings } from "@ckd/recovery-backup/mnemocode-search.js";
import { MnemoCodeForgottenTab } from "../src/ui/recovery-mnemocode-forgotten.js";
import { MnemoCodeMissingCodes } from "../src/ui/recovery-mnemocode-missing-codes.js";
import { MnemoCodeSearchSettingsFields } from "../src/ui/recovery-mnemocode-search-settings.js";
import { renderCandidates } from "../src/ui/recovery-mnemocode-candidates.js";
import { MAX_REPAIR_COMBINATIONS } from "../../../packages/recovery-mnemocode/source/sskr/joint-repair.js";
import { EncodedForm } from "../../../packages/recovery-mnemocode/source/core/encoded-form.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import {
  PHRASE_FILE_IMPORT,
  type RecoveryFeatureContext,
} from "../src/ui/recovery-workspace-shared.js";
import { RecoveryTestPage, edit, settlePromises } from "./fake-recovery-page.js";

const pending = vi.hoisted(() => ({
  runs: [] as { request: unknown; resolve(value: unknown): void }[],
  listAvailable: true,
}));
vi.mock("@ckd/ui/qr-image-import.js", () => ({ installQrImageImport: vi.fn() }));
vi.mock("@ckd/ui/text-file-import.js", () => ({ installTextFileImport: vi.fn() }));
vi.mock("../src/ui/recovery-mnemocode-word-hints.js", () => ({
  attachMnemoCodeWordHints: () => undefined,
}));
vi.mock("../src/ui/recovery-mnemocode-evidence.js", () => ({
  WalletEvidenceField: class {
    optional = true;
    listWanted = false;
    readonly choice = "fingerprint";
    readonly passphrase = "";
    request() {
      return {
        evidence: { kind: "master-fingerprint", value: "00000000", network: "mainnet" },
        passphrase: "",
      };
    }
  },
}));
vi.mock("../src/ui/recovery-mnemocode-list.js", () => ({
  CandidateListField: class {
    set available(available: boolean) {
      pending.listAvailable = available;
    }
    onChange(): void {}
    request(): undefined {
      return undefined;
    }
  },
}));
vi.mock("../src/workers/mnemocode-worker-client.js", () => ({
  JOB_STOPPED: "Synthetic stopped worker.",
  MnemoCodeWorker: class {
    run(request: unknown): Promise<unknown> {
      return new Promise((resolve) => pending.runs.push({ request, resolve }));
    }
    terminate(): void {}
  },
}));

const FORGOTTEN = "mnemocode-forgotten";
const DECODE = "mnemocode-decode";
const PUBLIC_WORD_INDEXES = [...Array<number>(11).fill(0), 3];
// Serialize through the form: human word numbers differ from internal zero-based indexes.
const PUBLIC_INDEXES = EncodedForm.of("indexes").codes(PUBLIC_WORD_INDEXES);
const MARKED_INDEX_CODES = `${EncodedForm.of("indexes").codes(PUBLIC_WORD_INDEXES.slice(0, -1))} ?`;

describe("MnemoCode recovery controls and request admission", () => {
  let page: RecoveryTestPage;
  let context: RecoveryFeatureContext;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    pending.runs.length = 0;
    pending.listAvailable = true;
    page = new RecoveryTestPage();
    const jobs = new RecoveryJobGate();
    jobs.setReady(true);
    context = { jobs } as RecoveryFeatureContext;
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function forgotten(): void {
    const fields = page.add(`${FORGOTTEN}-search-fields`);
    for (const id of ["word", "code", "date", "count", "dates-note", "status", "result"])
      page.add(`${FORGOTTEN}-${id}`, "div", fields);
    for (const id of ["search", "stop", "open-decode"])
      page.add(`${FORGOTTEN}-${id}`, "button", fields);
    for (const id of ["phrase", "codes"]) page.add(`${FORGOTTEN}-${id}`, "textarea", fields);
    for (const id of ["words", "mode", "format"]) page.add(`${FORGOTTEN}-${id}`, "select", fields);
    page.add(`${FORGOTTEN}-dates`, "input", fields);
    page.add(`${FORGOTTEN}-search-settings`, "div", fields);
    for (const id of ["phrase", "codes"]) page.add(`toggle-${FORGOTTEN}-${id}`, "button", fields);
    const wallet = page.add(`${FORGOTTEN}-wallet-question`, "fieldset", fields);
    page.add(`${FORGOTTEN}-wallet-fingerprint-choice`, "input", wallet);
    for (const [name, values] of [
      ["kind", ["word", "date"]],
      ["where", ["places", "missing", "legacy"]],
    ] as const)
      for (const value of values) {
        const radio = page.add(`${FORGOTTEN}-${name}-${value}`, "input", fields);
        radio.name = `${FORGOTTEN}-${name}`;
        radio.type = "radio";
        radio.value = value;
        radio.checked = value === values[0];
      }
    new MnemoCodeForgottenTab(context);
  }

  function choose(name: string, value: string): void {
    for (const radio of page.querySelectorAll(`input[name="${FORGOTTEN}-${name}"]`))
      radio.checked = radio.value === value;
    page.require(`${FORGOTTEN}-${name}-${value}`).dispatchEvent(new Event("change"));
  }

  it("reports generated settings edits once while ignoring repeated change events", () => {
    page.add(`${FORGOTTEN}-search-settings`);
    const settings = new MnemoCodeSearchSettingsFields(FORGOTTEN, "dates");
    const changed = vi.fn();
    settings.onEdit(changed);
    expect(() => settings.limits).toThrow(/only to share settings/u);
    for (const suffix of ["max-candidates", "progress-every", "max-results"]) {
      const field = page.require(`${FORGOTTEN}-${suffix}`);
      edit(field, "3");
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it("maps share settings to core limits using the share owner's bound", () => {
    const prefix = "synthetic-share-settings";
    page.add(`${prefix}-search-settings`);
    const settings = new MnemoCodeSearchSettingsFields(prefix, "shares", MAX_REPAIR_COMBINATIONS);
    const tries = page.require(`${prefix}-max-tries`);
    const candidates = page.require(`${prefix}-max-candidates`);
    expect(settings.limits).toEqual({});
    expect(() => settings.request).toThrow(/use limits/u);
    edit(tries, String(MAX_REPAIR_COMBINATIONS));
    edit(candidates, String(MnemoCodeSearchSettings.consentRange.max));
    expect(settings.limits).toEqual({
      shares: MAX_REPAIR_COMBINATIONS,
      dates: MnemoCodeSearchSettings.consentRange.max,
    });
    for (const invalid of ["0", "-1", "1.5", String(MAX_REPAIR_COMBINATIONS + 1)]) {
      edit(tries, invalid);
      expect(() => settings.limits).toThrow(/maxTries/u);
    }
    settings.available = false;
    expect(tries.disabled).toBe(true);
    expect(candidates.disabled).toBe(true);
    expect(tries.closest("label")?.hidden).toBe(true);
  });

  it("describes capped date display without claiming every matched row is shown", () => {
    const target = page.add("synthetic-candidate-result");
    renderCandidates(
      target as unknown as HTMLElement,
      {
        shown: [
          {
            number: 1,
            phrase: "Synthetic unused phrase",
            found: "Synthetic date",
            matched: true,
          },
        ],
        count: 10,
        matched: 10,
        warning: undefined,
        listFull: false,
        listEmpty: false,
      },
      { foundLabel: "Dates", evidence: "a synthetic reference", passphrase: "" },
      context,
    );
    expect(target.text).toContain("Matched 10 of 10 candidates");
    expect(target.text).toContain("The table shows 1 of 10 candidates.");
    expect(target.text).not.toContain("every one that matched");
  });

  it("installs library date modes, representations and shared phrase file/QR imports", () => {
    forgotten();
    expect(
      page
        .require(`${FORGOTTEN}-mode`)
        .children.map((child) => (child as unknown as HTMLOptionElement).value),
    ).toEqual(MASKING_MODES.filter(mnemoCodeTakesDates));
    expect(
      page
        .require(`${FORGOTTEN}-format`)
        .children.map((child) => (child as unknown as HTMLOptionElement).value),
    ).toEqual(["auto", ...ENCODED_FORMATS]);
    const phrase = page.require(`${FORGOTTEN}-phrase`);
    expect(installTextFileImport).toHaveBeenCalledWith(
      page,
      phrase,
      expect.objectContaining(PHRASE_FILE_IMPORT),
    );
    expect(installQrImageImport).toHaveBeenCalledWith(page, phrase, expect.any(Object));
  });

  it("routes legacy replacements through the shared wallet request and disables the candidate file", async () => {
    forgotten();
    choose("where", "legacy");
    page.require(`${FORGOTTEN}-phrase`).value =
      "mosquito dust hotel maximum rich kitten hair mother salute dream flush hospital";
    expect(page.require(`${FORGOTTEN}-wallet-question`).hidden).toBe(false);
    expect(pending.listAvailable).toBe(false);
    page.require(`${FORGOTTEN}-search`).click();
    await settlePromises();
    expect(pending.runs[0]!.request).toMatchObject({
      type: "words",
      kind: "legacy-replacements",
      wallet: { evidence: { kind: "master-fingerprint", value: "00000000" } },
    });
  });

  it("captures date overrides and revokes second-press consent after a settings edit", async () => {
    forgotten();
    choose("kind", "date");
    edit(page.require(`${FORGOTTEN}-codes`), PUBLIC_INDEXES);
    edit(page.require(`${FORGOTTEN}-format`), "indexes");
    edit(page.require(`${FORGOTTEN}-mode`), "seedshift");
    edit(page.require(`${FORGOTTEN}-dates`), "2?-09-2026");
    edit(page.require(`${FORGOTTEN}-max-candidates`), "1");
    edit(page.require(`${FORGOTTEN}-progress-every`), "3");
    edit(page.require(`${FORGOTTEN}-max-results`), "2049");
    page.require(`${FORGOTTEN}-search`).click();
    await settlePromises();
    expect(pending.runs[0]!.request).toMatchObject({
      type: "dates",
      maxCandidates: 1,
      progressEvery: 3,
      maxShown: 2049,
      confirmed: false,
    });
    pending.runs[0]!.resolve({ question: "Synthetic ten combinations: continue?" });
    await settlePromises();
    expect(page.require(`${FORGOTTEN}-search`).textContent).toBe("Search anyway");
    edit(page.require(`${FORGOTTEN}-max-candidates`), "2");
    page.require(`${FORGOTTEN}-search`).click();
    await settlePromises();
    expect(pending.runs[1]!.request).toMatchObject({ maxCandidates: 2, confirmed: false });
    const shown = page.require(`${FORGOTTEN}-max-results`) as unknown as HTMLInputElement;
    expect(shown.max).toBe(String(MnemoCodeSearchSettings.countRange.max));
  });

  it("captures marked-code length before trailing decoys together with the consent override", async () => {
    const block = page.add(`${DECODE}-missing`);
    for (const id of [
      "missing-summary",
      "missing-way-list",
      "encoded-fingerprint-field",
      "missing-wallet",
      "missing-dates-note",
      "missing-status",
    ])
      page.add(`${DECODE}-${id}`, "div", block);
    for (const id of ["missing-search", "missing-stop"])
      page.add(`${DECODE}-${id}`, "button", block);
    page.add(`${DECODE}-encoded-fingerprint`, "input", block).value = "00000000";
    page.add(`${DECODE}-search-settings`, "div", block);
    const recovery = new MnemoCodeMissingCodes(
      context,
      () => "",
      () => undefined,
      () => () => true,
    );
    const text = `${MARKED_INDEX_CODES} ${PUBLIC_INDEXES}`;
    // The encoded-fingerprint way is offered for masked codes; direct codes use the wallet.
    recovery.offer(text, "indexes", "seedshift", 12);
    const way = page
      .require(`${DECODE}-missing-way-list`)
      .querySelectorAll("input")
      .find((radio) => radio.value === "encoded")!;
    way.checked = true;
    way.dispatchEvent(new Event("change"));
    edit(page.require(`${DECODE}-max-candidates`), "1");
    page.require(`${DECODE}-missing-search`).click();
    await settlePromises();
    expect(pending.runs[0]!.request).toMatchObject({
      type: "missing-codes",
      text,
      words: 12,
      way: "encoded",
      maxCandidates: 1,
      confirmed: false,
    });
  });
});

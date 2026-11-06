// Real share controllers with the shared passive native/worker fixture; no cryptographic execution.
import { expect, it, vi } from "vitest";
import {
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
  invalidate,
  repaired,
  restored,
} from "./mnemocode-share-repair-fixture.js";
// After the fixture, whose mocks these modules must see.
import { latestShares } from "../src/ui/recovery-mnemocode-share-store.js";
import { QR_IMAGES_IMPORT, SHARES_FILE_IMPORT } from "../src/ui/recovery-workspace-shared.js";
import { edit, settlePromises } from "./fake-recovery-page.js";

it("uses Restore's exact shared QR and file import settings for Repair", () => {
  const restore = qr(`${RESTORE}-shares`);
  const repair = qr();
  for (const binding of [restore, repair]) {
    expect(binding.options).toMatchObject(QR_IMAGES_IMPORT);
    expect(binding.options.onDecoded?.({ text: "  public synthetic share\n", utf8: true })).toBe(
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

it.each([false, true])(
  "retires Repair card ownership after import with native fault=%s",
  (nativeFault) => {
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
    if (nativeFault)
      vi.spyOn(page.require(`${REPAIR}-result`), "replaceChildren").mockImplementation(() => {
        throw new Error("Synthetic private native cleanup detail");
      });
    deliverQr(`  ${NEXT_SHARE}\n`);
    expect(page.require(REPAIR).value).toBe(`${FIRST_SHARE}\n${NEXT_SHARE}`);
    if (!nativeFault) expect(page.require(`${REPAIR}-result`).children).toHaveLength(0);
    expect(latestShares.shares).toBeUndefined();
    expect(page.require(`toggle-${REPAIR}-result`).getAttribute("aria-pressed")).toBe("false");
    expect(trace.runs).toHaveLength(0);
    expect(download).not.toHaveBeenCalled();
  },
);

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

it("shows the wallet check's warning with repaired shares and with variants (AUD-037-SEC004)", async () => {
  const warning = "Synthetic warning: a fingerprint only filters.";
  deliverQr(FIRST_SHARE);
  await startRepair();
  trace.runs[0]!.resolve({ ...repaired(), warning });
  await settlePromises();
  expect(page.require(`${REPAIR}-result`).text).toContain(warning);
  deliverQr(FIRST_SHARE);
  await startRepair();
  trace.runs[1]!.resolve({
    kind: "variants",
    lines: [],
    message: "Two synthetic repairs fit; the wallet matches each.",
    variants: [
      { fingerprint: undefined, shares: repaired().shares, repairs: [] },
      { fingerprint: undefined, shares: repaired().shares, repairs: [] },
    ],
    warning,
  });
  await settlePromises();
  expect(page.require(`${REPAIR}-result`).text.split(warning)).toHaveLength(2);
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
    expect(prefix === REPAIR ? trace.displayShares : trace.displayMnemonic).toHaveBeenCalledOnce();
  },
);

it.each([
  [RESTORE, "max-tries", "0"],
  [RESTORE, "max-candidates", "1.5"],
  [REPAIR, "max-tries", "0"],
  [REPAIR, "max-candidates", "1.5"],
])("refuses an invalid %s %s allowance before starting a worker", async (prefix, suffix, value) => {
  edit(page.require(prefix === RESTORE ? `${RESTORE}-shares` : REPAIR), FIRST_SHARE);
  edit(page.require(`${prefix}-${suffix}`), value);
  await startShareOperation(prefix);
  expect(trace.runs).toHaveLength(0);
  expect(page.require(`${prefix}-status`).classList.contains("warning")).toBe(true);
  expect(trace.displayShares).not.toHaveBeenCalled();
  expect(trace.displayMnemonic).not.toHaveBeenCalled();
});

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

it("shows the wallet check's warning once after all restored phrases (AUD-037-SEC004)", async () => {
  const warning = "Synthetic warning: a fingerprint only filters.";
  edit(page.require(`${RESTORE}-shares`), FIRST_SHARE);
  page.require(RESTORE).click();
  await settlePromises();
  const one = restored().phrases[0]!;
  trace.runs[0]!.resolve({ ...restored(), phrases: [one, one], warnings: [warning] });
  await settlePromises();
  expect(page.require(`${RESTORE}-result`).text.split(warning)).toHaveLength(2);
});

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

it.each(
  ["clear-all", "pagehide", "self-test-loss"].flatMap((action) =>
    [false, true].map((nativeFault) => ({ action, nativeFault })),
  ),
)(
  "wipes an already shown Restore list on $action with native fault=$nativeFault",
  async ({ action, nativeFault }) => {
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
    if (nativeFault)
      vi.spyOn(page.require(`${RESTORE}-result`), "replaceChildren").mockImplementation(() => {
        throw new Error("Synthetic private native cleanup detail");
      });
    invalidate(action);
    expect(bytes).toEqual(Uint8Array.of(0, 0));
    if (!nativeFault) expect(page.require(`${RESTORE}-result`).children).toHaveLength(0);
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

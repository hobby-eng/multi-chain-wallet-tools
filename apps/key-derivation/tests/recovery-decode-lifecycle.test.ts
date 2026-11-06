import { action, decodeHarness, fixture, trace } from "./recovery-decode-fixture.js";
import { startMissingCodeSearch, startOfferedCodeSearch } from "./recovery-decode-fixture.js";
import { describe, expect, it, vi } from "vitest";
import { RecoveryDeriverHandoff } from "../src/ui/recovery-deriver-handoff.js";
import { mnemocode } from "@ckd/recovery-backup/mnemocode-engine.js";
import { foundAmongOthers, MISSING_CODES_TEXTS } from "@ckd/recovery-backup/mnemocode-facts.js";
import { MnemoCodeMarkedCodes } from "@ckd/recovery-backup/mnemocode-marked-codes.js";
import { splitShares } from "@ckd/recovery-backup/mnemocode-shares.js";
import { InputRevision } from "../src/ui/recovery-input-revision.js";
import {
  renderFoundCodes,
  renderInvalidMnemonic,
  renderLegacyCandidates,
  renderMissingCodesList,
  renderMissingWordCandidates,
} from "../src/ui/recovery-mnemocode-results.js";
import { RecoveryTestPage, edit, settlePromises } from "./fake-recovery-page.js";

// What a wallet check says of a match it cannot confirm; the worker's outcome carries it.
const WALLET_WARNING = "Synthetic wallet check warning";

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

  it("warns that the codes and dates found are one of several sets of the same phrase (AUD-037-FUN001)", async () => {
    const harness = decodeHarness("seedshift");
    startMissingCodeSearch(harness.page);
    trace.workerRuns[0]!.resolve({
      kind: "found",
      places: "Code 12",
      codes: fixture.phrase,
      others: 8,
    });
    await settlePromises();
    const shown = harness.result.descendants();
    const warning = shown.find((node) => node.textContent === foundAmongOthers(8));
    expect(warning?.classList.contains("warning-callout")).toBe(true);
    expect(shown.some((node) => node.textContent === MISSING_CODES_TEXTS.correct)).toBe(false);
  });

  it("shows what the wallet check said of the codes found (AUD-037-SEC004)", async () => {
    const harness = decodeHarness("seedshift");
    startMissingCodeSearch(harness.page);
    trace.workerRuns[0]!.resolve({
      kind: "found",
      places: "Code 12",
      codes: fixture.phrase,
      warning: WALLET_WARNING,
    });
    await settlePromises();
    const shown = harness.result.descendants();
    expect(shown.some((node) => node.textContent === WALLET_WARNING)).toBe(true);
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
      expect((trace.decode.mock.lastCall?.[1] as { dates: unknown } | undefined)?.dates).toBe(
        fixture.otherDate,
      );
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
  // A share of the public test phrase in Unicode codes, with the last digit of codes 2, 6 and 10
  // unreadable: a share whose damage Restore repairs, or codes for Decode's search.
  const { records } = splitShares({
    phrase: fixture.phrase,
    mode: "direct",
    dates: undefined,
    threshold: 2,
    count: 3,
    form: "unicode",
  });
  const markedPlaces = [2, 6, 10];
  const codes = mnemocode()
    .writeShare(records[0]!, "unicode")
    .split(" ")
    .map((code, index) => (markedPlaces.includes(index + 1) ? `${code.slice(0, -1)}?` : code))
    .join(" ");
  expect(mnemocode().shareKind(codes)).toBe("either");
  using marked = MnemoCodeMarkedCodes.read(codes, "unicode", "direct", undefined);
  expect(marked?.ways.map(({ way }) => way)).toContain("wallet");
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

describe("MnemoCode Decode layout while the codes fingerprint waits", () => {
  it("keeps the note's line while typing and shows the fingerprint with the result", () => {
    trace.encodedFingerprint.mockReturnValue(fixture.fingerprint);
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

describe("MnemoCode Decode of a SeedStitch legend line", () => {
  // MnemoCode's published SeedStitch example (docs/SEEDSTITCH.md), its first row mistyped.
  const LEGEND =
    "28:1726 25:2163 57:3275 34:3917 9:480 54:1505 17:5063 63:372 46:328 7:2818 62:1114 53:1997 " +
    "37:2496 40:1945 3:882 58:7130 41:180 59:336 22:1634 36:778 64:1147 10:3804 24:1214 69:479 " +
    "56:931 30:2066 23:3224 29:797";

  it("decodes the record the legend holds with the dates, and names the row it corrected", () => {
    const harness = decodeHarness("direct");
    const note = harness.page.require("mnemocode-decode-record-note");
    edit(harness.page.require("mnemocode-input"), LEGEND);
    expect(note.textContent).toContain("SeedStitch legend");
    expect(note.textContent).toContain("Row 1 of the legend did not fit");
    expect(note.classList.contains("warning")).toBe(true);
    // The legend holds a Seedshift record whatever mode is selected.
    expect(harness.page.require("mnemocode-decode-dates-field").hidden).toBe(false);
    trace.decode.mockReturnValueOnce({
      mode: "seedshift",
      format: "indexes",
      checksumValid: true,
      mnemonic: fixture.phrase,
    });
    harness.page.require("decode-mnemocode").click();
    expect(trace.decode).toHaveBeenLastCalledWith(
      expect.stringMatching(/^MNC1:seedshift:indexes:1965 369 /u),
      expect.objectContaining({ dates: fixture.date, words: undefined }),
    );
    expect(
      harness.result
        .querySelectorAll("p")
        .some((line) => line.textContent?.startsWith("Row 1 of the legend did not fit")),
    ).toBe(true);
  });

  it("says in MnemoCode's words why a legend line does not read, and decodes nothing", () => {
    const harness = decodeHarness("direct");
    const partial = LEGEND.split(" ").slice(0, 20).join(" ");
    edit(harness.page.require("mnemocode-input"), partial);
    const note = harness.page.require("mnemocode-decode-record-note");
    expect(note.textContent).toContain("The legend does not read");
    expect(note.classList.contains("warning")).toBe(false);
    expect(harness.page.require("mnemocode-decode-dates-field").hidden).toBe(false);
    harness.page.require("decode-mnemocode").click();
    expect(trace.decode).not.toHaveBeenCalled();
    expect(harness.result.textContent).toContain("The legend does not read");
  });
});

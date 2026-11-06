import { afterEach, expect, it } from "vitest";
import { field, paymentAddressField, type DerivationResult } from "@ckd/core/types.js";
import { PassiveQrPage } from "@ckd/test-support/qr-page.js";
import { renderResults, type ResultsRenderOptions } from "../src/ui/results.js";
import { vi } from "vitest";

function render(mode: "basic" | "advanced") {
  const page = new PassiveQrPage();
  Object.assign(page, {
    createDocumentFragment: () => page.createElement("fragment"),
    createTextNode: (text: string) => {
      const node = page.createElement("text");
      node.textContent = text;
      return node;
    },
  });
  const summary = page.add("summary");
  const list = page.add("list");
  const notices = page.add("notices");
  const calls: { owner: unknown; index: number; address: string }[] = [];
  const selected: { owner: unknown; index: number; checked: boolean }[] = [];
  const windows: { owner: unknown; start: number }[] = [];
  const options: ResultsRenderOptions = {
    mode,
    selected: new Set([0, 1]),
    secretsRevealed: false,
    windowStart: 0,
    windowSize: 1,
    canSignMessages: true,
    encryptedBip38: new Map(),
    onSignMessage(index, address) {
      calls.push({ owner: this, index, address });
    },
    onSelectionChange(index, checked) {
      selected.push({ owner: this, index, checked });
    },
    onWindowChange(start) {
      windows.push({ owner: this, start });
    },
  };
  const result: DerivationResult = {
    id: "synthetic",
    title: "Public fixture",
    networkLabel: "mainnet",
    pathTemplate: "m/i",
    basicSummary: [],
    summary: [],
    notices: [],
    rows: [0, 1].map((index) => ({
      index,
      path: `m/${index}`,
      title: `Public row ${index}`,
      basic: [paymentAddressField("address", "Address", `synthetic-address-${index}`)],
      advanced: [field("publicKey", "Public key", "synthetic public key")],
    })),
  };
  const document = page.asDocument();
  renderResults(
    document.querySelector<HTMLElement>(`#${summary.id}`)!,
    document.querySelector<HTMLElement>(`#${list.id}`)!,
    document.querySelector<HTMLElement>(`#${notices.id}`)!,
    result,
    options,
  );
  return { options, calls, selected, windows, list };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it.each(["basic", "advanced"] as const)(
  "keeps the signing callback receiver in %s results",
  (mode) => {
    const view = render(mode);
    view.list.querySelector("[data-sign-message]")!.click();
    expect(view.calls).toEqual([{ owner: view.options, index: 0, address: "synthetic-address-0" }]);
  },
);

it("keeps selection and paging callback receivers", () => {
  const view = render("basic");
  const select = view.list.querySelector("[data-select-row]")!;
  select.checked = false;
  select.dispatchEvent(new Event("change"));
  const next = view.list.descendants().find((node) => node.textContent === "Next")!;
  next.click();
  expect(view.selected).toEqual([{ owner: view.options, index: 0, checked: false }]);
  expect(view.windows).toEqual([{ owner: view.options, start: 1 }]);
});

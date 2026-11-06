import { afterEach, expect, it, vi } from "vitest";
import { field, type DerivationResult, type DisplayMode } from "@ckd/core/types.js";
import { PassiveQrPage } from "@ckd/test-support/qr-page.js";
import { renderResults, updateSecretVisibility } from "../src/ui/results.js";
import { clearRenderedSecrets, RenderedSecrets } from "../src/ui/secrets.js";

const PRIVATE = "synthetic private fixture\ud800";
const ENCRYPTED = "synthetic encrypted fixture";

function fixture(mode: DisplayMode, grouped = false) {
  const page = new PassiveQrPage();
  Object.assign(page, {
    createDocumentFragment: () => page.createElement("fragment"),
    createTextNode: (text: string) => {
      const node = page.createElement("text");
      node.textContent = text;
      return node;
    },
  });
  const root = page.add("results");
  const summary = page.createElement("div");
  const list = page.createElement("div");
  const notices = page.createElement("div");
  root.append(summary, list, notices);
  const privateField = () => field("privateKey", "Private key", PRIVATE, true);
  const row = {
    index: 0,
    path: "m/0",
    title: "Synthetic row",
    basic: [field("address", "Address", "synthetic public address"), privateField()],
    advanced: [privateField()],
    ...(grouped
      ? {
          groups: [
            { key: "group", title: "Synthetic group", basic: [privateField()], advanced: [] },
          ],
        }
      : {}),
  };
  const result: DerivationResult = {
    id: "synthetic",
    title: "Synthetic result",
    networkLabel: "mainnet",
    pathTemplate: "m/i",
    basicSummary: [privateField()],
    summary: [privateField()],
    notices: [],
    rows: [row],
  };
  const document = page.asDocument();
  const nativeRoot = document.querySelector<HTMLElement>("#results")!;
  const nativeSummary = summary as unknown as HTMLElement;
  const nativeList = list as unknown as HTMLElement;
  const draw = (revealed = false) =>
    renderResults(nativeSummary, nativeList, notices as unknown as HTMLElement, result, {
      mode,
      selected: new Set([0]),
      secretsRevealed: revealed,
      windowStart: 0,
      windowSize: 10,
      canSignMessages: true,
      encryptedBip38: new Map([[0, ENCRYPTED]]),
      onWindowChange() {},
      onSelectionChange() {},
      onSignMessage() {},
    });
  draw();
  return { root, nativeRoot, nativeSummary, nativeList, draw, result };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("revokes a partially constructed presentation after its native attribute write fails", () => {
  const document = new PassiveQrPage().asDocument();
  const node = document.createElement("span");
  node.classList.add("secret-value");
  const native = vi.spyOn(node, "setAttribute").mockImplementation(() => {
    throw new Error("Synthetic private native attribute detail");
  });
  expect(() => new RenderedSecrets(node, PRIVATE, true)).toThrow("ui.secret.cleanup");
  expect(node.textContent).toBe("");
  native.mockRestore();
  RenderedSecrets.setVisible(node, true);
  expect(node.textContent).toBe("");
  using replacement = new RenderedSecrets(node, PRIVATE, true);
  expect(node.textContent).toBe(PRIVATE);
  replacement.wipe();
  expect(node.textContent).toBe("");
});

it("locks every removed owner before a native callback can replace its neighbour", () => {
  const document = new PassiveQrPage().asDocument();
  const root = document.createElement("section");
  const first = document.createElement("span");
  const second = document.createElement("span");
  for (const node of [first, second]) {
    node.classList.add("secret-value");
    new RenderedSecrets(node, PRIVATE, true);
  }
  root.append(first, second);
  const outcomes: string[] = [];
  vi.spyOn(first, "setAttribute").mockImplementation(() => {
    try {
      new RenderedSecrets(second, PRIVATE, true);
      outcomes.push("accepted");
    } catch (cause) {
      outcomes.push(cause instanceof Error ? cause.message : "unexpected");
    }
  });
  RenderedSecrets.clear(root);
  expect(outcomes).toEqual(["ui.secret.retired"]);
  expect(first.textContent).toBe("");
  expect(second.textContent).toBe("");
});

it("retires other private nodes and the parent despite one native cleanup fault", () => {
  const document = new PassiveQrPage().asDocument();
  const root = document.createElement("section");
  const first = document.createElement("span");
  const second = document.createElement("span");
  for (const node of [first, second]) {
    node.classList.add("secret-value");
    new RenderedSecrets(node, PRIVATE, true);
  }
  root.append(first, second);
  vi.spyOn(first, "setAttribute").mockImplementation(() => {
    throw new Error("Synthetic private native attribute detail");
  });
  let failure: unknown;
  try {
    RenderedSecrets.clear(root);
  } catch (cause) {
    failure = cause;
  }
  expect(second.textContent).toBe("");
  expect(root.childElementCount).toBe(0);
  expect(failure).toHaveProperty("code", "ui.secret.cleanup");
  RenderedSecrets.setVisible(second, true);
  expect(second.textContent).toBe("");
});

it("refuses a replacement owner created by a native callback during that node's retirement", () => {
  const document = new PassiveQrPage().asDocument();
  const root = document.createElement("section");
  const node = document.createElement("span");
  node.classList.add("secret-value");
  new RenderedSecrets(node, PRIVATE, true);
  root.append(node);
  let entered = false;
  const outcomes: string[] = [];
  vi.spyOn(node, "setAttribute").mockImplementation(() => {
    if (entered) return;
    entered = true;
    try {
      new RenderedSecrets(node, "synthetic replacement private text", true);
      outcomes.push("accepted");
    } catch (cause) {
      outcomes.push(cause instanceof Error && "code" in cause ? String(cause.code) : "unexpected");
    }
  });
  RenderedSecrets.clear(root);
  expect(outcomes).toEqual(["ui.secret.retired"]);
  expect(node.textContent).toBe("");
});

it("retires removed descendants while preserving a private child explicitly kept in a replacement", () => {
  const page = new PassiveQrPage();
  const document = page.asDocument();
  const root = document.createElement("section");
  const kept = document.createElement("span");
  const removed = document.createElement("span");
  for (const node of [kept, removed]) {
    node.classList.add("secret-value");
    new RenderedSecrets(node, PRIVATE, true);
  }
  root.append(kept, removed);
  RenderedSecrets.replace(root, kept);
  expect(removed.textContent).toBe("");
  expect(kept.textContent).toBe(PRIVATE);
  RenderedSecrets.setVisible(root, false);
  RenderedSecrets.setVisible(root, true);
  expect(kept.textContent).toBe(PRIVATE);
  RenderedSecrets.text(root, "Synthetic public status");
  expect(kept.textContent).toBe("");
  expect(root.textContent).toBe("Synthetic public status");
  RenderedSecrets.setVisible(kept, true);
  expect(kept.textContent).toBe("");
});

it.each(["basic", "advanced"] as const)(
  "keeps a private-labelled address out of public headers and signing attributes in %s mode",
  (mode) => {
    const setup = fixture(mode);
    const address = setup.result.rows[0]!.basic[0]!;
    Object.assign(address, { secret: true, role: "paymentAddress", value: PRIVATE });
    setup.draw();
    expect(setup.root.descendants().some((node) => node.textContent === PRIVATE)).toBe(false);
    expect(setup.root.querySelectorAll("[data-sign-address]")).toHaveLength(0);
  },
);

it.each([
  { mode: "basic", grouped: false },
  { mode: "advanced", grouped: false },
  { mode: "basic", grouped: true },
] as const)("keeps concealed $mode result text out of native nodes (grouped=$grouped)", (kind) => {
  const setup = fixture(kind.mode, kind.grouped);
  const nodes = setup.root.querySelectorAll(".secret-value");
  expect(nodes.length).toBeGreaterThan(0);
  expect(nodes.every((node) => node.textContent === "Hidden")).toBe(true);
  expect(
    setup.root.descendants().some((node) => node.textContent === "synthetic public address"),
  ).toBe(true);
});

it.each(["basic", "advanced"] as const)(
  "releases visible text on concealment in %s mode",
  (mode) => {
    const setup = fixture(mode);
    const nodes = setup.root.querySelectorAll(".secret-value");
    updateSecretVisibility(setup.nativeRoot, true);
    expect(nodes.every((node) => [PRIVATE, ENCRYPTED].includes(node.textContent))).toBe(true);
    updateSecretVisibility(setup.nativeRoot, false);
    expect(nodes.every((node) => node.textContent === "Hidden")).toBe(true);
    expect(nodes.every((node) => node.getAttribute("aria-hidden") === "true")).toBe(true);
    updateSecretVisibility(setup.nativeRoot, true);
    expect(nodes.every((node) => [PRIVATE, ENCRYPTED].includes(node.textContent))).toBe(true);
  },
);

it("retires old native nodes before replacing a visible result", () => {
  const setup = fixture("advanced");
  updateSecretVisibility(setup.nativeRoot, true);
  const retired = setup.root.querySelectorAll(".secret-value");
  setup.draw();
  expect(retired.every((node) => node.textContent === "")).toBe(true);
  for (const node of retired) updateSecretVisibility(node as unknown as HTMLElement, true);
  expect(retired.every((node) => node.textContent === "")).toBe(true);
});

it("revokes retired text after Clear while allowing a new result to be revealed", () => {
  const setup = fixture("basic");
  updateSecretVisibility(setup.nativeRoot, true);
  const retired = setup.root.querySelectorAll(".secret-value");
  clearRenderedSecrets(setup.nativeSummary);
  clearRenderedSecrets(setup.nativeList);
  for (const node of retired) updateSecretVisibility(node as unknown as HTMLElement, true);
  expect(retired.every((node) => node.textContent === "")).toBe(true);
  setup.draw(true);
  expect(
    setup.root
      .querySelectorAll(".secret-value")
      .every((node) => [PRIVATE, ENCRYPTED].includes(node.textContent)),
  ).toBe(true);
});

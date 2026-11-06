// Passive delayed canvas callbacks and synthetic matrices; no image or QR encoding runs.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QrPngExport, createPaymentQrAction, createQrAction } from "../src/payment-qr.js";
import { renderSensitiveShares } from "../../../apps/key-derivation/src/ui/recovery-workspace-shared.js";
import {
  concealedContainer,
  concealedWith,
} from "../../../apps/key-derivation/src/ui/recovery-mhfe-cards.js";
import { QrActionLifecycle } from "../src/qr-action-lifecycle.js";
import { PassiveQrPage } from "@ckd/test-support/qr-page.js";
import { RecoveryJobGate } from "../../../apps/key-derivation/src/ui/recovery-job-gate.js";
import {
  type RecoveryTestElement,
  settlePromises,
} from "../../../apps/key-derivation/tests/fake-recovery-page.js";

const PUBLIC_PAYLOAD = "public synthetic QR payload";
const PUBLIC_BLOB = new Blob(["public passive PNG fixture"], { type: "image/png" });
const trace = vi.hoisted(() => ({
  encode: vi.fn(),
  download: vi.fn(),
  matrices: [] as { matrix: boolean[][]; rows: boolean[][] }[],
}));

vi.mock("uqr", () => ({ encode: trace.encode }));
vi.mock("@ckd/export/download.js", () => ({ downloadBlob: trace.download }));
vi.mock("@ckd/ui/qr-image-import.js", () => ({ installQrImageImport: vi.fn() }));

let page: PassiveQrPage;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  trace.matrices.length = 0;
  trace.encode.mockImplementation(() => {
    const matrix = [
      [true, false],
      [false, true],
    ];
    trace.matrices.push({ matrix, rows: [...matrix] });
    return { data: matrix };
  });
  page = new PassiveQrPage();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function attach(element: HTMLElement): void {
  page.body.append(element as unknown as RecoveryTestElement);
}

function control(root: HTMLElement, selector: string): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>(selector);
  if (button === null) throw new Error(`Passive QR fixture lacks ${selector}.`);
  return button;
}

function expectCleared(): void {
  for (const canvas of page.canvases) {
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  }
  for (const { matrix, rows } of trace.matrices) {
    expect(matrix).toHaveLength(0);
    expect(rows.every((row) => row.every((value) => value === false))).toBe(true);
  }
}

it.each(["blur", "hidden", "pagehide"] as const)(
  "conceals companion repair words and an open pinned QR after %s",
  (event) => {
    const jobs = new RecoveryJobGate();
    jobs.setReady(true);
    const { output, actions } = concealedContainer(PUBLIC_PAYLOAD, "Public test container", {
      jobs,
      writeClipboard: async () => undefined,
    });
    const companion = page.createElement("p");
    companion.textContent = "public synthetic repaired words";
    concealedWith(companion as unknown as HTMLElement, output, actions);
    attach(output);
    attach(actions);
    page.body.append(companion);
    control(actions, "button").click();
    expect(companion.classList.contains("concealed")).toBe(false);
    control(actions, ".qr-trigger").click();
    const popover = actions.querySelector<HTMLElement>(".payment-qr-popover")!;
    expect(popover.hidden).toBe(false);
    if (event === "pagehide") page.window.dispatchEvent(new Event("pagehide"));
    else page.hideOrBlur(event);
    expect(output.classList.contains("concealed")).toBe(true);
    expect(companion.classList.contains("concealed")).toBe(true);
    expect(popover.hidden).toBe(true);
    expect(control(actions, ".qr-trigger").getAttribute("aria-expanded")).toBe("false");
  },
);

it("registers one Window lifecycle for repeated public widgets and disposes detached results", () => {
  const add = vi.spyOn(page.window, "addEventListener");
  const container = page.add("replaceable-qr-result");
  for (let count = 0; count < 12; count += 1) {
    const action = createPaymentQrAction(page.asDocument(), PUBLIC_PAYLOAD, "Public fixture");
    container.append(action as unknown as RecoveryTestElement);
    control(action, ".qr-trigger").click();
    expect(action.querySelector(".payment-qr-payload")).not.toBeNull();
    container.replaceChildren();
    page.deliverRemoved(action as unknown as RecoveryTestElement);
    expect(action.querySelector(".payment-qr-payload")).toBeNull();
    expect(action.dataset.qrAction).toBeUndefined();
    // A retained, reattached widget stays revoked; a fresh widget gets its own authority.
    container.append(action as unknown as RecoveryTestElement);
    control(action, ".qr-trigger").click();
    expect(control(action, ".qr-trigger").getAttribute("aria-expanded")).toBe("false");
    QrActionLifecycle.disposeWithin(action);
    container.replaceChildren();
  }
  expect(add.mock.calls.filter(([name]) => name === "pagehide")).toHaveLength(1);
  expect(add.mock.calls.filter(([name]) => name === "resize")).toHaveLength(1);
});

it.each(["blur", "hidden"] as const)("conceals an MHFE card after %s", (event) => {
  const jobs = new RecoveryJobGate();
  jobs.setReady(true);
  const access = { jobs, writeClipboard: vi.fn(async () => undefined) };
  const { output, actions } = concealedContainer(PUBLIC_PAYLOAD, "Public test container", access);
  attach(output);
  attach(actions);
  control(actions, "button").click();
  expect(output.classList.contains("concealed")).toBe(false);
  page.hideOrBlur(event);
  expect(output.classList.contains("concealed")).toBe(true);
  expect(control(actions, ".secret-action").disabled).toBe(true);
});

it.each([false, true])("guards MHFE QR after readiness loss (reopened=%s)", async (reopened) => {
  const jobs = new RecoveryJobGate();
  jobs.setReady(true);
  const access = { jobs, writeClipboard: vi.fn(async () => undefined) };
  const { output, actions } = concealedContainer(PUBLIC_PAYLOAD, "Public test container", access);
  attach(output);
  attach(actions);
  control(actions, ".qr-trigger").click();
  expect(trace.encode).not.toHaveBeenCalled();
  control(actions, "button").click();
  control(actions, ".qr-trigger").click();
  const save = control(actions, ".payment-qr-save");
  save.click();
  expect(page.pending).toHaveLength(1);
  jobs.setReady(false);
  if (reopened) jobs.setReady(true);
  page.pending[0]!(PUBLIC_BLOB);
  await settlePromises();
  expect(trace.download).not.toHaveBeenCalled();
  expect(save.textContent).not.toBe("Saved PNG");
  expectCleared();
});

it("refuses before encoding when its current predicate is false", async () => {
  const current = vi.fn(() => false);
  await expect(
    new QrPngExport(page.asDocument()).save(PUBLIC_PAYLOAD, "M", "Public", current),
  ).resolves.toBe(false);
  expect(current).toHaveBeenCalledOnce();
  expect(trace.encode).not.toHaveBeenCalled();
  expect(page.canvases).toHaveLength(0);
  expect(trace.download).not.toHaveBeenCalled();
});

it("checks permission again after delayed encoding and clears cancelled buffers", async () => {
  let allowed = true;
  const current = vi.fn(() => allowed);
  const saving = new QrPngExport(page.asDocument()).save(PUBLIC_PAYLOAD, "M", "Public", current);
  expect(page.pending).toHaveLength(1);
  expect(page.canvases[0]!.width).toBeGreaterThan(0);
  allowed = false;
  page.pending[0]!(PUBLIC_BLOB);
  await expect(saving).resolves.toBe(false);
  expect(current).toHaveBeenCalledTimes(2);
  expect(trace.download).not.toHaveBeenCalled();
  expectCleared();
});

it("publishes once when current and clears successful buffers", async () => {
  const current = vi.fn(() => true);
  const saving = new QrPngExport(page.asDocument()).save(PUBLIC_PAYLOAD, "M", "Public", current);
  page.pending[0]!(PUBLIC_BLOB);
  await expect(saving).resolves.toBe(true);
  expect(current).toHaveBeenCalledTimes(2);
  expect(trace.download).toHaveBeenCalledExactlyOnceWith(PUBLIC_BLOB, "public-qr.png");
  expectCleared();
});

it("clears buffers when toBlob returns null", async () => {
  const saving = new QrPngExport(page.asDocument()).save(PUBLIC_PAYLOAD, "M", "Public");
  page.pending[0]!(null);
  await expect(saving).rejects.toThrow("could not encode the QR image");
  expect(trace.download).not.toHaveBeenCalled();
  expectCleared();
});

it.each(["context", "blob"] as const)("clears buffers after a %s failure", async (failure) => {
  page.failure = failure;
  await expect(
    new QrPngExport(page.asDocument()).save(PUBLIC_PAYLOAD, "M", "Public"),
  ).rejects.toThrow();
  expect(trace.download).not.toHaveBeenCalled();
  expectCleared();
});

it("clears buffers when publication throws", async () => {
  trace.download.mockImplementationOnce(() => {
    throw new Error("Synthetic publication failure.");
  });
  const saving = new QrPngExport(page.asDocument()).save(PUBLIC_PAYLOAD, "M", "Public");
  page.pending[0]!(PUBLIC_BLOB);
  await expect(saving).rejects.toThrow("Synthetic publication failure.");
  expectCleared();
});

it("requires both connected actions and caller permission before Show or Save", async () => {
  let allowed = true;
  const action = createQrAction(page.asDocument(), PUBLIC_PAYLOAD, "Public", PUBLIC_PAYLOAD, {
    current: () => allowed,
  });
  const trigger = control(action, ".qr-trigger");
  trigger.click();
  expect(trace.encode).not.toHaveBeenCalled();
  attach(action);
  allowed = false;
  trigger.click();
  expect(trace.encode).not.toHaveBeenCalled();
  allowed = true;
  trigger.click();
  expect(trace.encode).toHaveBeenCalledOnce();
  allowed = false;
  control(action, ".payment-qr-save").click();
  await settlePromises();
  expect(page.canvases).toHaveLength(0);
  expect(trace.download).not.toHaveBeenCalled();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expectCleared();
});

it.each(["owner", "detached", "pagehide"])(
  "does not label an export Saved after %s invalidation",
  async (reason) => {
    let allowed = true;
    const action = createQrAction(page.asDocument(), PUBLIC_PAYLOAD, "Public", PUBLIC_PAYLOAD, {
      current: () => allowed,
    });
    attach(action);
    control(action, ".qr-trigger").click();
    const save = control(action, ".payment-qr-save");
    save.click();
    if (reason === "owner") allowed = false;
    else if (reason === "pagehide") page.window.dispatchEvent(new Event("pagehide"));
    else action.remove();
    page.pending[0]!(PUBLIC_BLOB);
    await settlePromises();
    expect(trace.download).not.toHaveBeenCalled();
    expect(save.textContent).toBe("Save as PNG");
    expect(control(action, ".qr-trigger").getAttribute("aria-expanded")).toBe("false");
    expectCleared();
  },
);

it("keeps departed widgets revoked while allowing a fresh public widget", () => {
  const old = createPaymentQrAction(page.asDocument(), PUBLIC_PAYLOAD, "Old payment");
  attach(old);
  control(old, ".qr-trigger").click();
  page.window.dispatchEvent(new Event("pagehide"));
  control(old, ".qr-trigger").click();
  expect(control(old, ".qr-trigger").getAttribute("aria-expanded")).toBe("false");
  const fresh = createPaymentQrAction(page.asDocument(), PUBLIC_PAYLOAD, "New payment");
  attach(fresh);
  control(fresh, ".qr-trigger").click();
  expect(control(fresh, ".qr-trigger").getAttribute("aria-expanded")).toBe("true");
  expect(trace.encode).toHaveBeenCalledTimes(2);
  expectCleared();
});

it("keeps public payment PNG export working without an optional predicate", async () => {
  const action = createPaymentQrAction(page.asDocument(), "bitcoin:public-fixture", "Payment");
  attach(action);
  control(action, ".qr-trigger").click();
  const save = control(action, ".payment-qr-save");
  save.click();
  page.pending[0]!(PUBLIC_BLOB);
  await settlePromises();
  expect(trace.download).toHaveBeenCalledExactlyOnceWith(PUBLIC_BLOB, "payment-qr.png");
  expect(save.textContent).toBe("Saved PNG");
  expectCleared();
});

it.each(["concealed", "owner", "detached", "pagehide"])(
  "uses the real sensitive-card predicate after %s invalidation",
  async (reason) => {
    let allowed = true;
    const container = page.add("public-share-result");
    renderSensitiveShares(
      container as unknown as HTMLElement,
      [PUBLIC_PAYLOAD],
      vi.fn(async () => undefined),
      [],
      [],
      () => allowed,
    );
    const root = container as unknown as HTMLElement;
    const text = root.querySelector<HTMLElement>(".share-secret")!;
    text.classList.remove("concealed");
    control(root, ".qr-trigger").click();
    const save = control(root, ".payment-qr-save");
    save.click();
    if (reason === "concealed") text.classList.add("concealed");
    else if (reason === "owner") allowed = false;
    else if (reason === "pagehide") page.window.dispatchEvent(new Event("pagehide"));
    else container.replaceChildren();
    page.pending[0]!(PUBLIC_BLOB);
    await settlePromises();
    expect(trace.download).not.toHaveBeenCalled();
    expect(save.textContent).not.toBe("Saved PNG");
    expectCleared();
  },
);

it("guards sensitive Copy, Copy all and QR against unrevealed or stale cards", async () => {
  let allowed = true;
  const copy = vi.fn(async () => undefined);
  const container = page.add("public-share-result");
  renderSensitiveShares(
    container as unknown as HTMLElement,
    [PUBLIC_PAYLOAD, "second public synthetic payload"],
    copy,
    [],
    [],
    () => allowed,
  );
  const root = container as unknown as HTMLElement;
  const cards = [...root.querySelectorAll<HTMLElement>("article")];
  const texts = [...root.querySelectorAll<HTMLElement>(".share-secret")];
  const buttons = [...root.querySelectorAll<HTMLButtonElement>(".secret-copy-action")];
  // Dispatch bypasses disabled buttons to prove the callback's predicate, not presentation alone.
  const pressCopy = (): void => {
    for (const button of buttons) button.dispatchEvent(new Event("click"));
  };
  pressCopy();
  control(root, ".qr-trigger").click();
  expect(copy).not.toHaveBeenCalled();
  expect(trace.encode).not.toHaveBeenCalled();
  texts[0]!.classList.remove("concealed");
  pressCopy();
  await settlePromises();
  expect(copy).toHaveBeenCalledExactlyOnceWith(PUBLIC_PAYLOAD);
  copy.mockClear();
  texts[1]!.classList.remove("concealed");
  buttons[2]!.dispatchEvent(new Event("click"));
  await settlePromises();
  expect(copy).toHaveBeenCalledExactlyOnceWith(
    `${PUBLIC_PAYLOAD}\nsecond public synthetic payload`,
  );
  copy.mockClear();
  allowed = false;
  pressCopy();
  expect(copy).not.toHaveBeenCalled();
  allowed = true;
  cards[0]!.remove();
  buttons[0]!.dispatchEvent(new Event("click"));
  buttons[2]!.dispatchEvent(new Event("click"));
  expect(copy).not.toHaveBeenCalled();
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MnemoCodeCardFile,
  MnemoCodeCardRasterizer,
  MnemoCodeCardRequest,
  MnemoCodeSampleRequest,
  MnemoCodeShareCardRequest,
} from "@ckd/recovery-backup/mnemocode-cards.js";
import type { HeldShares } from "../src/ui/recovery-mnemocode-share-store.js";
import type { CardPageDrawing } from "../../../packages/recovery-mnemocode/source/export/card-drawing.js";

type Request = MnemoCodeCardRequest | MnemoCodeSampleRequest | MnemoCodeShareCardRequest;

interface PendingRender {
  readonly kind: "phrase" | "shares" | "sample";
  readonly request: Request;
  readonly resolve: (file: MnemoCodeCardFile) => void;
  readonly reject: (cause: Error) => void;
}

const fixture = vi.hoisted(() => ({
  calls: [] as PendingRender[],
  rasterize: undefined as MnemoCodeCardRasterizer | undefined,
  shares: undefined as HeldShares | undefined,
  shareListeners: new Set<() => void>(),
  forgetDetails: vi.fn(),
  readPages: vi.fn<(pdf: Uint8Array) => Promise<CardPageDrawing[]>>(),
}));

vi.mock("@ckd/recovery-backup/mnemocode-cards.js", async () => {
  const { resolveSskrLayout } =
    await import("../../../packages/recovery-mnemocode/source/export/sskr-content.js");
  const { parsePageSize } =
    await import("../../../packages/recovery-mnemocode/source/export/card-settings.js");
  const render = (kind: PendingRender["kind"], request: Request): Promise<MnemoCodeCardFile> =>
    new Promise((resolve, reject) => fixture.calls.push({ kind, request, resolve, reject }));
  return {
    createMnemoCodeCardExporter: (_readAsset: unknown, rasterize: MnemoCodeCardRasterizer) => {
      fixture.rasterize = rasterize;
      return {
        render: (request: Request) => render("phrase", request),
        renderShares: (request: Request) => render("shares", request),
        renderSamples: (request: Request) => render("sample", request),
        forgetDetails: fixture.forgetDetails,
      };
    },
    MNEMOCODE_CARD_FILE_FORMATS: ["pdf", "png", "jpg"].map((id) => ({ id, label: id })),
    MNEMOCODE_CARD_PAGE_SIZES: ["a6", "a5", "a4", "business"].map((id) => ({ id, label: id })),
    MNEMOCODE_CARD_TEMPLATES: [{ id: "synthetic-design", name: "Synthetic design" }],
    MNEMOCODE_SAMPLE_WORD_COUNTS: [12, 24],
    mnemoCodeCardOutput: (size: string) => (size === "business" ? "individual" : "collection"),
    mnemoCodeShareCardLayout: (size?: string, layout?: "qr") =>
      resolveSskrLayout(layout, parsePageSize(size === "" ? undefined : size)),
    mnemoCodeCardSavedNote: (file: MnemoCodeCardFile) => `Saved ${file.fileName}.`,
    mnemoCodeCardSelfTest: () => ({}),
    createMnemoCodeCardRenderer: () => ({}),
    mnemoCodeCardTexts: () => ["studioName"],
    mnemoCodeFormatHasCards: (format: string) => format === "colors",
  };
});

vi.mock("@ckd/recovery-backup/mnemocode-card-assets.js", () => ({
  readMnemoCodeCardAsset: () => {
    throw new Error("The passive renderer must not read assets.");
  },
}));
vi.mock("@ckd/recovery-backup/mnemocode.js", () => ({
  mnemoCodeDatesFor: () => [],
}));
vi.mock("../src/ui/recovery-mnemocode-self-test.js", () => ({
  mnemoCodeSelfTest: { addCheck: () => undefined, addFeature: () => undefined },
}));
vi.mock("../../../packages/recovery-mnemocode/source/export/card-sets-self-test.js", () => ({
  cardSetsSelfTest: () => ({}),
}));
vi.mock("@ckd/recovery-backup/mnemocode-share-card-checks.js", () => ({
  shareCardChecks: undefined,
}));
vi.mock("../../../packages/recovery-mnemocode/source/sskr/transport.js", () => ({
  shareFormatHasCards: (format: string) => format === "colors",
}));
vi.mock("../../../packages/recovery-mnemocode/source/sskr/share-set.js", () => ({
  SHARE_FORMAT_NAMES: { colors: "Synthetic colors" },
}));
vi.mock("../src/ui/recovery-mnemocode-share-store.js", () => ({
  latestShares: {
    get shares() {
      return fixture.shares;
    },
    onChange: (listener: () => void) => fixture.shareListeners.add(listener),
  },
}));
vi.mock("../src/ui/recovery-workspace-shared.js", () => ({
  required: (selector: string) => {
    const element = document.querySelector(selector);
    if (element === null) throw new Error(`Missing fixture control ${selector}.`);
    return element;
  },
}));
vi.mock("@ckd/ui/payment-qr.js", () => ({
  createQrAction: vi.fn(() => document.createElement("span")),
}));
vi.mock("../../../packages/recovery-mnemocode/source/export/card-drawing.js", () => ({
  readCardPages: fixture.readPages,
}));

import * as downloads from "@ckd/export/download.js";
import { createQrAction } from "@ckd/ui/payment-qr.js";
import { cardPagesAsImages } from "../src/ui/recovery-mnemocode-card-images.js";
import { recoveryFeature } from "../src/ui/recovery-mnemocode-cards.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import type { RecoveryFeatureContext } from "../src/ui/recovery-workspace-shared.js";

/** DOM state only: no canvas, asset, PDF parser, wallet operation or browser is executed. */
class ElementStub extends EventTarget {
  value = "";
  checked = false;
  disabled = false;
  hidden = false;
  open = false;
  textContent = "";
  type = "text";
  href = "";
  download = "";
  rel = "";
  children: ElementStub[] = [];
  parent: ElementStub | undefined;
  readonly dataset: Record<string, string> = {};
  readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    contains: (name: string) => this.classes.has(name),
  };

  constructor(readonly tagName = "INPUT") {
    super();
  }

  get childElementCount(): number {
    return this.children.length;
  }

  append(child: ElementStub): void {
    child.parent = this;
    this.children.push(child);
    if (this.tagName === "SELECT" && this.value === "") this.value = child.value;
  }

  replaceChildren(...children: ElementStub[]): void {
    for (const child of this.children) child.parent = undefined;
    this.children = [];
    for (const child of children) this.append(child);
  }

  closest(selector: string): ElementStub | null {
    if (selector !== "[hidden]") return null;
    if (this.hidden) return this;
    return this.parent?.closest(selector) ?? null;
  }

  click(): void {
    this.dispatchEvent(new Event("click"));
  }

  remove(): void {
    if (this.parent !== undefined)
      this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = undefined;
  }
}

class CustomEventStub<T> extends Event {
  readonly detail: T | undefined;

  constructor(type: string, init?: CustomEventInit<T>) {
    super(type, init);
    this.detail = init?.detail;
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await vi.runOnlyPendingTimersAsync();
}

/** All completion is controlled by the test; these bytes are synthetic, not rendered output. */
function file(): MnemoCodeCardFile {
  return {
    fileName: "synthetic-cards.pdf",
    mimeType: "application/pdf",
    bytes: new Uint8Array([1, 2, 3]),
    cards: 1,
    printed: { name: "Synthetic", company: "Fixture", studio: "Fixture" },
    qrCodes: [{ reference: "cards", payload: "synthetic payload" }],
  };
}

function page() {
  const elements = new Map<string, ElementStub>();
  const section = new ElementStub("DETAILS");
  elements.set("#mnemocode-cards-section", section);
  const external = new Set([
    "#mnemocode-source",
    "#mnemocode-encode-mode",
    "#mnemocode-encode-dates",
    "#mnemocode-encode-format",
    "#clear-all",
  ]);
  const element = (selector: string): ElementStub => {
    let found = elements.get(selector);
    if (found === undefined) {
      const select = /(?:format|page-size|orientation|template|sample-words|encode-mode)$/u.test(
        selector,
      );
      found = new ElementStub(
        select ? "SELECT" : selector.endsWith("source") ? "TEXTAREA" : "INPUT",
      );
      if (!external.has(selector)) found.parent = section;
      if (/(?:source-phrase|source-shares)$/u.test(selector)) found.type = "radio";
      if (/(?:own-details|sample-all|share-qr|card-qr)$/u.test(selector)) found.type = "checkbox";
      elements.set(selector, found);
    }
    return found;
  };
  element("#mnemocode-source").value = "synthetic original phrase";
  element("#mnemocode-encode-mode").value = "direct";
  element("#mnemocode-encode-format").value = "colors";
  element("#mnemocode-card-source-phrase").checked = true;
  element("#mnemocode-card-source-shares");
  element("#mnemocode-card-share-qr");
  element("#clear-all");
  const body = new ElementStub("BODY");
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), {
    body,
    defaultView: window,
    querySelector: element,
    createElement: (tag: string) => new ElementStub(tag.toUpperCase()),
  });
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  vi.stubGlobal("CustomEvent", CustomEventStub);
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic-card");
  const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const download = vi.spyOn(downloads, "downloadBlob");
  const jobs = new RecoveryJobGate();
  jobs.setReady(true);
  const readMnemonic = vi.fn(() => element("#mnemocode-source").value);
  recoveryFeature.install({ jobs, readMnemonic } as unknown as RecoveryFeatureContext);
  const edit = (selector: string, value: string, type = "input"): void => {
    const target = element(selector);
    target.value = value;
    const event = new Event(type);
    Object.defineProperty(event, "target", { value: target });
    target.dispatchEvent(event);
    if (!external.has(selector)) section.dispatchEvent(event);
  };
  return {
    element,
    edit,
    jobs,
    document,
    window,
    download,
    createUrl,
    revokeUrl,
    readMnemonic,
    press(sample = false): void {
      element(sample ? "#mnemocode-card-sample" : "#export-mnemocode-cards").click();
    },
    async frame(): Promise<void> {
      for (const callback of frames.splice(0)) callback(0);
      await vi.runOnlyPendingTimersAsync();
    },
    status(): string {
      return element("#mnemocode-cards-status").textContent;
    },
    previews(): number {
      return element("#mnemocode-cards-qr-images").childElementCount;
    },
  };
}

/** A passive canvas records only the health swatches; page painting and encoding are inert. */
function canvasHost(view: ReturnType<typeof page>, encoded = deferred<ArrayBuffer>()) {
  const started = deferred<void>();
  const canvases: { width: number; height: number }[] = [];
  vi.spyOn(view.document, "createElement").mockImplementation((tag) => {
    if (tag !== "canvas") return new ElementStub(tag.toUpperCase());
    const pixels: number[] = [];
    const context = {
      fillStyle: "",
      setTransform: () => undefined,
      fillRect() {
        const color = /^rgb\((\d+), (\d+), (\d+)\)$/u.exec(this.fillStyle);
        if (color !== null) pixels.push(...color.slice(1).map(Number), 255);
      },
      getImageData: () => ({ data: new Uint8ClampedArray(pixels) }),
    };
    const canvas = Object.assign(new ElementStub("CANVAS"), {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob(callback: BlobCallback) {
        started.resolve(undefined);
        callback({ arrayBuffer: () => encoded.promise } as Blob);
      },
    });
    canvases.push(canvas);
    return canvas;
  });
  return { canvases, encoded, started };
}

beforeEach(() => {
  vi.useFakeTimers();
  fixture.calls.length = 0;
  fixture.shares = undefined;
  fixture.shareListeners.clear();
  fixture.readPages.mockReset();
  fixture.forgetDetails.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("MnemoCode card export job ownership", () => {
  it("serializes presses and publishes the unchanged captured source", async () => {
    const view = page();
    view.press();
    const status = view.status();
    view.press(true);
    expect(view.status()).toBe(status);
    expect(view.element("#mnemocode-card-sample").disabled).toBe(true);
    await view.frame();
    expect(fixture.calls).toHaveLength(1);
    expect(fixture.calls[0]!.request).toMatchObject({ mnemonic: "synthetic original phrase" });
    const output = file();
    fixture.calls[0]!.resolve(output);
    await settle();
    expect(view.download).toHaveBeenCalledOnce();
    expect(view.createUrl).toHaveBeenCalledOnce();
    expect(view.revokeUrl).toHaveBeenCalledWith("blob:synthetic-card");
    expect(view.document.body.childElementCount).toBe(0);
    expect(view.previews()).toBe(1);
    expect(output.bytes).toEqual(new Uint8Array(3));
    expect(view.jobs.runningJob).toBeNull();
    expect(view.element("#export-mnemocode-cards").disabled).toBe(false);
  });

  it("shares the gate with another panel and does not read a source when refused", async () => {
    const view = page();
    const held = deferred<void>();
    const running = view.jobs.runHeavy("Synthetic other job", () => held.promise);
    view.press();
    view.press(true);
    await view.frame();
    expect(fixture.calls).toEqual([]);
    expect(view.readMnemonic).not.toHaveBeenCalled();
    expect(view.element("#mnemocode-card-sample").disabled).toBe(true);
    held.resolve(undefined);
    await running;
    expect(view.element("#mnemocode-card-sample").disabled).toBe(false);
  });

  it.each([
    "#mnemocode-source",
    "#mnemocode-encode-dates",
    "#mnemocode-card-title",
    "#mnemocode-card-name",
    "#mnemocode-card-studio",
    "#mnemocode-card-slogan",
    "#mnemocode-card-subtitle",
    "#mnemocode-card-footer",
    "#mnemocode-card-reference-label",
  ])("drops late output after editing %s", async (selector) => {
    const view = page();
    view.press();
    await view.frame();
    view.edit(selector, "synthetic changed text");
    const output = file();
    fixture.calls[0]!.resolve(output);
    await settle();
    expect(view.download).not.toHaveBeenCalled();
    expect(view.createUrl).not.toHaveBeenCalled();
    expect(view.previews()).toBe(0);
    expect(view.status()).toMatch(/nothing was saved/u);
    expect(output.bytes).toEqual(new Uint8Array(3));
  });

  it.each([
    "#mnemocode-encode-mode",
    "#mnemocode-encode-format",
    "#mnemocode-card-template",
    "#mnemocode-card-page-size",
    "#mnemocode-card-orientation",
    "#mnemocode-card-file-format",
    "#mnemocode-card-qr",
    "#mnemocode-card-share-qr",
    "#mnemocode-card-own-details",
    "#mnemocode-card-source-shares",
  ])("drops late output after changing %s", async (selector) => {
    const view = page();
    view.press();
    await view.frame();
    view.edit(selector, "colors", "change");
    fixture.calls[0]!.resolve(file());
    await settle();
    expect(view.download).not.toHaveBeenCalled();
    expect(view.previews()).toBe(0);
  });

  it("captures before the frame and skips rendering after an intervening edit", async () => {
    const view = page();
    view.press();
    expect(view.readMnemonic).toHaveBeenCalledOnce();
    view.edit("#mnemocode-card-file-format", "png", "change");
    await view.frame();
    expect(fixture.calls).toEqual([]);
    expect(view.download).not.toHaveBeenCalled();
    expect(view.jobs.runningJob).toBeNull();
  });

  it("keeps a capture across the repeated blur change of an already counted edit", async () => {
    const view = page();
    view.edit("#mnemocode-card-title", "synthetic title");
    view.press();
    await view.frame();
    view.edit("#mnemocode-card-title", "synthetic title", "change");
    expect(fixture.calls[0]!.request).toMatchObject({ title: "synthetic title" });
    fixture.calls[0]!.resolve(file());
    await settle();
    expect(view.download).toHaveBeenCalledOnce();
  });

  it.each(["source", "shares", "clear", "pagehide", "not-ready"])(
    "invalidates pending samples on %s and keeps stale errors off the status line",
    async (cause) => {
      const view = page();
      view.press(true);
      await view.frame();
      expect(fixture.calls[0]!.kind).toBe("sample");
      expect(view.readMnemonic).not.toHaveBeenCalled();
      if (cause === "source")
        view.document.dispatchEvent(
          new CustomEvent("recovery-source-change", { detail: "mnemocode" }),
        );
      else if (cause === "shares") for (const listener of fixture.shareListeners) listener();
      else if (cause === "clear") view.element("#clear-all").click();
      else if (cause === "pagehide") view.window.dispatchEvent(new Event("pagehide"));
      else view.jobs.setReady(false);
      const status = view.status();
      fixture.calls[0]!.reject(new Error("Synthetic obsolete error."));
      await settle();
      expect(view.status()).toBe(status);
      expect(view.download).not.toHaveBeenCalled();
      expect(view.previews()).toBe(0);
      expect(view.element("#mnemocode-card-sample").disabled).toBe(cause === "not-ready");
    },
  );

  it.each(["#mnemocode-card-sample-words", "#mnemocode-card-sample-all"])(
    "drops sample output after changing %s",
    async (selector) => {
      const view = page();
      view.press(true);
      await view.frame();
      view.edit(selector, "24", "change");
      fixture.calls[0]!.resolve(file());
      await settle();
      expect(view.download).not.toHaveBeenCalled();
      expect(view.previews()).toBe(0);
    },
  );

  it("copies share records and drops output after a new set is offered", async () => {
    const view = page();
    const records = ["synthetic share one", "synthetic share two"];
    fixture.shares = { records, form: "colors", masked: true, origin: "repair" };
    for (const listener of fixture.shareListeners) listener();
    view.element("#mnemocode-card-source-shares").checked = true;
    view.element("#mnemocode-card-source-phrase").checked = false;
    view.press();
    await view.frame();
    records[0] = "synthetic replacement";
    expect(fixture.calls[0]!.kind).toBe("shares");
    expect(fixture.calls[0]!.request).toMatchObject({
      records: ["synthetic share one", "synthetic share two"],
      masked: true,
    });
    for (const listener of fixture.shareListeners) listener();
    fixture.calls[0]!.resolve(file());
    await settle();
    expect(view.download).not.toHaveBeenCalled();
  });

  it("forgets retained private share plans immediately on replacement or clearing", () => {
    page();
    fixture.shares = {
      records: ["synthetic share"],
      form: "colors",
      masked: false,
      origin: "repair",
    };
    for (const listener of fixture.shareListeners) listener();
    expect(fixture.forgetDetails).toHaveBeenCalledTimes(1);
    fixture.shares = undefined;
    for (const listener of fixture.shareListeners) listener();
    expect(fixture.forgetDetails).toHaveBeenCalledTimes(2);
    expect(fixture.calls).toEqual([]);
  });

  it("clears published QR previews on setting edits, clear and pagehide", async () => {
    const view = page();
    for (const clear of [
      () => view.edit("#mnemocode-card-title", "synthetic new title"),
      () => view.element("#clear-all").click(),
      () => view.window.dispatchEvent(new Event("pagehide")),
    ]) {
      view.press();
      await view.frame();
      fixture.calls.at(-1)!.resolve(file());
      await settle();
      expect(view.previews()).toBe(1);
      clear();
      expect(view.previews()).toBe(0);
      expect(view.element("#mnemocode-cards-qr-images").hidden).toBe(true);
    }
    expect(createQrAction).toHaveBeenCalledTimes(3);
  });

  it("reports current failures and releases buttons after a download exception", async () => {
    const view = page();
    view.press(true);
    await view.frame();
    fixture.calls[0]!.reject(new Error("Synthetic current failure."));
    await settle();
    expect(view.status()).toBe("Synthetic current failure.");
    expect(view.element("#mnemocode-cards-status").classList.contains("warning")).toBe(true);
    expect(view.element("#mnemocode-card-sample").disabled).toBe(false);
    view.download.mockImplementationOnce(() => {
      throw new Error("Synthetic download failure.");
    });
    view.press();
    await view.frame();
    const output = file();
    fixture.calls[1]!.resolve(output);
    await settle();
    expect(output.bytes).toEqual(new Uint8Array(3));
    expect(view.status()).toBe("Synthetic download failure.");
    expect(view.previews()).toBe(0);
    expect(view.jobs.runningJob).toBeNull();
    expect(view.element("#export-mnemocode-cards").disabled).toBe(false);
  });

  it("revokes the download URL and clears bytes when its anchor click fails", async () => {
    const view = page();
    view.press();
    await view.frame();
    vi.spyOn(ElementStub.prototype, "click").mockImplementationOnce(() => {
      throw new Error("Synthetic anchor click failure.");
    });
    const output = file();
    fixture.calls[0]!.resolve(output);
    await settle();
    expect(view.createUrl).toHaveBeenCalledOnce();
    expect(view.revokeUrl).toHaveBeenCalledWith("blob:synthetic-card");
    expect(view.document.body.childElementCount).toBe(0);
    expect(output.bytes).toEqual(new Uint8Array(3));
    expect(view.previews()).toBe(0);
    expect(view.status()).toBe("Synthetic anchor click failure.");
    expect(view.element("#export-mnemocode-cards").disabled).toBe(false);
  });
});

describe("card image conversion uses the admitted export capture", () => {
  it("drops a stale image job before accessing a canvas or PDF parser", async () => {
    const pdf = new Uint8Array([1, 2, 3]);
    await expect(cardPagesAsImages(pdf, "png", () => false)).rejects.toThrow(/inputs changed/u);
    expect(fixture.readPages).not.toHaveBeenCalled();
    expect(pdf).toEqual(new Uint8Array(3));
  });

  it("keeps image conversion in the job and rejects a late passive page read", async () => {
    const view = page();
    const canvas = canvasHost(view);
    const pages = deferred<CardPageDrawing[]>();
    fixture.readPages.mockReturnValue(pages.promise);
    view.press();
    await view.frame();
    const pdf = new Uint8Array([1, 2, 3]);
    const conversion = fixture.rasterize!(pdf, "png");
    expect(view.jobs.runningJob).toBe("A MnemoCode card export");
    view.press(true);
    expect(fixture.calls).toHaveLength(1);
    view.edit("#mnemocode-card-orientation", "portrait", "change");
    pages.resolve([]);
    await expect(conversion).rejects.toThrow(/inputs changed/u);
    fixture.calls[0]!.reject(new Error("Synthetic stale conversion failure."));
    await settle();
    expect(view.download).not.toHaveBeenCalled();
    expect(view.previews()).toBe(0);
    expect(pdf).toEqual(new Uint8Array(3));
    expect(canvas.canvases).toHaveLength(1);
    expect(canvas.canvases[0]).toMatchObject({ width: 0, height: 0 });
    expect(view.jobs.runningJob).toBeNull();
  });

  it("passes an unchanged capture to image conversion without parsing a real PDF", async () => {
    const view = page();
    canvasHost(view);
    fixture.readPages.mockResolvedValue([]);
    view.press(true);
    await view.frame();
    const pdf = new Uint8Array([1, 2, 3]);
    await expect(fixture.rasterize!(pdf, "jpg")).resolves.toEqual([]);
    expect(fixture.readPages).toHaveBeenCalledOnce();
    expect(view.jobs.runningJob).toBe("MnemoCode sample cards");
    expect(pdf).toEqual(new Uint8Array(3));
    fixture.calls[0]!.resolve(file());
    await settle();
    expect(view.download).toHaveBeenCalledOnce();
    expect(view.previews()).toBe(0);
  });

  it("clears late encoded bytes and releases canvases after the capture changes", async () => {
    const view = page();
    const canvas = canvasHost(view);
    // No PDF is read or drawn: the parser supplies an empty synthetic page to inert canvas methods.
    fixture.readPages.mockResolvedValue([{ width: 1, height: 1, steps: [] }]);
    let current = true;
    const pdf = new Uint8Array([1, 2, 3]);
    const conversion = cardPagesAsImages(pdf, "png", () => current);
    await canvas.started.promise;
    current = false;
    const bytes = new Uint8Array([4, 5, 6]);
    canvas.encoded.resolve(bytes.buffer);
    await expect(conversion).rejects.toThrow(/inputs changed/u);
    expect(bytes).toEqual(new Uint8Array(3));
    expect(pdf).toEqual(new Uint8Array(3));
    expect(canvas.canvases).toHaveLength(2);
    for (const pageCanvas of canvas.canvases)
      expect(pageCanvas).toMatchObject({ width: 0, height: 0 });
    expect(view.createUrl).not.toHaveBeenCalled();
  });

  it("closes a late decoded picture without painting it or encoding an image", async () => {
    const view = page();
    const canvas = canvasHost(view);
    const picture = deferred<ImageBitmap>();
    const close = vi.fn();
    const decode = vi.fn(() => picture.promise);
    vi.stubGlobal("createImageBitmap", decode);
    vi.stubGlobal("HTMLCanvasElement", ElementStub);
    fixture.readPages.mockResolvedValue([
      {
        width: 1,
        height: 1,
        steps: [
          {
            do: "image",
            image: { width: 1, height: 1, format: "jpeg", data: new Uint8Array([1]) },
          },
        ],
      },
    ]);
    let current = true;
    const pdf = new Uint8Array([1, 2, 3]);
    const conversion = cardPagesAsImages(pdf, "png", () => current);
    await Promise.resolve();
    expect(decode).toHaveBeenCalledOnce();
    current = false;
    picture.resolve({ close } as unknown as ImageBitmap);
    await expect(conversion).rejects.toThrow(/inputs changed/u);
    expect(close).toHaveBeenCalledOnce();
    expect(pdf).toEqual(new Uint8Array(3));
    for (const pageCanvas of canvas.canvases)
      expect(pageCanvas).toMatchObject({ width: 0, height: 0 });
    expect(view.createUrl).not.toHaveBeenCalled();
  });
});

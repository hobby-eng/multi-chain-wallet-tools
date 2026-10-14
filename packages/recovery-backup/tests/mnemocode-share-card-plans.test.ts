import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MnemoCodeShareCardRequest } from "../src/mnemocode-cards.js";
import type { ColorCards } from "../../recovery-mnemocode/source/export/card-content.js";
import type { ShareCardSet as SharedShareCardSet } from "../../recovery-mnemocode/source/export/sskr-render.js";

const fixture = vi.hoisted(() => ({
  choose: vi.fn(() => 0),
  plan: vi.fn<(cards: ColorCards) => Promise<ColorCards>>(),
  printed: [] as { references: readonly string[]; codes: readonly (readonly string[])[] }[],
}));

// The actual ShareCardSet owns topology, card-form refusals and the immutable content. Only its
// host and layout planner are passive: no artwork, canvas, font, QR matrix or PDF is accessed.
vi.mock("../../recovery-mnemocode/source/export/card-renderer.js", () => ({
  CardRenderer: class {
    readonly randomInt = fixture.choose;
    readonly readAsset = () => {
      throw new Error("The passive share plan must not read assets.");
    };
    readonly qrModules = () => {
      throw new Error("The passive share plan must not draw QR matrices.");
    };
  },
}));
vi.mock("../../recovery-mnemocode/source/export/card-plan.js", () => ({
  withPlannedDecoys: (_shape: unknown, _drawing: unknown, cards: ColorCards) => fixture.plan(cards),
}));

import { ShareCardSet } from "../../recovery-mnemocode/source/export/sskr-render.js";
import { sskrSetVector, sskrVector } from "../../recovery-mnemocode/source/sskr/known-answers.js";
import { shareKeepingNote } from "../../recovery-mnemocode/source/export/sskr-keeping-text.js";
import {
  CARD_PAGE_SIZES,
  SHEET_PAGE_SIZE,
  profileFields,
  COPY_FIELDS,
} from "../../recovery-mnemocode/source/export/card-settings.js";
import * as shareLayouts from "../../recovery-mnemocode/source/export/sskr-content.js";
import { resolveSskrLayout as noShareLayout } from "../src/mnemocode-share-render-none.js";
import {
  createMnemoCodeCardExporter,
  mnemoCodeCardSavedNote,
  mnemoCodeShareCardLayout,
} from "../src/mnemocode-cards.js";

const sharedCreate = ShareCardSet.create;
const request = (changes: Partial<MnemoCodeShareCardRequest> = {}): MnemoCodeShareCardRequest => ({
  records: sskrVector.shares,
  masked: false,
  shareFormat: "colors",
  template: "business-it",
  pageSize: "a6",
  qr: true,
  ...changes,
});

function recordPlan(cards: SharedShareCardSet): void {
  fixture.printed.push({
    references: cards.shares.map((share) => share.reference),
    codes: cards.shares.map((_, index) => cards.printedCodes(index)),
  });
}

beforeEach(() => {
  fixture.printed.length = 0;
  fixture.choose.mockClear();
  fixture.plan.mockReset();
  fixture.plan.mockImplementation(async (cards) => ({
    ...cards,
    colors: [...cards.colors, `#${fixture.plan.mock.calls.length.toString(16).padStart(6, "0")}`],
    ...(cards.labels === undefined ? {} : { labels: [...cards.labels, "0000"] }),
    decoys: 1,
  }));
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(() => {
    throw new Error("The passive fixture must not use host randomness.");
  });
  vi.spyOn(Math, "random").mockImplementation(() => {
    throw new Error("The passive fixture must not use fallback randomness.");
  });
  vi.spyOn(PDFDocument, "create").mockImplementation(() => {
    throw new Error("The passive fixture must not create PDFs.");
  });
  vi.spyOn(PDFDocument, "load").mockImplementation(() => {
    throw new Error("The passive fixture must not read PDFs.");
  });
  vi.spyOn(ShareCardSet.prototype, "renderAll").mockImplementation(async function (
    this: SharedShareCardSet,
  ) {
    recordPlan(this);
    return Uint8Array.of(1);
  });
  vi.spyOn(ShareCardSet.prototype, "documents").mockImplementation(async function* (
    this: SharedShareCardSet,
    place: number,
  ) {
    recordPlan(this);
    const share = this.shares[place]!;
    for (let index = 0; index < share.documents; index += 1)
      yield { name: `${share.name}-${index}`, bytes: Uint8Array.of(1) };
  });
});

afterEach(() => vi.restoreAllMocks());

function exporter() {
  return createMnemoCodeCardExporter(
    () => {
      throw new Error("The passive fixture must not read card assets.");
    },
    async () => [Uint8Array.of(2)],
  );
}

describe("MnemoCode imported share-card plans", () => {
  it.each([undefined, ""])("normalizes the %s default before shared layout delegation", (size) => {
    const resolve = vi.spyOn(shareLayouts, "resolveSskrLayout");
    expect(mnemoCodeShareCardLayout(size)).toBe("collection");
    expect(resolve).toHaveBeenCalledExactlyOnceWith(undefined, SHEET_PAGE_SIZE);
    expect(fixture.plan).not.toHaveBeenCalled();
  });

  it.each(CARD_PAGE_SIZES)(
    "delegates a whole-share QR hint at %s without planning cards",
    (size) => {
      const resolve = vi.spyOn(shareLayouts, "resolveSskrLayout");
      expect(mnemoCodeShareCardLayout(size, "qr")).toBe("qr");
      expect(resolve).toHaveBeenCalledExactlyOnceWith("qr", size);
      expect(fixture.plan).not.toHaveBeenCalled();
      expect(fixture.choose).not.toHaveBeenCalled();
      expect(fixture.printed).toEqual([]);
    },
  );

  it("preserves shared fragment layout, malformed-size refusal and no-SSKR refusal", () => {
    expect(mnemoCodeShareCardLayout("business")).toBe("individual");
    expect(() => mnemoCodeShareCardLayout("public-invalid-size", "qr")).toThrow("Page size");
    expect(() => noShareLayout("qr", "business")).toThrow("Share cards need the SSKR library");
    expect(fixture.plan).not.toHaveBeenCalled();
    expect(fixture.choose).not.toHaveBeenCalled();
  });

  it("prints the previously refused official grouped pair without requiring a recovery quorum", async () => {
    const records = [sskrVector.shares[0], sskrVector.shares[2]];
    const file = await exporter().renderShares(request({ records }));
    expect(file.shares).toEqual({ records, masked: false, fragmented: false });
    expect(fixture.printed[0]!.references).toEqual(["4BBF-1-1", "4BBF-2-1"]);
    expect(mnemoCodeCardSavedNote(file)).toContain(shareKeepingNote(records, "file", false));
    expect(mnemoCodeCardSavedNote(file)).not.toMatch(/Any \d+ of/u);
    file.bytes.fill(0);
  });

  it("accepts the official grouped set and delegates keeping advice to shared topology metadata", async () => {
    const create = vi.spyOn(ShareCardSet, "create");
    const file = await exporter().renderShares(request());
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![1]).toEqual(sskrVector.shares);
    expect(file.shares).toEqual({ records: sskrVector.shares, masked: false, fragmented: false });
    expect(fixture.printed[0]!.references).toEqual([
      "4BBF-1-1",
      "4BBF-1-3",
      "4BBF-2-1",
      "4BBF-2-3",
      "4BBF-2-5",
    ]);
    expect(mnemoCodeCardSavedNote(file)).toContain(
      shareKeepingNote(sskrVector.shares, "file", false),
    );
    expect(mnemoCodeCardSavedNote(file)).not.toMatch(/Any \d+ of/u);
    file.bytes.fill(0);
  });

  it.each(["unicode", "colors", "colors-unicode"] as const)(
    "reuses the shared %s plan and invented details across PDF, PNG and JPEG",
    async (shareFormat) => {
      const host = exporter();
      const create = vi.spyOn(ShareCardSet, "create");
      const pdf = await host.renderShares(request({ shareFormat }));
      const planned = fixture.plan.mock.calls.length;
      const choices = fixture.choose.mock.calls.length;
      const png = await host.renderShares(request({ shareFormat, fileFormat: "png" }));
      const jpg = await host.renderShares(request({ shareFormat, fileFormat: "jpg" }));
      expect(create).toHaveBeenCalledTimes(1);
      expect(fixture.plan).toHaveBeenCalledTimes(planned);
      expect(fixture.choose).toHaveBeenCalledTimes(choices);
      expect(png.printed).toEqual(pdf.printed);
      expect(jpg.printed).toEqual(pdf.printed);
      expect(
        fixture.printed.every(
          (printed) => JSON.stringify(printed) === JSON.stringify(fixture.printed[0]),
        ),
      ).toBe(true);
      for (const file of [pdf, png, jpg]) file.bytes.fill(0);
    },
  );

  it.each(["ur", "words", "indexes"] as const)(
    "preserves the shared no-card refusal for %s, including QR layout",
    async (shareFormat) => {
      await expect(
        exporter().renderShares(request({ shareFormat, layout: "qr" })),
      ).rejects.toThrow();
      expect(fixture.plan).not.toHaveBeenCalled();
      expect(fixture.printed).toEqual([]);
    },
  );

  it("preserves set-conflict refusal and below-quorum keeping metadata", async () => {
    await expect(
      exporter().renderShares(
        request({
          records: [sskrVector.shares[0], sskrSetVector.shares[0]],
        }),
      ),
    ).rejects.toThrow("different sets");
    expect(fixture.printed).toEqual([]);
    const records = [sskrSetVector.shares[0]];
    const file = await exporter().renderShares(request({ records, masked: true }));
    expect(mnemoCodeCardSavedNote(file)).toContain(shareKeepingNote(records, "file", true));
    file.bytes.fill(0);
  });

  it("uses shared QR layout at business size and omits whole-share QR on fragments", async () => {
    const host = exporter();
    const qr = await host.renderShares(request({ pageSize: "business", layout: "qr" }));
    expect(qr.mimeType).toBe("application/pdf");
    expect(qr.shares?.fragmented).toBe(false);
    expect(qr.qrCodes).toHaveLength(sskrVector.shares.length);
    const fragments = await host.renderShares(request({ pageSize: "business" }));
    expect(fragments.mimeType).toBe("application/zip");
    expect(fragments.shares?.fragmented).toBe(true);
    expect(fragments.qrCodes).toBeUndefined();
    expect(mnemoCodeCardSavedNote(fragments)).toContain(
      shareKeepingNote(sskrVector.shares, "folders", false),
    );
    qr.bytes.fill(0);
    fragments.bytes.fill(0);
  });

  it("delegates the material-design separate-card refusal to the shared catalogue", async () => {
    await expect(
      exporter().renderShares(
        request({
          template: "material-tile",
          pageSize: "business",
        }),
      ),
    ).rejects.toThrow("sheets only");
    expect(fixture.plan).not.toHaveBeenCalled();
    expect(fixture.printed).toEqual([]);
  });

  const changes: Partial<MnemoCodeShareCardRequest>[] = [
    { records: sskrVector.shares.slice(0, 1) },
    { masked: true },
    { template: "business-architect" },
    { pageSize: "a5" },
    { orientation: "portrait" },
    { shareFormat: "unicode" },
    { layout: "qr" },
    { qr: false },
    ...profileFields.map((field) => ({ profile: { [field]: "Synthetic" } })),
    ...COPY_FIELDS.map((field) => ({ copy: { [field]: "Synthetic" } })),
  ];
  it.each(changes)("replans when a captured setting changes: %j", async (change) => {
    const create = vi.spyOn(ShareCardSet, "create");
    const host = exporter();
    (await host.renderShares(request())).bytes.fill(0);
    (await host.renderShares(request(change))).bytes.fill(0);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("treats reordered profile/copy keys as the same settings", async () => {
    const create = vi.spyOn(ShareCardSet, "create");
    const host = exporter();
    (
      await host.renderShares(
        request({
          profile: { name: "Synthetic", company: "Example" },
          copy: { studioName: "Sample", footer: "Example" },
        }),
      )
    ).bytes.fill(0);
    (
      await host.renderShares(
        request({
          profile: { company: "Example", name: "Synthetic" },
          copy: { footer: "Example", studioName: "Sample" },
          fileFormat: "png",
        }),
      )
    ).bytes.fill(0);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not revive a forgotten plan when its deferred creation settles", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const create = vi.spyOn(ShareCardSet, "create").mockImplementationOnce(async (...args) => {
      const cards = await sharedCreate(...args);
      await held;
      return cards;
    });
    const host = exporter();
    const pending = host.renderShares(request());
    host.forgetDetails();
    release();
    (await pending).bytes.fill(0);
    (await host.renderShares(request({ fileFormat: "png" }))).bytes.fill(0);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("captures the caller's records and shares one deferred plan across formats", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const create = vi.spyOn(ShareCardSet, "create").mockImplementationOnce(async (...args) => {
      const cards = await sharedCreate(...args);
      await held;
      return cards;
    });
    const host = exporter();
    const records = [...sskrVector.shares];
    const pdf = host.renderShares(request({ records }));
    const png = host.renderShares(request({ fileFormat: "png" }));
    records.splice(0);
    release();
    const files = await Promise.all([pdf, png]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(files[0]!.shares?.records).toEqual(sskrVector.shares);
    expect(files[1]!.shares?.records).toEqual(sskrVector.shares);
    for (const file of files) file.bytes.fill(0);
  });

  it("retries a failed plan instead of retaining its rejection", async () => {
    const create = vi
      .spyOn(ShareCardSet, "create")
      .mockRejectedValueOnce(new Error("Synthetic planning failure."));
    const host = exporter();
    await expect(host.renderShares(request())).rejects.toThrow("Synthetic planning failure.");
    (await host.renderShares(request())).bytes.fill(0);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("clears earlier share images and the current PDF when later conversion fails", async () => {
    const image = Uint8Array.of(7);
    const pdfs: Uint8Array[] = [];
    const draw = vi.fn(async (pdf: Uint8Array) => {
      pdfs.push(pdf);
      if (pdfs.length === 1) return [image];
      throw new Error("Synthetic stale image job.");
    });
    const host = createMnemoCodeCardExporter(() => {
      throw new Error("The passive fixture must not read assets.");
    }, draw);
    await expect(host.renderShares(request({ fileFormat: "png" }))).rejects.toThrow(
      "Synthetic stale image job.",
    );
    expect(image).toEqual(Uint8Array.of(0));
    expect(pdfs).toHaveLength(2);
    expect(pdfs.every((pdf) => pdf.every((byte) => byte === 0))).toBe(true);
  });
});

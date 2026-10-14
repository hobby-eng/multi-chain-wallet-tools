// Plan ownership only: the render boundary returns synthetic bytes, never PDFs or card images.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CardJob } from "../../recovery-mnemocode/source/export/render.js";

const trace = vi.hoisted(() => ({
  plans: [] as CardJob[],
  renders: [] as CardJob[],
  rasterize: vi.fn(async () => [Uint8Array.of(9)]),
}));
vi.mock("../src/mnemocode-share-render.js", () => ({ Share: {}, ShareCardSet: {} }));
vi.mock("../../recovery-mnemocode/source/export/render.js", () => ({
  async plannedCardJob(_drawing: unknown, job: CardJob): Promise<CardJob> {
    trace.plans.push(job);
    return {
      ...job,
      content: { ...job.content, colors: [...job.content.colors, "#ABCDEF"], decoys: 1 },
    };
  },
  async renderCards(_drawing: unknown, jobs: CardJob[]): Promise<Uint8Array> {
    trace.renders.push(...jobs);
    return Uint8Array.of(1, 2);
  },
  renderIndividualCards: vi.fn(() => {
    throw new Error("No individual rendering in this fixture.");
  }),
}));
vi.mock("../../recovery-mnemocode/source/cards.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../recovery-mnemocode/source/cards.js")>()),
  CardRenderer: class {
    readonly randomInt = () => 0;
  },
}));

import { createMnemoCodeCardExporter, type MnemoCodeCardRequest } from "../src/mnemocode-cards.js";

const request: MnemoCodeCardRequest = {
  mnemonic: `${"abandon ".repeat(11)}about`,
  mode: "direct",
  dates: [],
  format: "colors",
  template: "business-it",
  pageSize: "a6",
  qr: false,
  profile: { name: "John Smith", company: "Example Systems", role: "Engineer" },
};

describe("browser card plan identity", () => {
  beforeEach(() => {
    trace.plans.length = 0;
    trace.renders.length = 0;
    trace.rasterize.mockClear();
  });

  function exporter() {
    return createMnemoCodeCardExporter(() => {
      throw new Error("No artwork in this fixture.");
    }, trace.rasterize);
  }

  it("reuses the same planned codes for PDF and image exports of the same content", async () => {
    const host = exporter();
    await host.render(request);
    await host.render({ ...request, fileFormat: "png" });
    expect(trace.plans).toHaveLength(1);
    expect(trace.renders[0]!.content.colors).toEqual(trace.renders[1]!.content.colors);
    expect(trace.renders[1]!.content.decoys).toBe(1);
  });

  it.each([
    { qr: true },
    { title: "A longer collection heading" },
    { copy: { subtitle: "A longer printed subtitle" } },
    { profile: { name: "Jane Example", company: "Long Example Company", role: "Engineer" } },
    { mnemonic: "legal winner thank year wave sausage worth useful legal winner thank yellow" },
  ] satisfies Partial<MnemoCodeCardRequest>[])(
    "plans new geometry/content instead of reusing an old tail for %j",
    async (change) => {
      const host = exporter();
      await host.render(request);
      await host.render({ ...request, ...change });
      expect(trace.plans).toHaveLength(2);
    },
  );

  it("drops retained plans when the source session is cleared", async () => {
    const host = exporter();
    await host.render(request);
    host.forgetDetails();
    await host.render(request);
    expect(trace.plans).toHaveLength(2);
  });
});

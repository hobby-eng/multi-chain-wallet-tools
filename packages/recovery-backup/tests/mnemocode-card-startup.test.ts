import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";

// No bundled font or artwork is loaded by this fixture, even when the adapter is imported.
vi.mock("../src/mnemocode-card-assets.js", () => ({
  readMnemoCodeCardAsset: vi.fn(() => {
    throw new Error("Startup must not read card assets.");
  }),
}));

import { CardRenderer } from "../../recovery-mnemocode/source/export/card-renderer.js";
import * as cardSetChecks from "../../recovery-mnemocode/source/export/card-sets-self-test.js";
import { readMnemoCodeCardAsset } from "../src/mnemocode-card-assets.js";
import * as cardHost from "../src/mnemocode-cards.js";
import { runMnemoCodeCardsSelfTest } from "../src/self-test-mnemocode-cards.js";

const sharedCardSetsSelfTest = cardSetChecks.cardSetsSelfTest;

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("MnemoCode card-set startup adapter", () => {
  it("calls the shared startup through the passive renderer without host or PDF access", () => {
    const random = vi.spyOn(crypto, "getRandomValues").mockImplementation(() => {
      throw new Error("Startup must not request host randomness.");
    });
    const mathRandom = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Startup must not request fallback randomness.");
    });
    const createPdf = vi.spyOn(PDFDocument, "create").mockImplementation(() => {
      throw new Error("Startup must not create a PDF.");
    });
    const loadPdf = vi.spyOn(PDFDocument, "load").mockImplementation(() => {
      throw new Error("Startup must not read a PDF.");
    });
    const full = vi.fn(() => {
      throw new Error("Startup must not run the full card check.");
    });
    const startup = vi.fn<() => void>();
    const factory = vi.spyOn(cardHost, "createMnemoCodeCardRenderer");
    const feature = vi.spyOn(cardSetChecks, "cardSetsSelfTest").mockImplementation((drawing) => {
      const shared = sharedCardSetsSelfTest(drawing);
      startup.mockImplementation(shared.startup);
      return { startup, check: { ...shared.check, run: full } };
    });

    const report = runMnemoCodeCardsSelfTest();

    expect(report.passed).toBe(true);
    expect(report.checks).toEqual(["MnemoCode card set known answers"]);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(readMnemoCodeCardAsset);
    const renderer = factory.mock.results[0]!.value;
    expect(renderer).toBeInstanceOf(CardRenderer);
    expect(feature).toHaveBeenCalledTimes(1);
    expect(feature).toHaveBeenCalledWith(renderer);
    expect(startup).toHaveBeenCalledTimes(1);
    expect(startup).toHaveBeenCalledWith();
    expect(full).not.toHaveBeenCalled();
    expect(readMnemoCodeCardAsset).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
    expect(mathRandom).not.toHaveBeenCalled();
    expect(createPdf).not.toHaveBeenCalled();
    expect(loadPdf).not.toHaveBeenCalled();
  });

  it("propagates a shared startup failure without substituting the full check", () => {
    const failure = new Error("Synthetic card-set known-answer failure.");
    const startup = vi.fn(() => {
      throw failure;
    });
    const full = vi.fn(() => {
      throw new Error("The full card check is not a fallback.");
    });
    vi.spyOn(cardSetChecks, "cardSetsSelfTest").mockImplementation((drawing) => ({
      startup,
      check: { ...sharedCardSetsSelfTest(drawing).check, run: full },
    }));

    expect(runMnemoCodeCardsSelfTest).toThrow(failure);
    expect(startup).toHaveBeenCalledTimes(1);
    expect(startup).toHaveBeenCalledWith();
    expect(full).not.toHaveBeenCalled();
    expect(readMnemoCodeCardAsset).not.toHaveBeenCalled();
  });
});

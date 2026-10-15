// Card-count and layout planning only: no PDF painting or image generation.
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { describe, expect, it, vi } from "vitest";
import { EncodedBackup } from "../../recovery-mnemocode/source/core/encoded-backup.js";
import { backupCardContent } from "../../recovery-mnemocode/source/export/backup-cards.js";
import {
  ownCards,
  keptCards,
  withDecoyPool,
} from "../../recovery-mnemocode/source/export/card-decoys.js";
import {
  withPlannedDecoys,
  type SheetShaper,
} from "../../recovery-mnemocode/source/export/card-plan.js";
import { CardRenderer } from "../../recovery-mnemocode/source/export/card-renderer.js";
import { plannedCardJob, separateCardJob } from "../../recovery-mnemocode/source/export/render.js";
import { ShareCardSet } from "../../recovery-mnemocode/source/export/sskr-render.js";
import { selectTemplate } from "../../recovery-mnemocode/source/export/templates.js";
import { sskrVector } from "../../recovery-mnemocode/source/sskr/known-answers.js";

const refuseDrawing = (): never => {
  throw new Error(
    "An individual count plan must not read assets, lay out sheets or render images.",
  );
};
const drawing = new CardRenderer({
  randomInt: () => 0,
  readAsset: refuseDrawing,
  decodePng: refuseDrawing,
  encodePng: refuseDrawing,
  qrModules: refuseDrawing,
});
const shaper: SheetShaper = refuseDrawing;

describe("individual card counts", () => {
  it.each([12, 15, 18, 21, 24])(
    "keeps one decoy for every printable form of %i words",
    async (words) => {
      const phrase = entropyToMnemonic(new Uint8Array((words * 4) / 3), wordlist);
      for (const format of ["unicode", "colors", "colors-unicode"] as const) {
        const backup = EncodedBackup.encode(phrase, [], format, "direct").backup;
        const original = backupCardContent(backup);
        const planned = await withPlannedDecoys(shaper, drawing, original, true);
        const own = format === "unicode" ? words : (words * 2) / 3;
        expect(planned.decoys).toBe(1);
        expect(planned.colors).toHaveLength(own + 1);
        expect(planned.colors.slice(0, own)).toEqual(original.colors);
        expect(planned.labels?.slice(0, own)).toEqual(original.labels);
        expect(planned.payload).toBe(original.payload);
        expect(ownCards(planned)).toBe(own);
        expect(await withPlannedDecoys(shaper, drawing, planned, true)).toBe(planned);
      }
    },
  );

  it("trims a 28-card sheet to 25 individual cards without changing the sheet or real codes", async () => {
    const phrase = entropyToMnemonic(new Uint8Array(32), wordlist);
    const content = backupCardContent(EncodedBackup.encode(phrase, [], "unicode", "direct").backup);
    const sheet = {
      ...keptCards(
        withDecoyPool(content, () => 0),
        28,
      ),
      orientation: "portrait" as const,
    };
    const random = vi.fn(refuseDrawing);
    const individual = await withPlannedDecoys(shaper, drawing, sheet, true, random);
    expect(individual.decoys).toBe(1);
    expect(individual.labels).toEqual(sheet.labels!.slice(0, 25));
    expect(individual.colors).toEqual(sheet.colors.slice(0, 25));
    expect(individual.payload).toBe(sheet.payload);
    expect(sheet.colors).toHaveLength(28);
    expect(await withPlannedDecoys(shaper, drawing, sheet, false, random)).toBe(sheet);
    expect(random).not.toHaveBeenCalled();
    const job = { template: selectTemplate("business-it"), content: sheet };
    const separate = separateCardJob(job, undefined);
    expect(separate.content.colors).toHaveLength(25);
    expect(separate.content).not.toHaveProperty("orientation");
    expect(separateCardJob(job, "landscape").content.orientation).toBe("landscape");
  });

  it("plans card-sized PDFs without a sheet layout", async () => {
    const phrase = entropyToMnemonic(new Uint8Array(32), wordlist);
    const content = backupCardContent(EncodedBackup.encode(phrase, [], "unicode", "direct").backup);
    const job = await plannedCardJob(drawing, {
      template: selectTemplate("business-it"),
      content: { ...content, pageSize: "business" },
    });
    expect(job.content.colors).toHaveLength(25);
    expect(job.content.decoys).toBe(1);
  });

  it.each(["unicode", "colors", "colors-unicode"] as const)(
    "adds one decoy per separate Shamir share in %s",
    async (shareFormat) => {
      const set = await ShareCardSet.create(drawing, [sskrVector.shares[0]!], {
        style: "it",
        layout: "individual",
        shareFormat,
      });
      expect(set.shares[0]!.documents).toBe(set.ownCodes(0) + 1);
      expect(set.printedCodes(0)).toHaveLength(set.ownCodes(0) + 1);
      expect(set.qrCodes).toEqual([]);
    },
  );
});

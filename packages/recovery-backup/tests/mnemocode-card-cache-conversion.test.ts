import { describe, expect, it, vi } from "vitest";
import { MnemoCodeCardPlans } from "../src/mnemocode-card-plans.js";
import { CardRenderer } from "../../recovery-mnemocode/source/export/card-renderer.js";
import { EncodedBackup } from "../../recovery-mnemocode/source/core/encoded-backup.js";
import { backupCardContent } from "../../recovery-mnemocode/source/export/backup-cards.js";
import {
  withDecoyPool,
  keptCards,
  ownCards,
} from "../../recovery-mnemocode/source/export/card-decoys.js";
import { selectTemplate } from "../../recovery-mnemocode/source/export/templates.js";

const refuse = (): never => {
  throw new Error("A prepared-plan conversion must not draw or use fresh randomness.");
};
const original =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("Browser cache converts a prepared sheet without rerandomization", () => {
  it.each([undefined, "landscape"] as const)(
    "keeps the first decoy and only the requested orientation %s",
    async (orientation) => {
      const randomInt = vi.fn(refuse);
      const drawing = new CardRenderer({
        randomInt,
        readAsset: refuse,
        decodePng: refuse,
        encodePng: refuse,
        qrModules: refuse,
      });
      const content = backupCardContent(
        EncodedBackup.encode(original, [], "unicode", "direct").backup,
      );
      const sheet = {
        ...keptCards(
          withDecoyPool(content, () => 0),
          content.colors.length + 4,
        ),
        pageSize: "a6" as const,
        orientation: "portrait" as const,
      };
      const template = selectTemplate("business-it");
      const plans = new MnemoCodeCardPlans(drawing);
      await plans.plan({ template, content: sheet });
      const individual = await plans.plan({
        template,
        content: {
          ...content,
          pageSize: "business",
          ...(orientation === undefined ? {} : { orientation }),
        },
      });
      expect(individual.content.colors).toEqual(sheet.colors.slice(0, content.colors.length + 1));
      expect(individual.content.labels).toEqual(sheet.labels?.slice(0, content.colors.length + 1));
      expect(individual.content.payload).toBe(sheet.payload);
      expect(ownCards(individual.content)).toBe(content.colors.length);
      expect(individual.content.decoys).toBe(1);
      expect(individual.content.pageSize).toBe("business");
      expect(individual.content.orientation).toBe(orientation);
      expect(sheet.colors).toHaveLength(content.colors.length + 4);
      expect(randomInt).not.toHaveBeenCalled();
      plans.wipe();
      await expect(
        plans.plan({ template, content: { ...content, pageSize: "business" } }),
      ).rejects.toThrow("fresh randomness");
    },
  );
});

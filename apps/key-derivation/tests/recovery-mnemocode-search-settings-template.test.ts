import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Commented examples cannot satisfy the controller's requirement for a real DOM container.
const template = readFileSync(new URL("../src/index.html", import.meta.url), "utf8").replace(
  /<!--[\s\S]*?-->/gu,
  "",
);
const hosts = [
  ["mnemocode-decode", "mnemocode-decode-panel"],
  ["mnemocode-forgotten", "mnemocode-forgotten-panel"],
] as const;

/** Inspect element IDs without confusing label references or other attribute values with IDs. */
function openings(html: string, id: string): RegExpMatchArray[] {
  return [...html.matchAll(/<[a-z][a-z0-9-]*\b[^>]*>/giu)].filter((tag) =>
    new RegExp(`\\sid=["']${id}["']`, "u").test(tag[0]),
  );
}

/** Keep nested sections inside their owning panel, rather than stopping at the first close. */
function panel(html: string, id: string): string {
  const start = new RegExp(`<section\\b[^>]*\\sid=["']${id}["'][^>]*>`, "u").exec(html);
  if (start === null) throw new Error(`Template is missing panel ${id}.`);
  let depth = 0;
  const tags = /<\/?section\b[^>]*>/gu;
  tags.lastIndex = start.index;
  for (let tag = tags.exec(html); tag !== null; tag = tags.exec(html)) {
    if (tag[0].startsWith("</")) depth -= 1;
    else depth += 1;
    if (depth === 0) return html.slice(start.index, tags.lastIndex);
  }
  throw new Error(`Template is missing the closing section for ${id}.`);
}

describe("MnemoCode controller-owned search settings in the Deriver template", () => {
  for (const [prefix, owner] of hosts) {
    const id = `${prefix}-search-settings`;

    it(`provides one empty ${id} for controller startup`, () => {
      const tags = openings(template, id);
      expect(tags, "Duplicate containers make querySelector attach to the wrong host").toHaveLength(
        1,
      );
      expect(template).toMatch(new RegExp(`<div\\b[^>]*\\sid=["']${id}["'][^>]*>\\s*</div>`, "u"));
    });

    it(`places ${id} under ${owner}`, () => {
      expect(openings(panel(template, owner), id)).toHaveLength(1);
    });

    it(`leaves ${prefix}'s generated controls to the settings controller`, () => {
      // These input IDs are the template/controller ownership boundary, not copied range defaults.
      for (const suffix of ["max-candidates", "progress-every", "max-results"])
        expect(openings(template, `${prefix}-${suffix}`)).toHaveLength(0);
    });
  }
});

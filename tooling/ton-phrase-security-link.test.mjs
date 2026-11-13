// The "?" of "Generate a phrase the Telegram wallet accepts" links to the security note on such a
// phrase protected with MHFE: the link is built from the one repository URL and
// must land on a heading that exists, in every build with TON and in no build without it.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUILD_PROFILES } from "./build-profiles.mjs";
import {
  TON_PHRASE_SECURITY_NOTE,
  TON_PHRASE_SECURITY_URL,
  applyKeyDerivationFeatureTemplate,
  parseKeyDerivationFeatures,
} from "./key-derivation-features.mjs";
import { SOURCE_REPOSITORY_URL } from "./project-metadata.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TEMPLATE = readFileSync(resolve(ROOT, "apps/key-derivation/src/index.html"), "utf8");

/** The ids GitHub gives the headings of a Markdown file, as its github-slugger computes them. */
function headingAnchors(markdown) {
  return [...markdown.matchAll(/^#{1,6} (.+)$/gmu)].map(([, heading]) =>
    heading
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
      .replaceAll(" ", "-"),
  );
}

/**
 * The Deriver's template with the features of an edition's full build applied: the step of the
 * build that keeps or removes the Telegram option and fills in its link.
 */
function page(profileId) {
  const features = parseKeyDerivationFeatures(BUILD_PROFILES[profileId], []);
  return applyKeyDerivationFeatureTemplate(TEMPLATE, features);
}

describe("the Telegram option's link to its security note", () => {
  it("lands on exactly one heading of the Deriver's security notes", () => {
    const notes = readFileSync(resolve(ROOT, TON_PHRASE_SECURITY_NOTE.path), "utf8");
    const anchors = headingAnchors(notes);
    expect(anchors.filter((anchor) => anchor === TON_PHRASE_SECURITY_NOTE.anchor)).toHaveLength(1);
    expect(notes).toContain("\n## A phrase the Telegram wallet accepts, protected with MHFE\n");
  });

  it("is built from the one repository URL, on the main branch", () => {
    expect(TON_PHRASE_SECURITY_URL).toBe(
      `${SOURCE_REPOSITORY_URL}/blob/main/apps/key-derivation/SECURITY.md#${TON_PHRASE_SECURITY_NOTE.anchor}`,
    );
  });

  it("is the link of the Telegram option's help in the Multi-Chain Deriver, opened apart", () => {
    const html = page("multi-chain");
    const help = /<details id="ton-generation-help"[\s\S]*?<\/details>/u.exec(html)?.[0];
    expect(help).toBeDefined();
    expect(help).toContain(
      `<a href="${TON_PHRASE_SECURITY_URL}" target="_blank" rel="noopener noreferrer"`,
    );
    expect(html.split(TON_PHRASE_SECURITY_URL)).toHaveLength(2);
    expect(html).not.toContain("__TON_PHRASE_SECURITY_URL__");
  });

  it("is absent with the Telegram option from the Dash Community Deriver", () => {
    const html = page("dash-community");
    expect(html).not.toContain("ton-generation");
    expect(html).not.toContain(TON_PHRASE_SECURITY_NOTE.anchor);
    expect(html).not.toContain("__TON_PHRASE_SECURITY_URL__");
  });
});

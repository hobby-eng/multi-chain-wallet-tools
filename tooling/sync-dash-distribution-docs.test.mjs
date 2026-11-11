import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RELEASE_LEGAL_NAMES } from "./release-legal-documents.mjs";
import { renderDashDistributionDocs } from "./sync-dash-distribution-docs.mjs";

const root = resolve(import.meta.dirname, "..");
const sha = "1234567890abcdef1234567890abcdef12345678";

describe("Dash distribution documentation", () => {
  it("uses canonical version, notices and actual Dash build modules without claiming a new release", () => {
    const files = renderDashDistributionDocs(root, sha);
    const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
    expect(files.get("README.md")).toContain(`Current canonical source version: ${version}`);
    expect(files.get("README.md")).toContain("not necessarily the latest published HTML release");
    expect(files.get("README.md")).toContain("gordian-envelope");
    expect(files.get("README.md")).not.toContain("`silent-payments`");
    expect(files.get("ATTRIBUTION.md")).toContain(`${sha}/docs/reference/DASH_IMPLEMENTATION.md`);
    expect(files.get("THIRD_PARTY_NOTICES.md")).toContain("bc-envelope");
    expect(files.get("LICENSE")).toBe(readFileSync(resolve(root, "LICENSE"), "utf8"));
    for (const content of files.values()) expect(content).not.toMatch(/\{\{[A-Z_]+\}\}/u);
    expect([...renderDashDistributionDocs(root, sha)]).toEqual([...files]);
  });

  it("names exactly the licence and notice files a release carries", () => {
    const readme = renderDashDistributionDocs(root, sha).get("README.md");
    for (const name of RELEASE_LEGAL_NAMES) expect(readme).toContain(`\`${name}\``);
    // Notices an earlier MnemoCode intake named, which no release carries.
    for (const stale of ["DejaVuSans-NOTICE", "NaturalEarth-NOTICE", "CardArtwork-NOTICE"])
      expect(readme).not.toContain(stale);
  });

  it("names the Dash Desktop file as code, as the Dash Deriver page names it", () => {
    const security = renderDashDistributionDocs(root, sha).get("SECURITY.md");
    expect(security).toContain(
      "Each release carries it for every platform as `Dash_Community_Key_Derivation_Tool_Desktop-<platform>`.",
    );
    // Outside a code span Markdown would read <platform> as an HTML tag and drop it.
    expect(security.replaceAll(/`[^`]*`/gu, "")).not.toContain("<platform>");
  });

  it("records a verifiable source commit and hashes for every generated document", () => {
    const files = renderDashDistributionDocs(root, sha);
    const evidence = JSON.parse(files.get("documentation-source.json"));
    expect(evidence.sourceCommit).toBe(sha);
    for (const [name, hash] of Object.entries(evidence.files)) {
      expect(createHash("sha256").update(files.get(name)).digest("hex")).toBe(hash);
    }
    expect(Object.keys(evidence.files)).toHaveLength(5);
  });

  it.each(["main", "v0.1.5", "../malicious", "a".repeat(39)])(
    "rejects an ambiguous source revision: %s",
    (ref) => {
      expect(() => renderDashDistributionDocs(root, ref)).toThrow("full Git commit SHA");
    },
  );
});

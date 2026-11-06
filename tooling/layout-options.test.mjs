import { describe, expect, it } from "vitest";
import { LayoutOptions } from "./layout-options.mjs";

const ROOT = "/synthetic-layout-root";
describe("layout command admission", () => {
  it("selects every real tool by default and returns separate width/path lists", () => {
    const options = new LayoutOptions([], ROOT);
    expect(options.paths).toHaveLength(8);
    expect(options.widths).toEqual([1280, 768, 390]);
    const paths = options.paths;
    paths.length = 0;
    expect(options.paths).toHaveLength(8);
    expect(options.selfTest).toBe(false);
  });
  it("selects the requested profile/tool through the real build catalog", () => {
    const options = new LayoutOptions(
      [
        "--profile=dash-community",
        "--tool",
        "psbt-inspector",
        "--widths",
        "390,1280",
        "--json=report.json",
      ],
      ROOT,
    );
    expect(options.paths).toEqual([
      ROOT +
        "/dist/dash-community-edition/psbt-inspector/Dash_Community_PSBT_Multisig_Inspector.html",
    ]);
    expect(options.widths).toEqual([390, 1280]);
    expect(options.json).toBe("report.json");
  });
  it("keeps explicit HTML paths and the end-of-options separator literal", () => {
    expect(new LayoutOptions(["one.html", "--", "--two.html"], ROOT).paths).toEqual([
      ROOT + "/one.html",
      ROOT + "/--two.html",
    ]);
    expect(new LayoutOptions(["--self-test"], ROOT).selfTest).toBe(true);
  });
  it.each([
    ["--tool", "synthetic-unknown-tool"],
    ["--profile", "synthetic-unknown-profile"],
    ["--tool"],
    ["--tool="],
    ["--json", "--tool", "key-derivation"],
    ["--unknown"],
    ["--self-test=true"],
    ["--self-test", "--self-test"],
    ["--profile", "all", "--profile=all"],
    ["--self-test", "one.html"],
    ["one.html", "--tool", "key-derivation"],
  ])("refuses malformed or unused selections before a browser can launch: %j", (...argv) => {
    expect(() => new LayoutOptions(argv, ROOT)).toThrow(
      expect.objectContaining({ code: expect.stringMatching(/^layout\./u) }),
    );
  });
  it.each([
    "",
    "0",
    "-1",
    "390,390",
    "390,",
    "1.5",
    "NaN",
    "Infinity",
    "1e3",
    "16385",
    "9".repeat(97),
    Array.from({ length: 17 }, (_, i) => String(i + 1)).join(","),
  ])("refuses invalid or unbounded width lists: %s", (widths) => {
    expect(() => new LayoutOptions(["--widths=" + widths], ROOT)).toThrow();
  });
  it("admits the documented pixel bounds and refuses too many pages and sparse arguments", () => {
    expect(new LayoutOptions(["--widths=1,16384"], ROOT).widths).toEqual([1, 16384]);
    expect(
      () =>
        new LayoutOptions(
          Array.from({ length: 65 }, (_, i) => `${i}.html`),
          ROOT,
        ),
    ).toThrow(expect.objectContaining({ code: "layout.pages" }));
    const sparse = [];
    sparse.length = 1;
    expect(() => new LayoutOptions(sparse, ROOT)).toThrow(
      expect.objectContaining({ code: "layout.argument" }),
    );
  });
});

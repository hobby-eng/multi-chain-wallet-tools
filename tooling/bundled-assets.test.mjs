import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { BundledAssets } from "./bundled-assets.mjs";

class AssetFixture {
  #directory = mkdtempSync(join(tmpdir(), "wallet-public-asset-fixture-"));
  root = join(this.#directory, "checkout");
  source = join(this.root, "apps/alpha/entry.ts");
  guide = join(this.root, "packages/guide/manual.md");

  constructor() {
    mkdirSync(join(this.root, "apps/alpha"), { recursive: true });
    mkdirSync(join(this.root, "packages/guide"), { recursive: true });
    writeFileSync(this.guide, "Public synthetic instructions.\n");
    writeFileSync(join(this.#directory, "outside.md"), "Public outside fixture.\n");
    symlinkSync(join(this.#directory, "outside.md"), join(this.root, "escape.md"));
    symlinkSync(this.guide, join(this.root, "inside.md"));
  }

  dispose() {
    rmSync(this.#directory, { recursive: true, force: true });
  }

  writeResource(path, text) {
    const target = join(this.root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    return target;
  }

  async bundledTarget(specifier, paths) {
    const tsconfig = join(this.root, "tsconfig.json");
    writeFileSync(
      tsconfig,
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          baseUrl: ".",
          paths,
        },
      }),
    );
    const result = await build({
      absWorkingDir: this.root,
      tsconfig,
      stdin: {
        contents: `export {default} from ${JSON.stringify(specifier)};`,
        resolveDir: dirname(this.source),
      },
      bundle: true,
      write: false,
      metafile: true,
      format: "esm",
      loader: BundledAssets.loaders,
      logLevel: "silent",
    });
    const resources = Object.keys(result.metafile.inputs).filter((path) => path.endsWith(".md"));
    expect(resources).toHaveLength(1);
    return resolve(this.root, resources[0]);
  }
}

let fixture;
afterEach(() => fixture?.dispose());

describe("bundled resource admission", () => {
  it("resolves relative, exact-alias and wildcard-alias resources to the same owned file", () => {
    fixture = new AssetFixture();
    const assets = new BundledAssets(fixture.root, {
      "@guide": ["./packages/guide/manual.md"],
      "@guides/*": ["./missing/*", "./packages/guide/*"],
    });
    for (const specifier of [
      "../../packages/guide/manual.md",
      "@guide",
      "@guide?raw",
      "@guides/manual.md?raw",
    ])
      expect(assets.resolve(fixture.source, specifier)).toBe(fixture.guide);
  });

  it("leaves source modules and external resources to their own resolvers", () => {
    fixture = new AssetFixture();
    const assets = new BundledAssets(fixture.root);
    expect(assets.resolve(fixture.source, "./entry.js")).toBeUndefined();
    expect(assets.resolve(fixture.source, "external-package/manual.md")).toBeUndefined();
  });

  it.each(["?raw", "#guide", "?raw#guide"])(
    "agrees with the actual esbuild loader for a Markdown import suffix: %s",
    async (suffix) => {
      fixture = new AssetFixture();
      const specifier = "./packages/guide/manual.md" + suffix;
      const result = await build({
        stdin: {
          contents: `export {default} from ${JSON.stringify(specifier)};`,
          resolveDir: fixture.root,
        },
        bundle: true,
        write: false,
        format: "esm",
        loader: BundledAssets.loaders,
        logLevel: "silent",
      });
      expect(result.outputFiles[0].text).toContain("Public synthetic instructions.");
      expect(
        new BundledAssets(fixture.root).resolve(
          fixture.source,
          "../../packages/guide/manual.md" + suffix,
        ),
      ).toBe(fixture.guide);
    },
  );

  it.each([
    "./absent.md",
    "./absent.md?raw",
    "../../packages/guide.md",
    "../../packages/guide/manual.md/child.md",
  ])("refuses a missing file or directory used as a resource: %s", (specifier) => {
    fixture = new AssetFixture();
    mkdirSync(join(fixture.root, "packages/guide.md"));
    const assets = new BundledAssets(fixture.root);
    expect(() => assets.resolve(fixture.source, specifier)).toThrow(
      expect.objectContaining({ code: "build.asset.missing" }),
    );
  });

  it.each(["../../../outside.md", "../../escape.md"])(
    "refuses lexical and symbolic-link escapes: %s",
    (specifier) => {
      fixture = new AssetFixture();
      const assets = new BundledAssets(fixture.root);
      expect(() => assets.resolve(fixture.source, specifier)).toThrow(
        expect.objectContaining({ code: "build.asset.outside-root" }),
      );
    },
  );

  it("attributes an internal symbolic link to the actual resource owner", () => {
    fixture = new AssetFixture();
    expect(new BundledAssets(fixture.root).resolve(fixture.source, "../../inside.md")).toBe(
      fixture.guide,
    );
  });

  it("refuses a literal query filename instead of attributing it to a different Markdown file", async () => {
    fixture = new AssetFixture();
    writeFileSync(fixture.guide + "?raw", "Public unsupported literal filename.\n");
    await expect(
      build({
        stdin: {
          contents: 'export {default} from "./packages/guide/manual.md?raw";',
          resolveDir: fixture.root,
        },
        bundle: true,
        write: false,
        loader: BundledAssets.loaders,
        logLevel: "silent",
      }),
    ).rejects.toThrow('No loader is configured for ".md?raw"');
    expect(() =>
      new BundledAssets(fixture.root).resolve(fixture.source, "../../packages/guide/manual.md?raw"),
    ).toThrow(expect.objectContaining({ code: "build.asset.literal-suffix" }));
  });
});

describe("resource alias precedence", () => {
  it.each([
    {
      name: "an exact alias before a generic wildcard",
      specifier: "@docs/manual.md",
      paths: { "@docs/*": ["packages/guide/*"], "@docs/manual.md": ["apps/beta/manual.md"] },
      fallback: "packages/guide/manual.md",
    },
    {
      name: "a longer wildcard prefix before a generic wildcard",
      specifier: "@docs/special/manual.md",
      paths: { "@docs/*": ["packages/guide/*"], "@docs/special/*": ["apps/beta/*"] },
      fallback: "packages/guide/special/manual.md",
    },
  ])(
    "resolves $name exactly as the actual esbuild graph",
    async ({ specifier, paths, fallback }) => {
      fixture = new AssetFixture();
      fixture.writeResource(fallback, "Public generic wildcard target.\n");
      const selected = fixture.writeResource(
        "apps/beta/manual.md",
        "Public specific alias target.\n",
      );
      expect(await fixture.bundledTarget(specifier, paths)).toBe(selected);
      expect(new BundledAssets(fixture.root, paths).resolve(fixture.source, specifier)).toBe(
        selected,
      );
    },
  );

  it("refuses unresolved wildcard ties instead of choosing by table order", () => {
    fixture = new AssetFixture();
    const assets = new BundledAssets(fixture.root, {
      "@docs/*": ["packages/guide/*"],
      "@docs/*.md": ["apps/beta/*.md"],
    });
    expect(() => assets.resolve(fixture.source, "@docs/manual.md")).toThrow(
      expect.objectContaining({ code: "build.asset.alias-ambiguous" }),
    );
  });
});

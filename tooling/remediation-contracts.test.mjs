import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { assertReviewedDynamicCode, dynamicCodeCounts } from "./artifact-checks.mjs";
import { assertCanonicalManifestWriter, CANONICAL_WORKSPACE } from "./verify-wasm-integrity.mjs";
import { ToolProtocolFooter } from "./tool-protocol-footer.mjs";
import { MhfeIntegrationModules } from "./mhfe-integration.mjs";
import { BUILD_PROFILES } from "./build-profiles.mjs";
import { englishList } from "../packages/crypto-core/src/listing.ts";
import config from "../vitest.config.ts";
import tsconfig from "../tsconfig.json" with { type: "json" };
const root = resolve(".");
const read = (path) => readFileSync(resolve(root, path), "utf8");

describe("AUD-026 build admission and shared owners", () => {
  it("rejects added bare, qualified, bracket and optional constructors and eval", () => {
    const reviewed = 'Function("binder", "return binder")';
    expect(() => assertReviewedDynamicCode(reviewed, "key-derivation")).not.toThrow();
    for (const extra of [
      'Function("x")',
      'globalThis.Function("x")',
      'globalThis["Function"]("x")',
      'Function?.("x")',
      'eval("x")',
      '(0,eval)("x")',
    ])
      expect(() => assertReviewedDynamicCode(`${reviewed};${extra}`, "key-derivation")).toThrow(
        /counts/u,
      );
    expect(dynamicCodeCounts('new Function("x");Function("y");')).toEqual({
      functions: 2,
      evals: 0,
    });
    for (const tool of ["activity-viewer", "discovery-scanner", "psbt-inspector"])
      expect(() => assertReviewedDynamicCode("const publicValue = 1;", tool)).not.toThrow();
  });
  it("refuses a host manifest write and requires both container execution markers", () => {
    const canonical = { WALLET_TOOLS_CANONICAL_WASM: "1" };
    expect(() => assertCanonicalManifestWriter({}, "/home/user/checkout")).toThrow(/Refusing/u);
    expect(() => assertCanonicalManifestWriter(canonical, "/home/user/checkout")).toThrow(
      /Refusing/u,
    );
    expect(() => assertCanonicalManifestWriter({}, CANONICAL_WORKSPACE)).toThrow(/Refusing/u);
    expect(() => assertCanonicalManifestWriter(canonical, CANONICAL_WORKSPACE)).not.toThrow();
  });
  it("renders only selected coin protocols in each footer", () => {
    for (const coin of ["bitcoin", "ethereum", "dash"])
      for (const tool of ["key-derivation", "discovery-scanner"]) {
        const text = new ToolProtocolFooter(BUILD_PROFILES["multi-chain"], {
          coins: [coin],
        }).render(tool);
        for (const other of ["bitcoin", "ethereum", "dash"].filter((name) => name !== coin))
          expect(text.toLowerCase()).not.toContain(other);
      }
    expect(
      new ToolProtocolFooter(BUILD_PROFILES["dash-community"]).render("psbt-inspector"),
    ).not.toContain("Taproot");
  });
  it("inventories every MHFE page importer, including checked generation", () => {
    const included = new Set(MhfeIntegrationModules.files(root));
    expect(included.has("apps/key-derivation/src/ui/checked-mnemonic-feature.ts")).toBe(true);
    for (const name of readdirSync(resolve(root, "apps/key-derivation/src/ui"))) {
      const path = `apps/key-derivation/src/ui/${name}`;
      if (name.endsWith(".ts") && /from "@ckd\/recovery-mhfe-wasm\//u.test(read(path)))
        expect(included.has(path), path).toBe(true);
    }
  });
  it("derives test aliases from every TypeScript path, preserving generated extensions", () => {
    const aliases = config.resolve.alias;
    for (const [name, [target]] of Object.entries(tsconfig.compilerOptions.paths)) {
      const generated = target.includes("/generated/");
      const input = name.replace("*", "owner.js");
      const match = aliases.find(({ find }) =>
        typeof find === "string" ? find === input : find.test(input),
      );
      expect(match, name).toBeDefined();
      const actual =
        typeof match.find === "string"
          ? match.replacement
          : input.replace(match.find, match.replacement);
      expect(actual).toBe(resolve(root, target.replace("*", generated ? "owner.js" : "owner.ts")));
    }
  });
  it("drops Bitcoin network metadata when only Dash is imported", async () => {
    for (const [getter, containsBitcoin] of [
      ["getDashNetwork", false],
      ["getBitcoinNetwork", true],
    ]) {
      const result = await build({
        absWorkingDir: root,
        stdin: {
          contents: `import { ${getter} } from "./packages/crypto-core/src/networks.ts"; console.log(${getter}("mainnet"));`,
          resolveDir: root,
          loader: "ts",
        },
        bundle: true,
        write: false,
        treeShaking: true,
        minify: true,
        platform: "browser",
      });
      const text = result.outputFiles[0].text;
      expect(text.includes("Bitcoin mainnet")).toBe(containsBitcoin);
      expect(text.includes("Dash mainnet")).toBe(!containsBitcoin);
    }
  });

  it("keeps expensive CI jobs and vector replays manual", () => {
    const ci = read(".github/workflows/ci.yml");
    for (const job of ["canonical", "browser"]) {
      const block = ci.split(`  ${job}:`)[1].split(/\n  [a-z]+:/u)[0];
      expect(block).toContain("if: github.event_name == 'workflow_dispatch'");
    }
    for (const file of ["full-wasm.yml", "vectors.yml"]) {
      const on = read(`.github/workflows/${file}`).split("on:\n")[1].split("\npermissions:")[0];
      expect(on.trim()).toBe("workflow_dispatch:");
    }
    expect(read("tooling/build-key-derivation-launchers.mjs")).toContain(
      "resolveRustToolchain(root)",
    );
  });
  it("limits banner grids to warnings containing an icon and keeps the shared list grammar", () => {
    const css = read("packages/shared-ui/styles/main.css");
    expect(css.match(/\.warning \{([^}]+)\}/u)[1]).not.toContain("grid-template-columns");
    expect(css).toContain(".warning:has(> .warning-icon)");
    expect(englishList(["a", "b"], "or")).toBe("a or b");
    expect(englishList(["a", "b", "c"])).toBe("a, b, and c");
  });
});

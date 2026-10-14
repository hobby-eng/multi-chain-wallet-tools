import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { VendoredMhfePackage } from "./vendored-mhfe-package.mjs";
import { bindgenStaged, runTool } from "./wasm-build.mjs";

const temporary = [];
afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true });
});
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const valid = () => ({ runtime: { files: { "worker.js": sha256("worker") } }, modules: {} });
function fixture(manifest = valid()) {
  const root = mkdtempSync(join(tmpdir(), "mhfe-admission-fixture-"));
  temporary.push(root);
  const folder = join(root, VendoredMhfePackage.DIRECTORY);
  mkdirSync(join(folder, "runtime"), { recursive: true });
  writeFileSync(join(folder, "runtime/worker.js"), "worker");
  const bytes = JSON.stringify(manifest);
  writeFileSync(join(folder, "modules.json"), bytes);
  return { root, folder, owner: new VendoredMhfePackage(root, sha256(bytes)) };
}

describe("MHFE inventory refuses unsafe inputs before publishing paths", () => {
  it("admits pinned bytes but refuses changed files at enumeration too", () => {
    const { folder, owner } = fixture();
    expect(owner.entries()).toEqual([{ path: "runtime/worker.js", sha256: sha256("worker") }]);
    writeFileSync(join(folder, "runtime/worker.js"), "mutated");
    expect(() => owner.files()).toThrow(/does not match modules\.json/u);
  });

  it("refuses malformed manifest shapes and module dependencies", () => {
    for (const manifest of [
      [],
      { runtime: [], modules: {} },
      { ...valid(), modules: { runtime: { files: { "x.js": sha256("x") } } } },
      { runtime: { files: { "worker.js": sha256("worker") }, requires: ["missing"] }, modules: {} },
    ])
      expect(() => fixture(manifest).owner.entries()).toThrow(/Invalid MHFE manifest/u);
  });

  it("refuses paths that escape their module and malformed hashes", () => {
    for (const name of ["../outside.js", "/outside.js", "a\\b.js", "./worker.js", ""])
      expect(() =>
        fixture({ runtime: { files: { [name]: sha256("worker") } }, modules: {} }).owner.entries(),
      ).toThrow(/safe relative path/u);
    for (const hash of ["not-a-hash", "A".repeat(64), null])
      expect(() =>
        fixture({ runtime: { files: { "worker.js": hash } }, modules: {} }).owner.files(),
      ).toThrow(/Invalid MHFE manifest hash/u);
  });

  for (const directory of [false, true])
    it(`refuses a linked ${directory ? "directory" : "file"} while enumerating`, () => {
      const { root, folder, owner } = fixture();
      const outside = join(root, "outside");
      mkdirSync(outside);
      writeFileSync(join(outside, "worker.js"), "worker");
      const target = join(folder, directory ? "runtime" : "runtime/worker.js");
      rmSync(target, { recursive: true });
      symlinkSync(directory ? outside : join(outside, "worker.js"), target);
      expect(() => owner.entries()).toThrow(/only regular files and directories/u);
    });
});

describe("WASM staging cleans up failed subprocesses", () => {
  it("throws the subprocess result through the staging finally without exiting the process", async () => {
    const stagingRoot = mkdtempSync(join(tmpdir(), "wasm-staging-fixture-"));
    temporary.push(stagingRoot);
    const error = new Error("synthetic bindgen failure");
    await expect(
      bindgenStaged(
        { archiveDirectory: "fixture", stem: "fixture" },
        "synthetic.wasm",
        { wasmBindgen: "synthetic-bindgen", environment: {} },
        () => {
          throw new Error("finish must not run");
        },
        { stagingRoot, run: () => runTool("synthetic-bindgen", [], {}, () => ({ status: 7 })) },
      ),
    ).rejects.toMatchObject({ exitCode: 7 });
    expect(readdirSync(stagingRoot)).toEqual([]);
    expect(() => runTool("synthetic-bindgen", [], {}, () => ({ error }))).toThrow(error);
  });
});

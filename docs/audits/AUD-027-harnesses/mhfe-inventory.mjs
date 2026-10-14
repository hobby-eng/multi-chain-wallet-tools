// AUD-024-BLD001 follow-up: only inventory/hash reads, never the release-record entry point.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { parsers } from "prettier/plugins/babel";
import { VendoredMhfePackage } from "../../../tooling/vendored-mhfe-package.mjs";
import { WASM_MODULES } from "../../../tooling/wasm-modules.mjs";

class InventoryReview {
  #root = fileURLToPath(new URL("../../..", import.meta.url));

  async run() {
    const source = readFileSync(
      resolve(this.#root, "tooling/create-verification-record.mjs"),
      "utf8",
    );
    const ast = await parsers.babel.parse(source);
    const declaration = (name) => {
      const node = ast.program.body.find(
        (item) =>
          item.type === "VariableDeclaration" &&
          item.declarations.some((entry) => entry.id.name === name),
      );
      if (node === undefined) throw new Error(`Reassess the probe: ${name} no longer exists.`);
      return source.slice(node.start, node.end);
    };
    const digest = (path) =>
      createHash("sha256")
        .update(readFileSync(resolve(this.#root, path)))
        .digest("hex");
    const records = runInNewContext(
      `${declaration("wasmFiles")}\n${declaration("wasm")}\nwasm;`,
      {
        root: this.#root,
        VendoredMhfePackage,
        WASM_MODULES,
        resolve,
        readdirSync,
        readFileSync,
        digest,
      },
      { timeout: 1_000 },
    );
    const packageOwner = new VendoredMhfePackage(this.#root);
    packageOwner.verify(digest(packageOwner.manifestPath));
    let wrongPinRefused = false;
    try {
      packageOwner.verify("0".repeat(64));
    } catch (cause) {
      wrongPinRefused = /Pinned source checksum mismatch/u.test(cause.message);
    }
    const paths = records.map(({ path }) => path);
    const actual = new Set(paths);
    const complete = packageOwner.files().every((path) => actual.has(path));
    // Both Argon2 engines are mandatory, even when inventory ownership is refactored.
    const engines = ["argon2-mt.js", "argon2-st.js"].every((name) =>
      paths.some((path) => path.endsWith(`/${name}`)),
    );
    const contractPassed = complete && engines && wrongPinRefused && actual.size === paths.length;
    console.log(
      JSON.stringify(
        {
          scope:
            "Actual AST-extracted record inventory and real manifest owner; no build or record publication",
          totalRecords: records.length,
          mhfeRecords: packageOwner.files().length,
          complete,
          engines,
          wrongPinRefused,
          contractPassed,
        },
        null,
        2,
      ),
    );
    process.exitCode = contractPassed ? 0 : 1;
  }
}

await new InventoryReview().run();

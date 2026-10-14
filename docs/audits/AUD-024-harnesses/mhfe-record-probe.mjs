// Execute only the real record generator's file inventory. Never write dist or run a build.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { parsers } from "prettier/plugins/babel";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const sourcePath = resolve(root, "tooling/create-verification-record.mjs");
const source = readFileSync(sourcePath, "utf8");
const ast = await parsers.babel.parse(source);
const declaration = (name) => {
  const node = ast.program.body.find(
    (item) =>
      item.type === "VariableDeclaration" &&
      item.declarations.some((entry) => entry.id.name === name),
  );
  if (!node) throw new Error(`Record generator no longer defines ${name}; reassess the probe.`);
  return source.slice(node.start, node.end);
};
const fragment = `${declaration("generatedDirectories")}\n${declaration("wasm")}`;
let observed = null;
let lastReadPath = null;
try {
  runInNewContext(
    fragment,
    {
      root,
      resolve,
      readdirSync,
      readFileSync: (path, ...options) => {
        lastReadPath = relative(root, path);
        return readFileSync(path, ...options);
      },
      digest: (path) =>
        createHash("sha256")
          .update(readFileSync(resolve(root, path)))
          .digest("hex"),
    },
    { timeout: 1000 },
  );
} catch (error) {
  observed = {
    code: error.code ?? null,
    path: error.path ? relative(root, error.path) : lastReadPath,
  };
}
console.log(
  JSON.stringify(
    {
      source: "tooling/create-verification-record.mjs",
      sourceSha256: createHash("sha256").update(source).digest("hex"),
      executionScope:
        "Exact AST-extracted generatedDirectories and wasm declarations only; full record entry point not run",
      observed,
      contractPassed: observed === null,
    },
    null,
    2,
  ),
);
process.exitCode = observed === null ? 0 : 1;

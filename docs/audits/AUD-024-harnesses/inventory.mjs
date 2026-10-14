// Architecture candidates only. No product source is executed or modified.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parsers } from "prettier/plugins/babel";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const evidence = resolve(root, "docs/audits/AUD-024-evidence");
// Captured Git inventory avoids the restricted nested spawnSync path and binds the file set.
const captured = JSON.parse(readFileSync(resolve(evidence, "source-manifest.json"), "utf8"));
const manifest = Array.isArray(captured) ? captured : captured.files;
const excluded =
  /(?:^|\/)(?:tests?|generated|node_modules|dist)(?:\/|$)|^packages\/recovery-mnemocode\/source\//u;
const paths = manifest
  .map((item) => item.path)
  .filter(
    (path) =>
      /^(?:apps|packages|tooling)\//u.test(path) &&
      /\.(?:ts|mjs|rs)$/u.test(path) &&
      !excluded.test(path) &&
      !/\.test\.(?:ts|mjs)$/u.test(path),
  )
  .sort();
const pathSet = new Set(paths);
const aliases = JSON.parse(readFileSync(resolve(root, "tsconfig.json"), "utf8")).compilerOptions
  .paths;
const files = [],
  functions = [],
  edges = [],
  unresolved = [],
  parseFailures = [];
const literals = new Map(),
  numbers = new Map();
const sha = (value) => createHash("sha256").update(value).digest("hex");
const add = (map, value, site) => map.set(value, [...(map.get(value) ?? []), site]);
const ignoredKeys = new Set([
  "loc",
  "start",
  "end",
  "range",
  "extra",
  "comments",
  "leadingComments",
  "trailingComments",
  "innerComments",
]);
function canonical(value, alpha = false) {
  if (typeof value === "bigint") return { auditBigInt: value.toString() };
  if (Array.isArray(value)) return value.map((item) => canonical(item, alpha));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !ignoredKeys.has(key))
      .sort()
      .map((key) => [
        key,
        alpha && value.type === "Identifier" && key === "name"
          ? "$identifier"
          : canonical(value[key], alpha),
      ]),
  );
}
function nodeCount(value) {
  if (Array.isArray(value)) return value.reduce((sum, node) => sum + nodeCount(node), 0);
  if (value === null || typeof value !== "object") return 0;
  return (
    (typeof value.type === "string" ? 1 : 0) +
    Object.keys(value)
      .filter((key) => !ignoredKeys.has(key))
      .reduce((sum, key) => sum + nodeCount(value[key]), 0)
  );
}
function resolveImport(path, specifier) {
  let candidate;
  if (specifier.startsWith(".")) candidate = resolve(root, dirname(path), specifier);
  else
    for (const [key, targets] of Object.entries(aliases)) {
      const prefix = key.replace(/\*$/u, "");
      if ((key.endsWith("*") && specifier.startsWith(prefix)) || specifier === key) {
        candidate = resolve(root, targets[0].replace("*", specifier.slice(prefix.length)));
        break;
      }
    }
  if (!candidate) return undefined;
  for (const option of [
    candidate.replace(/\.js$/u, ".ts"),
    candidate,
    `${candidate}.ts`,
    `${candidate}.mjs`,
    resolve(candidate, "index.ts"),
  ])
    if (existsSync(option)) return relative(root, option);
  return null;
}
const functionKinds = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassMethod",
  "ClassPrivateMethod",
  "ObjectMethod",
]);
for (const path of paths) {
  const text = readFileSync(resolve(root, path), "utf8");
  const record = {
    path,
    lines: text.split("\n").length,
    bytes: Buffer.byteLength(text),
    sha256: sha(text),
    classes: 0,
    functions: 0,
  };
  files.push(record);
  if (path.endsWith(".rs")) continue; // Rust is inventoried and manually reviewed, not AST compared.
  let source;
  try {
    source = await parsers[path.endsWith(".ts") ? "babel-ts" : "babel"].parse(text);
  } catch (cause) {
    parseFailures.push({ path, error: String(cause.message) });
    continue;
  }
  function dependency(node, specifier, typeOnly = false) {
    const target = resolveImport(path, specifier);
    if (target === null)
      unresolved.push({ path, line: node.loc.start.line, import: specifier, typeOnly });
    else if (pathSet.has(target))
      edges.push({ from: path, to: target, line: node.loc.start.line, typeOnly });
  }
  function visit(node, parent) {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, parent));
      return;
    }
    if (node.type === "ClassDeclaration" || node.type === "ClassExpression") record.classes += 1;
    if (functionKinds.has(node.type) && node.body) {
      record.functions += 1;
      const body = text.slice(node.body.start, node.body.end);
      const count = nodeCount(node.body);
      if (count >= 35 && body.split("\n").length >= 6)
        functions.push({
          path,
          line: node.loc.start.line,
          endLine: node.loc.end.line,
          name:
            node.id?.name ??
            node.key?.name ??
            node.key?.id?.name ??
            parent?.id?.name ??
            "anonymous",
          lines: body.split("\n").length,
          nodes: count,
          exactHash: sha(JSON.stringify(canonical(node.body))),
          alphaHash: sha(JSON.stringify(canonical(node.body, true))),
        });
    }
    if (node.type === "StringLiteral" && node.value.length >= 20 && node.value.length <= 250)
      add(literals, node.value, { path, line: node.loc.start.line });
    if (node.type === "NumericLiteral" && [24, 256, 2048, 65536, 96, 112].includes(node.value))
      add(numbers, String(node.value), { path, line: node.loc.start.line });
    if (
      ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) &&
      node.source
    )
      dependency(
        node,
        node.source.value,
        node.importKind === "type" ||
          node.exportKind === "type" ||
          (node.specifiers?.length > 0 &&
            node.specifiers.every((item) => item.importKind === "type")),
      );
    if (node.type === "ImportExpression" && node.source?.type === "StringLiteral")
      dependency(node, node.source.value);
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "Import" &&
      node.arguments?.[0]?.type === "StringLiteral"
    )
      dependency(node, node.arguments[0].value);
    for (const key of Object.keys(node)) if (!ignoredKeys.has(key)) visit(node[key], node);
  }
  visit(source, null);
}
function clusters(field) {
  const groups = new Map();
  for (const item of functions) add(groups, item[field], item);
  return [...groups.values()]
    .filter((group) => group.length >= 2)
    .sort((a, b) => b.length - a.length || a[0].path.localeCompare(b[0].path));
}
const runtimeEdges = edges.filter((edge) => !edge.typeOnly);
const adjacency = new Map(
  paths.map((path) => [
    path,
    runtimeEdges.filter((edge) => edge.from === path).map((edge) => edge.to),
  ]),
);
const indices = new Map(),
  low = new Map(),
  stack = [],
  onStack = new Set(),
  cycles = [];
let next = 0;
function connected(path) {
  indices.set(path, next);
  low.set(path, next++);
  stack.push(path);
  onStack.add(path);
  for (const target of adjacency.get(path) ?? []) {
    if (!indices.has(target)) {
      connected(target);
      low.set(path, Math.min(low.get(path), low.get(target)));
    } else if (onStack.has(target)) low.set(path, Math.min(low.get(path), indices.get(target)));
  }
  if (low.get(path) === indices.get(path)) {
    const group = [];
    let current;
    do {
      current = stack.pop();
      onStack.delete(current);
      group.push(current);
    } while (current !== path);
    if (group.length > 1) cycles.push(group.sort());
  }
}
for (const path of paths) if (!indices.has(path)) connected(path);
const result = {
  method:
    "Prettier's installed Babel AST: function-body candidates, literals, statically resolved first-party relative/tsconfig imports. Excludes tests, generated/vendor code. Rust receives inventory/manual review only. Candidate counts are not semantic duplication counts.",
  thresholds: { minimumFunctionBodyNodes: 35, minimumFunctionBodyLines: 6 },
  files,
  functions,
  exactFunctionClusters: clusters("exactHash"),
  renamedIdentifierCandidates: clusters("alphaHash"),
  repeatedStrings: [...literals]
    .filter(([, sites]) => sites.length >= 2)
    .map(([text, sites]) => ({ text, sites }))
    .sort((a, b) => b.sites.length - a.sites.length),
  selectedNumericLiteralSites: Object.fromEntries(numbers),
  importEdges: edges,
  unresolvedImports: unresolved,
  parseFailures,
  runtimeStronglyConnectedComponents: cycles,
};
writeFileSync(resolve(evidence, "inventory.json"), JSON.stringify(result, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      files: files.length,
      lines: files.reduce((sum, file) => sum + file.lines, 0),
      classes: files.reduce((sum, file) => sum + file.classes, 0),
      functionBodiesScanned: functions.length,
      exactFunctionClusters: result.exactFunctionClusters.length,
      renamedIdentifierCandidates: result.renamedIdentifierCandidates.length,
      repeatedStringGroups: result.repeatedStrings.length,
      resolvedFirstPartyImportEdges: edges.length,
      unresolvedFirstPartyImports: unresolved.length,
      runtimeStronglyConnectedComponents: cycles.length,
      parseFailures: parseFailures.length,
      note: "Candidate counts are not semantic-duplication counts.",
    },
    null,
    2,
  ),
);
if (parseFailures.length) process.exitCode = 1;

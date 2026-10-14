// AUD-026 architecture harness: the resolved first-party import graph of the production sources
// (apps/*, packages/*, tooling/, test/support excluded from production), parsed with Babel (through
// Prettier's parser plugin, as AUD-024's inventory did) rather than with a regular expression, so
// that dynamic import(), `export … from` and `new URL("…", import.meta.url)` are seen too.
//
// It reports, and exits 1 when any of the first four is non-empty:
//   1. unresolved first-party specifiers (relative or @ckd/*) in production files;
//   2. a package importing an application, or an application importing another application;
//   3. a production file importing test code (tests/, *.test.*, test/support);
//   4. runtime strongly connected components (file-level import cycles, type-only edges left out);
//   5. (informational) package-level edges, apps that reach vendored sources by deep relative paths,
//      and type-only cycles.
//
//   node docs/audits/AUD-026-harnesses/architecture-import-graph.mjs [output.json]
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parsers } from "prettier/plugins/babel";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const output = process.argv[2];
const SKIP_DIRS = new Set(["node_modules", "dist", "test-results", "generated", "tests", "fixtures"]);
const SOURCE = /\.(?:ts|mjs|js)$/u;
const TEST = /\.test\.(?:ts|mjs)$/u;

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : walk(path);
    return SOURCE.test(entry.name) && !TEST.test(entry.name) ? [path] : [];
  });
}

const rel = (path) => relative(root, path).replaceAll("\\", "/");
// Vendored MnemoCode source is synced, not first-party; it is a target, not a scanned origin.
const isVendored = (path) => /^packages\/recovery-mnemocode\/source\//u.test(path);
const files = [
  ...walk(join(root, "apps")),
  ...walk(join(root, "packages")),
  ...readdirSync(join(root, "tooling"))
    .filter((name) => SOURCE.test(name) && !TEST.test(name))
    .map((name) => join(root, "tooling", name)),
]
  .map(rel)
  .filter((path) => !isVendored(path) && !path.includes("/launcher/"))
  .sort();

const aliases = Object.entries(
  JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8")).compilerOptions.paths,
).map(([alias, [target]]) => ({ alias, target }));

function resolveFile(base) {
  const candidates = [
    base,
    base.replace(/\.js$/u, ".ts"),
    base.replace(/\.mjs$/u, ".mts"),
    `${base}.ts`,
    `${base}.mjs`,
    `${base}.js`,
    join(base, "index.ts"),
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function resolveSpecifier(from, specifier) {
  if (specifier.startsWith(".")) return resolveFile(resolve(root, dirname(from), specifier));
  for (const { alias, target } of aliases) {
    if (alias.endsWith("/*")) {
      const prefix = alias.slice(0, -1);
      if (specifier.startsWith(prefix))
        return resolveFile(resolve(root, target.slice(0, -1) + specifier.slice(prefix.length)));
    } else if (specifier === alias) return resolveFile(resolve(root, target));
  }
  return null;
}

const firstParty = (specifier) => specifier.startsWith(".") || specifier.startsWith("@ckd/");

function specifiersOf(path) {
  const text = readFileSync(join(root, path), "utf8");
  const parser = path.endsWith(".ts") ? parsers["babel-ts"] : parsers.babel;
  const ast = parser.parse(text, { filepath: path });
  const found = [];
  const visit = (node) => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    switch (node.type) {
      case "ImportDeclaration":
        found.push({
          specifier: node.source.value,
          typeOnly:
            node.importKind === "type" ||
            (node.specifiers.length > 0 &&
              node.specifiers.every((s) => s.importKind === "type")),
          kind: "static",
        });
        break;
      case "ExportNamedDeclaration":
      case "ExportAllDeclaration":
        if (node.source)
          found.push({
            specifier: node.source.value,
            typeOnly: node.exportKind === "type",
            kind: "re-export",
          });
        break;
      case "ImportExpression":
        if (node.source?.type === "StringLiteral")
          found.push({ specifier: node.source.value, typeOnly: false, kind: "dynamic" });
        break;
      case "CallExpression":
        if (node.callee?.type === "Import" && node.arguments[0]?.type === "StringLiteral")
          found.push({ specifier: node.arguments[0].value, typeOnly: false, kind: "dynamic" });
        break;
      case "NewExpression":
        if (
          node.callee?.type === "Identifier" &&
          node.callee.name === "URL" &&
          node.arguments[0]?.type === "StringLiteral" &&
          node.arguments[1]?.type === "MemberExpression" &&
          node.arguments[1].object?.type === "MetaProperty"
        )
          found.push({ specifier: node.arguments[0].value, typeOnly: false, kind: "url" });
        break;
      case "TSImportType":
        break;
    }
    for (const [key, value] of Object.entries(node))
      if (!["loc", "start", "end", "range", "comments", "extra"].includes(key)) visit(value);
  };
  visit(ast.program ?? ast);
  return found;
}

const owner = (path) => {
  const match = /^(apps|packages)\/([^/]+)\//u.exec(path);
  return match ? `${match[1]}/${match[2]}` : path.startsWith("tooling/") ? "tooling" : "other";
};
const isTestPath = (path) =>
  /(?:^|\/)tests?\//u.test(path) || TEST.test(path) || path.startsWith("test/");

const report = {
  files: files.length,
  edges: 0,
  unresolved: [],
  appToOtherApp: [],
  packageToApp: [],
  productionToTest: [],
  runtimeCycles: [],
  typeOnlyCycles: [],
  deepVendoredImports: [],
  packageEdges: {},
  parseFailures: [],
};
const runtime = new Map();
const all = new Map();
for (const path of files) {
  let found;
  try {
    found = specifiersOf(path);
  } catch (error) {
    report.parseFailures.push({ path, error: String(error.message ?? error).slice(0, 200) });
    continue;
  }
  runtime.set(path, new Set());
  all.set(path, new Set());
  for (const { specifier, typeOnly, kind } of found) {
    if (!firstParty(specifier)) continue;
    const target = resolveSpecifier(path, specifier);
    if (target === undefined || target === null) {
      // `new URL("./x.wasm", import.meta.url)` naming a generated or built asset is not a module.
      if (kind === "url" && !existsSync(resolve(root, dirname(path), specifier)))
        report.unresolved.push({ path, specifier, kind, note: "asset URL" });
      else if (kind !== "url") report.unresolved.push({ path, specifier, kind });
      continue;
    }
    const to = rel(target);
    report.edges += 1;
    all.get(path).add(to);
    if (!typeOnly && kind !== "url") runtime.get(path).add(to);
    const [from, into] = [owner(path), owner(to)];
    if (from.startsWith("apps/") && into.startsWith("apps/") && from !== into)
      report.appToOtherApp.push({ path, specifier, kind });
    if (from.startsWith("packages/") && into.startsWith("apps/"))
      report.packageToApp.push({ path, specifier, kind });
    if (isTestPath(to)) report.productionToTest.push({ path, specifier, kind, typeOnly });
    if (isVendored(to) && specifier.startsWith("."))
      report.deepVendoredImports.push({ path, specifier });
    if (from !== into) {
      report.packageEdges[from] ??= {};
      report.packageEdges[from][into] = (report.packageEdges[from][into] ?? 0) + 1;
    }
  }
}

// Tarjan's strongly connected components.
function components(graph) {
  let index = 0;
  const stack = [];
  const on = new Set();
  const indexes = new Map();
  const low = new Map();
  const result = [];
  const strong = (node) => {
    indexes.set(node, index);
    low.set(node, index);
    index += 1;
    stack.push(node);
    on.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!graph.has(next)) continue;
      if (!indexes.has(next)) {
        strong(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (on.has(next)) low.set(node, Math.min(low.get(node), indexes.get(next)));
    }
    if (low.get(node) === indexes.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        on.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1 || (graph.get(node) ?? new Set()).has(node))
        result.push(component.sort());
    }
  };
  for (const node of graph.keys()) if (!indexes.has(node)) strong(node);
  return result;
}
report.runtimeCycles = components(runtime);
const runtimeKeys = new Set(report.runtimeCycles.map((c) => c.join("|")));
report.typeOnlyCycles = components(all).filter((c) => !runtimeKeys.has(c.join("|")));

const failures =
  report.unresolved.filter((u) => u.note === undefined).length +
  report.appToOtherApp.length +
  report.packageToApp.length +
  report.productionToTest.length +
  report.runtimeCycles.length +
  report.parseFailures.length;
const text = JSON.stringify(report, null, 2);
if (output) writeFileSync(output, text + "\n");
console.log(
  JSON.stringify(
    {
      files: report.files,
      edges: report.edges,
      unresolved: report.unresolved,
      appToOtherApp: report.appToOtherApp,
      packageToApp: report.packageToApp,
      productionToTest: report.productionToTest,
      runtimeCycles: report.runtimeCycles,
      typeOnlyCycles: report.typeOnlyCycles,
      deepVendoredImports: report.deepVendoredImports.length,
      parseFailures: report.parseFailures,
    },
    null,
    2,
  ),
);
process.exitCode = failures > 0 ? 1 : 0;

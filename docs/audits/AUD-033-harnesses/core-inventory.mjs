/** Static CORE migration inventory; no production changes and no runtime wallet operations. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API } from "typescript/unstable/sync";
import { SyntaxKind as K } from "typescript/unstable/ast";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const evidence = resolve(root, "docs/audits/AUD-033-evidence");
const omitted = new Set([
  "node_modules",
  "generated",
  "source",
  "notices",
  "target",
  "dist",
  "output",
  "fixtures",
  ".git",
]);
const endings = new Set([".ts", ".mjs", ".js", ".rs", ".sh", ".py", ".css", ".html"]);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const source = [];
function collect(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (omitted.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.isFile() && endings.has(extname(path))) source.push(relative(root, path));
  }
}
for (const directory of ["apps", "packages", "tooling", "test"]) collect(resolve(root, directory));
for (const entry of readdirSync(root)) if (/\.(ts|mjs)$/u.test(entry)) source.push(entry);
source.sort();
mkdirSync(evidence, { recursive: true });
const text = new Map(source.map((path) => [path, readFileSync(resolve(root, path), "utf8")]));
const kind = (path) =>
  /(?:^|\/)(?:tests?|browser-cases)\/|\.test\./u.test(path)
    ? "test"
    : /^(?:tooling\/|.*\/scripts\/)/u.test(path)
      ? "tooling"
      : "production";
const files = source.map((path) => ({
  path,
  kind: kind(path),
  lines: text.get(path).split("\n").length - Number(text.get(path).endsWith("\n")),
  sha256: sha(text.get(path)),
}));
const configPath = resolve(evidence, "tsconfig.json");
writeFileSync(
  configPath,
  JSON.stringify(
    {
      extends: "../../../tsconfig.json",
      compilerOptions: { allowJs: true, checkJs: false },
      files: source
        .filter((path) => /\.(ts|mjs|js)$/u.test(path))
        .map((path) => `../../../${path}`),
      include: [],
    },
    null,
    2,
  ),
);
const result = {
  files,
  counts: {},
  overlongFiles: files.filter((file) => file.lines > 800),
  functions: [],
  any: [],
  nonNull: [],
  privateKeyword: [],
  enums: [],
  errorClasses: [],
  genericErrors: [],
  libraryExports: [],
  exportedFunctions: [],
  classModules: [],
  imports: [],
  parseMissing: [],
};
const functionKinds = new Set([
  K.FunctionDeclaration,
  K.FunctionExpression,
  K.ArrowFunction,
  K.MethodDeclaration,
  K.Constructor,
  K.GetAccessor,
  K.SetAccessor,
]);
const api = new API({ cwd: root });
try {
  const snapshot = api.updateSnapshot({ openProjects: [configPath] });
  const project = snapshot.getProject(configPath);
  for (const path of source.filter((file) => /\.(ts|mjs|js)$/u.test(file))) {
    const file = project.program.getSourceFile(resolve(root, path));
    if (!file) {
      result.parseMissing.push(path);
      continue;
    }
    let classes = 0;
    const line = (node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    const location = (node) => ({ path, line: line(node), kind: kind(path) });
    const visit = (node) => {
      if (functionKinds.has(node.kind) && node.body) {
        const length = file.getLineAndCharacterOfPosition(node.end).line + 1 - line(node) + 1;
        if (length > 100)
          result.functions.push({
            ...location(node),
            name: node.name?.getText(file) ?? "anonymous",
            lines: length,
          });
      }
      if (node.kind === K.AnyKeyword) result.any.push(location(node));
      if (node.kind === K.NonNullExpression) result.nonNull.push(location(node));
      if (node.kind === K.PrivateKeyword)
        result.privateKeyword.push({
          ...location(node),
          constructorOnly: node.parent?.kind === K.Constructor,
        });
      if (node.kind === K.EnumDeclaration) result.enums.push(location(node));
      if (node.kind === K.ClassDeclaration) {
        classes += 1;
        if (
          node.heritageClauses?.some((clause) =>
            clause.types.some((type) => /(?:^|\.)Error$/u.test(type.expression.getText(file))),
          )
        ) {
          result.errorClasses.push({
            ...location(node),
            name: node.name?.getText(file),
            hasCode: node.members.some((member) => member.name?.getText(file) === "code"),
          });
        }
      }
      if (
        node.kind === K.NewExpression &&
        ["Error", "TypeError", "RangeError"].includes(node.expression.getText(file))
      )
        result.genericErrors.push({ ...location(node), name: node.expression.getText(file) });
      if ([K.ImportDeclaration, K.ExportDeclaration].includes(node.kind) && node.moduleSpecifier)
        result.imports.push({
          ...location(node),
          specifier: node.moduleSpecifier.text,
          typeOnly: Boolean(node.isTypeOnly || node.importClause?.isTypeOnly),
        });
      node.forEachChild((child) => {
        visit(child);
      });
    };
    visit(file);
    if (classes > 0) result.classModules.push(path);
    for (const statement of file.statements) {
      if (!statement.modifiers?.some((modifier) => modifier.kind === K.ExportKeyword)) continue;
      if (/^packages\/[^/]+\/src\//u.test(path)) {
        const before = text.get(path).slice(statement.pos, statement.getStart(file));
        result.libraryExports.push({
          ...location(statement),
          documented: /\/\*\*[\s\S]*?\*\//u.test(before),
          declaration: K[statement.kind],
        });
      }
      if (statement.kind === K.FunctionDeclaration)
        result.exportedFunctions.push({
          ...location(statement),
          name: statement.name?.getText(file),
        });
    }
  }
} finally {
  api.close();
}
for (const group of ["production", "test", "tooling"])
  result.counts[group] = {
    files: files.filter((file) => file.kind === group).length,
    lines: files.filter((file) => file.kind === group).reduce((sum, file) => sum + file.lines, 0),
    overlongFiles: result.overlongFiles.filter((file) => file.kind === group).length,
    functionsOver150: result.functions.filter((entry) => entry.kind === group && entry.lines > 150)
      .length,
    any: result.any.filter((entry) => entry.kind === group).length,
    nonNull: result.nonNull.filter((entry) => entry.kind === group).length,
    privateKeyword: result.privateKeyword.filter((entry) => entry.kind === group).length,
  };
result.sourceFingerprint = sha(files.map((file) => `${file.path}\0${file.sha256}\n`).join(""));
result.method =
  "TypeScript 7.0.2 syntax-tree inventory. Physical spans include blanks/comments and nested callbacks; these are migration candidates, not oxlint-equivalent failure counts. Excludes imported source/generated/notices, fixtures, audit harnesses and evidence. No semantic CORE compliance is inferred from counts.";
writeFileSync(resolve(evidence, "inventory.json"), JSON.stringify(result, null, 2) + "\n");
const graph = new Map(
  source.filter((path) => /\.(ts|mjs|js)$/u.test(path)).map((path) => [path, []]),
);
const aliases = JSON.parse(readFileSync(resolve(root, "tsconfig.json"), "utf8")).compilerOptions
  .paths;
let omittedEdges = 0;
for (const entry of result.imports.filter((item) => !item.typeOnly)) {
  let target;
  if (entry.specifier.startsWith("."))
    target = posix.normalize(posix.join(posix.dirname(entry.path), entry.specifier));
  else
    for (const [alias, destinations] of Object.entries(aliases)) {
      if (alias.endsWith("*") && entry.specifier.startsWith(alias.slice(0, -1)))
        target = destinations[0].replace("*", entry.specifier.slice(alias.length - 1));
      else if (alias === entry.specifier) target = destinations[0];
      if (target !== undefined) break;
    }
  if (target === undefined) continue;
  target = target.replace(/^\.\//u, "");
  const matched = [
    target,
    target.endsWith(".js") ? target.slice(0, -3) + ".ts" : target + ".ts",
    target + "/index.ts",
  ].find((path) => graph.has(path));
  if (matched === undefined) omittedEdges += 1;
  else graph.get(entry.path).push(matched);
}
const indexes = new Map();
const low = new Map();
const stack = [];
const active = new Set();
const cycles = [];
function component(path) {
  indexes.set(path, indexes.size);
  low.set(path, indexes.get(path));
  stack.push(path);
  active.add(path);
  for (const target of graph.get(path)) {
    if (!indexes.has(target)) {
      component(target);
      low.set(path, Math.min(low.get(path), low.get(target)));
    } else if (active.has(target)) low.set(path, Math.min(low.get(path), indexes.get(target)));
  }
  if (low.get(path) !== indexes.get(path)) return;
  const group = [];
  let member;
  do {
    member = stack.pop();
    active.delete(member);
    group.push(member);
  } while (member !== path);
  if (group.length > 1) cycles.push(group.sort());
}
for (const path of graph.keys()) if (!indexes.has(path)) component(path);
writeFileSync(
  resolve(evidence, "import-graph.json"),
  JSON.stringify(
    {
      method:
        "Static import/export declarations resolved using tsconfig aliases and JS-to-TS paths; excludes type-only declarations. Mixed imports remain; dynamic/virtual modules and omitted vendor edges are not covered.",
      modules: graph.size,
      edges: [...graph.values()].reduce((sum, edges) => sum + edges.length, 0),
      cycles,
      unresolvedOrExcluded: omittedEdges,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    {
      fingerprint: result.sourceFingerprint,
      counts: result.counts,
      missing: result.parseMissing,
      errorClasses: result.errorClasses,
      overlongFiles: result.overlongFiles,
      largeFunctions: result.functions
        .filter((entry) => entry.lines > 150)
        .sort((a, b) => b.lines - a.lines)
        .slice(0, 20),
      undocumentedLibraryExports: result.libraryExports.filter((entry) => !entry.documented).length,
      libraryExports: result.libraryExports.length,
    },
    null,
    2,
  ),
);
if (result.parseMissing.length) process.exitCode = 1;

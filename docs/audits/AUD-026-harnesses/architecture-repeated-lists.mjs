// AUD-026 architecture harness: lists written out more than once. It parses the production sources
// (apps/*/src, packages/*/src without generated or vendored code) with Babel, through Prettier's
// parser plugin, and collects every array literal of three or more string or number literals: a
// list of values with a meaning, which AGENTS.md ("Object-oriented design and no repetition",
// rule 6) asks to define once. Lists with the same members, in any order, form one group.
//
// It also checks one named contract, exiting 1 when it fails: the Miniscript fragment classes of
// the PSBT Inspector (multisig fragments, single-key fragments) have one owner each.
//
// verify-no-copies.mjs finds copied runs of 50 tokens; a repeated short list is far below that.
//
//   node docs/audits/AUD-026-harnesses/architecture-repeated-lists.mjs [output.json]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parsers } from "prettier/plugins/babel";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const output = process.argv[2];
const SKIP = new Set(["node_modules", "generated", "tests", "dist", "source"]);

function walk(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : walk(path);
    return /\.ts$/u.test(entry.name) && !/\.(?:test|d)\.ts$/u.test(entry.name) ? [path] : [];
  });
}

const files = ["apps", "packages"]
  .flatMap(walk)
  .filter((path) => /^(?:apps|packages)\/[^/]+\/src\//u.test(path))
  .sort();

const lists = [];
for (const path of files) {
  const text = readFileSync(join(root, path), "utf8");
  const ast = parsers["babel-ts"].parse(text, { filepath: path });
  const visit = (node) => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (node.type === "ArrayExpression" && node.elements.length >= 3) {
      const values = node.elements.map((element) =>
        element?.type === "StringLiteral"
          ? `"${element.value}"`
          : element?.type === "NumericLiteral"
            ? String(element.value)
            : null,
      );
      if (values.every((value) => value !== null)) {
        const line = text.slice(0, node.start).split("\n").length;
        lists.push({ site: `${path}:${line}`, values });
      }
    }
    for (const [key, value] of Object.entries(node))
      if (!["loc", "start", "end", "range", "comments", "extra"].includes(key)) visit(value);
  };
  visit(ast.program ?? ast);
}

const groups = new Map();
for (const list of lists) {
  const key = [...list.values].sort().join(", ");
  groups.set(key, [...(groups.get(key) ?? []), list.site]);
}
const repeated = [...groups.entries()]
  .filter(([, sites]) => sites.length > 1)
  .map(([members, sites]) => ({ members, count: sites.length, sites }))
  .sort((left, right) => right.count - left.count || left.members.localeCompare(right.members));

// The named contract: Miniscript/descriptor fragment classes in the Inspector.
const fragmentLists = lists.filter(
  ({ site, values }) =>
    site.startsWith("apps/psbt-inspector/") &&
    (values.includes('"multi"') || values.includes('"pk"') || values.includes('"pkh"')),
);
const fragmentSets = new Map();
for (const { site, values } of fragmentLists) {
  const key = [...values].sort().join(", ");
  fragmentSets.set(key, [...(fragmentSets.get(key) ?? []), site]);
}
const fragments = {
  definitions: fragmentLists.length,
  distinctSets: [...fragmentSets.entries()].map(([members, sites]) => ({ members, sites })),
};
const contractPassed = fragmentLists.length <= fragmentSets.size;

const report = {
  files: files.length,
  lists: lists.length,
  repeatedGroups: repeated.length,
  repeatedSites: repeated.reduce((sum, group) => sum + group.count, 0),
  inspectorFragmentLists: fragments,
  contractPassed,
  repeated,
};
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      files: report.files,
      lists: report.lists,
      repeatedGroups: report.repeatedGroups,
      repeatedSites: report.repeatedSites,
      inspectorFragmentLists: fragments,
      contractPassed,
      top: repeated.slice(0, 40),
    },
    null,
    2,
  ),
);
process.exitCode = contractPassed ? 0 : 1;

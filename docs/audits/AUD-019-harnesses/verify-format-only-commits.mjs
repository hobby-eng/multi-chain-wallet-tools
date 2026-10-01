#!/usr/bin/env node
// Checks that a commit only reformats: for every file it changes, the parent's text formatted
// with the commit's own Prettier configuration must equal the commit's text exactly. Everything
// runs in memory from git objects; no file is written and no second checkout is made.
//
// Usage: node docs/audits/AUD-019-harnesses/verify-format-only-commits.mjs <commit|base..commit> [...]
// A single commit is compared with its parent; base..commit compares the whole range, for
// changes that a later commit undid in part.
// --declared <path,path,...> names the changes a commit message declares as more than
// formatting; the harness then exits 0 only when the differing files are exactly that list.
// Without it, it exits 1 when any changed file differs from the formatted parent, or is added,
// deleted or has no Prettier parser.
import { execFileSync } from "node:child_process";
import * as prettier from "prettier";

const declaredIndex = process.argv.indexOf("--declared");
const declared =
  declaredIndex > 0 ? new Set(process.argv[declaredIndex + 1].split(",").filter(Boolean)) : null;
const commits = process.argv
  .slice(2)
  .filter((argument, index, all) => argument !== "--declared" && all[index - 1] !== "--declared");
if (commits.length === 0) {
  console.error("Usage: verify-format-only-commits.mjs <commit> [...]");
  process.exit(2);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

/** The commit's .prettierrc.json with its overrides applied for one path ("*.ext" globs only). */
function optionsFor(config, path) {
  const options = { ...config };
  delete options.overrides;
  for (const override of config.overrides ?? []) {
    const patterns = [override.files].flat();
    const matches = patterns.some((pattern) => {
      if (!/^\*\.[a-z0-9]+$/iu.test(pattern))
        throw new Error(`Unsupported override pattern: ${pattern}`);
      return path.endsWith(pattern.slice(1));
    });
    if (matches) Object.assign(options, override.options);
  }
  return { ...options, filepath: path };
}

const summary = [];
for (const argument of commits) {
  const [base, commit] = argument.includes("..")
    ? argument.split("..")
    : [`${argument}^`, argument];
  const config = JSON.parse(git(["show", `${commit}:.prettierrc.json`]));
  const changes = git(["diff", "--name-status", "--no-renames", base, commit])
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
  const result = {
    base,
    commit,
    files: changes.length,
    formatOnly: 0,
    differs: [],
    notFormatted: [],
  };
  for (const [status, path] of changes) {
    if (status !== "M") {
      result.notFormatted.push(`${status} ${path}`);
      continue;
    }
    const info = await prettier.getFileInfo(path, { ignorePath: [] });
    if (info.inferredParser === null) {
      result.notFormatted.push(`no parser: ${path}`);
      continue;
    }
    const before = git(["show", `${base}:${path}`]);
    const after = git(["show", `${commit}:${path}`]);
    const formatted = await prettier.format(before, optionsFor(config, path));
    if (formatted === after) result.formatOnly += 1;
    else result.differs.push(path);
  }
  summary.push(result);
}
// Every difference across all arguments, by path; added, deleted and parser-less files count too.
const found = new Set(
  summary.flatMap(({ differs, notFormatted }) => [
    ...differs,
    ...notFormatted.map((entry) => entry.split(" ").pop()),
  ]),
);
const unexpected = [...found].filter((path) => declared === null || !declared.has(path));
const missing = declared === null ? [] : [...declared].filter((path) => !found.has(path));
console.log(JSON.stringify({ summary, unexpected, missing }, null, 2));
process.exit(unexpected.length === 0 && missing.length === 0 ? 0 : 1);

#!/usr/bin/env node
// Records the identity of the reviewed snapshot before any check runs: commit, tree,
// working-tree state, remote baseline, toolchain versions and the SHA-256 of the audit
// procedure files. Writes snapshot.json, environment.log and procedure-hashes.json into
// the evidence folder. Exits non-zero when the working tree is not clean, because a
// commit hash does not identify a dirty tree.
//
// Usage: node docs/audits/AUD-019-harnesses/capture-snapshot.mjs [--label baseline]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const EVIDENCE_DIR = process.env.AUDIT_EVIDENCE_DIR ?? "docs/audits/AUD-019-evidence";
const PROCEDURE_FILES = [
  "docs/FULL_AUDIT_GUIDE.md",
  "docs/audits/AUDIT_STANDARD.md",
  "docs/audits/AUDIT_TEMPLATE.md",
  "docs/audit-report.schema.json",
];
const labelIndex = process.argv.indexOf("--label");
const label = labelIndex > 0 ? process.argv[labelIndex + 1] : "baseline";

function run(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    return `unavailable: ${String(error.message).split("\n")[0]}`;
  }
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function hashTree(root) {
  if (!existsSync(root)) return {};
  const hashes = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else hashes[relative(".", path)] = sha256File(path);
    }
  };
  walk(root);
  return hashes;
}

mkdirSync(EVIDENCE_DIR, { recursive: true });
// The audit's own harness folder is untracked while the audit runs; it is not a
// pre-existing change of the reviewed snapshot.
const AUDIT_OWNED_PREFIX = "docs/audits/AUD-019-";
const status = run("git", ["status", "--porcelain=v1", "--untracked-files=all"]);
const foreignChanges = status
  .split("\n")
  .filter(Boolean)
  .filter((line) => !line.slice(3).startsWith(AUDIT_OWNED_PREFIX));
const workingTreeClean = foreignChanges.length === 0;
const snapshot = {
  label,
  capturedUtc: new Date().toISOString(),
  commit: run("git", ["rev-parse", "HEAD"]),
  tree: run("git", ["rev-parse", "HEAD^{tree}"]),
  branch: run("git", ["branch", "--show-current"]),
  subject: run("git", ["log", "-1", "--format=%s"]),
  remoteBaseline: run("git", ["rev-parse", "origin/main"]),
  commitsAheadOfRemote: run("git", ["rev-list", "--count", "origin/main..HEAD"]),
  workingTreeClean,
  workingTreeStatus: status.split("\n").filter(Boolean),
  preExistingChanges: foreignChanges,
  distArtifacts: Object.fromEntries(
    Object.entries(hashTree("dist")).filter(([path]) => path.endsWith(".html")),
  ),
};
writeFileSync(
  join(EVIDENCE_DIR, `snapshot-${label}.json`),
  `${JSON.stringify(snapshot, null, 2)}\n`,
);

const procedureHashes = Object.fromEntries(PROCEDURE_FILES.map((path) => [path, sha256File(path)]));
writeFileSync(
  join(EVIDENCE_DIR, "procedure-hashes.json"),
  `${JSON.stringify(procedureHashes, null, 2)}\n`,
);

const cargoBin = process.env.CARGO_HOME ? join(process.env.CARGO_HOME, "bin") : "";
const environment = [
  `capturedUtc ${snapshot.capturedUtc}`,
  `uname ${run("uname", ["-srm"])}`,
  `node ${process.version}`,
  `pnpm ${run("pnpm", ["--version"])}`,
  `typescript ${run("pnpm", ["exec", "tsc", "--version"])}`,
  `vitest ${run("pnpm", ["exec", "vitest", "--version"])}`,
  `playwright ${run("pnpm", ["exec", "playwright", "--version"])}`,
  `prettier ${run("pnpm", ["exec", "prettier", "--version"])}`,
  `esbuild ${run("pnpm", ["exec", "esbuild", "--version"])}`,
  `rustc ${run(join(cargoBin, "rustc"), ["--version"])}`,
  `cargo ${run(join(cargoBin, "cargo"), ["--version"])}`,
  `wasm-bindgen ${run(join(cargoBin, "wasm-bindgen"), ["--version"])}`,
  `cargo-audit ${run(join(cargoBin, "cargo-audit"), ["audit", "--version"])}`,
  `docker ${run("docker", ["--version"])} (not run by this audit)`,
  `pdftotext ${run("sh", ["-c", "pdftotext -v 2>&1 | head -1"])}`,
  `CARGO_HOME ${process.env.CARGO_HOME ?? "unset"}`,
  `RUSTUP_HOME ${process.env.RUSTUP_HOME ?? "unset"}`,
];
writeFileSync(join(EVIDENCE_DIR, "environment.log"), `${environment.join("\n")}\n`);

console.log(
  JSON.stringify(
    { ...snapshot, distArtifacts: Object.keys(snapshot.distArtifacts).length },
    null,
    2,
  ),
);
if (!workingTreeClean) {
  console.error(
    "Working tree is not clean; record the pre-existing changes before relying on HEAD.",
  );
  process.exit(1);
}

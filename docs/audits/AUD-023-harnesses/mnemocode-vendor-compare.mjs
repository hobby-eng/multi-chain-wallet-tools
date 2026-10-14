// AUD-023 (mnemocode reviewer): compares every vendored MnemoCode file with the bytes of the pinned
// commit in the local MnemoCode repository, checks the manifest and the import allowlist, and lists
// allowlist entries that no vendored file uses. Read-only; exits 1 when a check fails.
//
// Usage (repository root):
//   node docs/audits/AUD-023-harnesses/mnemocode-vendor-compare.mjs [mnemocode-checkout] [commit]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MNEMOCODE_FILES,
  MNEMOCODE_MANIFEST,
  MNEMOCODE_SOURCE_DIRECTORY,
  SHARED_DEPENDENCIES,
  importedSpecifiers,
  verifyMnemoCodeSource,
} from "../../../tooling/sync-mnemocode-source.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const checkout = path.resolve(process.argv[2] ?? path.join(root, "../mnemocode"));
const pinned = process.argv[3] ?? "f9202be";
const failures = [];
const fail = (message) => failures.push(message);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (args, encoding) =>
  execFileSync("git", ["-C", checkout, ...args], { encoding, maxBuffer: 64 * 1024 ** 2 });

const fullCommit = git(["rev-parse", `${pinned}^{commit}`], "utf8").trim();
const manifest = JSON.parse(readFileSync(path.join(root, MNEMOCODE_MANIFEST), "utf8"));
console.log(`MnemoCode checkout ${checkout}, pinned ${pinned} = ${fullCommit}`);
if (manifest.commit !== fullCommit)
  fail(`manifest.commit ${manifest.commit} differs from ${fullCommit}`);

// 1. The offline gate of the product itself.
try {
  verifyMnemoCodeSource({ root });
  console.log("verifyMnemoCodeSource: passed");
} catch (error) {
  fail(`verifyMnemoCodeSource: ${error.message}`);
}

// 2. Byte equality with the pinned commit for every listed file.
let equal = 0;
for (const [upstreamPath, vendoredPath] of Object.entries(MNEMOCODE_FILES)) {
  let upstream;
  try {
    upstream = git(["show", `${fullCommit}:${upstreamPath}`]);
  } catch {
    fail(`${upstreamPath} does not exist at ${fullCommit}`);
    continue;
  }
  const vendored = readFileSync(path.join(root, MNEMOCODE_SOURCE_DIRECTORY, vendoredPath));
  if (!upstream.equals(vendored)) fail(`${vendoredPath} differs from ${upstreamPath} at ${pinned}`);
  else if (manifest.files[vendoredPath] !== sha256(upstream))
    fail(`${vendoredPath} manifest hash differs from the pinned bytes`);
  else equal += 1;
}
console.log(`byte-equal with ${pinned}: ${equal}/${Object.keys(MNEMOCODE_FILES).length}`);

// 3. Shared dependency versions in the pinned package.json.
const upstreamPackage = JSON.parse(git(["show", `${fullCommit}:package.json`], "utf8"));
if (upstreamPackage.version !== manifest.version)
  fail(`manifest.version ${manifest.version} differs from ${upstreamPackage.version}`);
for (const name of SHARED_DEPENDENCIES) {
  if (upstreamPackage.dependencies?.[name] !== manifest.sharedDependencies?.[name])
    fail(
      `${name}: pinned ${upstreamPackage.dependencies?.[name]}, manifest ${manifest.sharedDependencies?.[name]}`,
    );
}

// 4. Is the pinned commit's tree clean relative to the working tree used for vendoring?
console.log(`manifest.reference: ${manifest.reference}; unreleased: ${manifest.unreleased ?? "-"}`);

// 5. Allowlist tightness: which allowed package specifiers does the vendored code actually use?
const syncSource = readFileSync(path.join(root, "tooling/sync-mnemocode-source.mjs"), "utf8");
const allowBlock = /const ALLOWED_PACKAGE_IMPORTS = new Set\(\[([\s\S]*?)\]\);/u.exec(
  syncSource,
)[1];
const allowed = [...allowBlock.matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
const used = new Map();
const risky = [];
for (const vendoredPath of Object.values(MNEMOCODE_FILES).filter((p) => p.endsWith(".ts"))) {
  const source = readFileSync(path.join(root, MNEMOCODE_SOURCE_DIRECTORY, vendoredPath), "utf8");
  for (const specifier of importedSpecifiers(source)) {
    if (specifier.startsWith(".")) continue;
    if (!used.has(specifier)) used.set(specifier, []);
    used.get(specifier).push(vendoredPath);
  }
  // Constructs the specifier scanner cannot see, or network/eval primitives.
  for (const [label, pattern] of [
    ["dynamic import of a non-literal", /\bimport\s*\(\s*[^'"\s)]/u],
    ["require(", /\brequire\s*\(/u],
    ["fetch(", /\bfetch\s*\(/u],
    ["XMLHttpRequest", /\bXMLHttpRequest\b/u],
    ["WebSocket", /\bWebSocket\b/u],
    ["eval(", /\beval\s*\(/u],
    ["new Function", /\bnew\s+Function\s*\(/u],
    ["Math.random", /\bMath\.random\b/u],
    ["process.", /\bprocess\./u],
  ]) {
    if (pattern.test(source)) risky.push(`${vendoredPath}: ${label}`);
  }
}
const unused = allowed.filter((specifier) => !used.has(specifier));
console.log(`allowed package specifiers: ${allowed.length}; used: ${used.size}`);
for (const [specifier, files] of used) console.log(`  used ${specifier}: ${files.length} file(s)`);
console.log(`  allowed but unused: ${unused.length === 0 ? "none" : unused.join(", ")}`);
for (const specifier of used.keys())
  if (!allowed.includes(specifier)) fail(`used but not allowed: ${specifier}`);
console.log(
  `constructs outside the scanner or network/eval primitives: ${risky.length === 0 ? "none" : ""}`,
);
for (const line of risky) console.log(`  ${line}`);

// 6. Upstream files that the vendored files' relative imports reach but the set lacks are refused
// by the gate (step 1); list upstream src files not vendored, for the record.
const upstreamSrc = git(["ls-tree", "-r", "--name-only", fullCommit, "src"], "utf8")
  .split("\n")
  .filter(Boolean);
const vendoredUpstream = new Set(Object.keys(MNEMOCODE_FILES));
const notVendored = upstreamSrc.filter(
  (p) => !vendoredUpstream.has(p) && !p.startsWith("src/cli/"),
);
console.log(`upstream src files outside src/cli that are not vendored: ${notVendored.length}`);
for (const p of notVendored) console.log(`  ${p}`);

if (failures.length > 0) {
  console.log(`FAILED (${failures.length}):`);
  for (const message of failures) console.log(`  ${message}`);
  process.exit(1);
}
console.log("PASSED");

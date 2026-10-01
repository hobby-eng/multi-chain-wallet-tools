#!/usr/bin/env node
// Compares every vendored MnemoCode file (packages/recovery-mnemocode/source/) with the blob of
// the pinned commit in a local clone of hobby-eng/mnemocode, read with `git show` in memory: an
// independent check of the vendored bytes that does not rely on the SHA-256 values the
// synchronization tool wrote into source.json.
//
// Usage: node docs/audits/AUD-019-harnesses/compare-vendored-mnemocode.mjs [path-to-mnemocode-clone]
// The default clone is ../mnemocode next to this repository. Exits 1 on any difference.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MNEMOCODE_FILES,
  MNEMOCODE_MANIFEST,
  MNEMOCODE_SOURCE_DIRECTORY,
} from "../../../tooling/sync-mnemocode-source.mjs";

const clone = resolve(process.argv[2] ?? "../mnemocode");
const manifest = JSON.parse(readFileSync(MNEMOCODE_MANIFEST, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const onMain = execFileSync("git", ["-C", clone, "branch", "--contains", manifest.commit], {
  encoding: "utf8",
});
const rows = Object.entries(MNEMOCODE_FILES).map(([upstreamPath, vendoredPath]) => {
  const upstream = execFileSync(
    "git",
    ["-C", clone, "show", `${manifest.commit}:${upstreamPath}`],
    {
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const vendored = readFileSync(resolve(MNEMOCODE_SOURCE_DIRECTORY, vendoredPath));
  return {
    upstreamPath,
    vendoredPath,
    identical: Buffer.compare(upstream, vendored) === 0,
    manifestMatches: manifest.files[vendoredPath] === sha256(vendored),
  };
});
const differing = rows.filter((row) => !row.identical || !row.manifestMatches);
console.log(
  JSON.stringify(
    {
      commit: manifest.commit,
      commitOnMainOfClone: /(^|\s)main$/mu.test(onMain),
      files: rows.length,
      identical: rows.filter((row) => row.identical).length,
      differing,
    },
    null,
    2,
  ),
);
process.exit(differing.length === 0 && /(^|\s)main$/mu.test(onMain) ? 0 : 1);

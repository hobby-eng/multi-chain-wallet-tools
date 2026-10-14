// AUD-025: run the independent public-API bit oracle in its retained regression test file.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const test = "packages/crypto-core/tests/bip39-chosen-words-boundaries.test.ts";
const source = "packages/crypto-core/src/bip39-chosen-words.ts";
const hash = (path) =>
  createHash("sha256")
    .update(readFileSync(resolve(root, path)))
    .digest("hex");
console.log(
  JSON.stringify({
    audit: "AUD-025",
    source,
    sourceSha256: hash(source),
    test,
    testSha256: hash(test),
  }),
);
const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", test, "--maxWorkers=1", "--reporter=verbose"],
  { cwd: root, stdio: "inherit" },
);
if (result.error !== undefined) throw result.error;
process.exitCode = result.status ?? 1;

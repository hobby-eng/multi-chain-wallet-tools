// Runs the independent oracles of test/oracles: standard-library Python reimplementations that first
// reproduce published vectors and then check the literals the Deriver's startup self-test and unit
// tests hold for its single-key coins. Each oracle exits non-zero on the first mismatch.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ORACLES = resolve(fileURLToPath(new URL("..", import.meta.url)), "test/oracles");

/** The oracles that must be there; a missing or renamed one fails instead of passing silently. */
const EXPECTED = [
  "bip32_oracle.py",
  "cardano_oracle.py",
  "ed25519_oracle.py",
  "ton_oracle.py",
  "zcash_unified_oracle.py",
];

const found = readdirSync(ORACLES)
  .filter((name) => name.endsWith("_oracle.py"))
  .sort();
for (const oracle of EXPECTED)
  if (!found.includes(oracle)) throw new Error(`test/oracles/${oracle} is missing.`);
for (const oracle of found) {
  // Run from its folder, so that an oracle may reuse another's functions; no network is used.
  const run = spawnSync("python3", ["-B", oracle], { cwd: ORACLES, encoding: "utf8" });
  if (run.error !== undefined)
    throw new Error(
      "The oracles need Python 3 (python3 on the PATH) with hashlib's ripemd160, which OpenSSL 3.0.7 or later provides.",
      { cause: run.error },
    );
  if (run.status !== 0)
    throw new Error(`${oracle} failed:\n${run.stdout.slice(-2000)}${run.stderr.slice(-2000)}`);
  const checks = run.stdout.split("\n").filter((line) => line.startsWith("ok ")).length;
  console.log(`${oracle}: ${checks} checks reproduced.`);
}

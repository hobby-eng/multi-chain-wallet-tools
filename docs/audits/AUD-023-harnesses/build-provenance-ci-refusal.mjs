// AUD-023 build reviewer harness: checks that tooling/verify-dependency-provenance.mjs refuses the
// current unreleased MnemoCode and MHFE pins when CI=true (as in CI and Dockerfile.reproducible)
// and only warns when CI is unset. Uses a synthetic fixture root in this audit's ignored evidence folder
// (dummy lockfiles and placeholder sources, as the unit test's fixtureRoot does) and a mocked
// GitHub that confirms every commit, so no network request is made. Exits 1 if either expectation
// fails.
//
//   node docs/audits/AUD-023-harnesses/build-provenance-ci-refusal.mjs
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  GITHUB_SOURCES,
  LOCAL_IMPLEMENTATIONS,
  verifyDependencyProvenance,
} from "../../../tooling/verify-dependency-provenance.mjs";

const root = join(import.meta.dirname, "../AUD-023-evidence/scratch/build/provenance-fixture");
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
writeFileSync(
  join(root, "pnpm-lock.yaml"),
  "lockfileVersion: '9.0'\npackages:\n  example@1.0.0:\n    resolution: {integrity: sha512-YWJjZA==}\nsnapshots:\n",
);
for (const path of [
  "packages/dash-shielded-wasm/rust/Cargo.lock",
  "packages/recovery-codex32-wasm/rust/Cargo.lock",
  "packages/recovery-sskr-wasm/rust/Cargo.lock",
  "packages/recovery-envelope-wasm/rust/Cargo.lock",
  "apps/key-derivation/launcher/Cargo.lock",
]) {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(
    join(root, path),
    `[[package]]\nname = "registry"\nversion = "1.0.0"\nsource = "registry+x"\nchecksum = "${"a".repeat(64)}"\n`,
  );
}
for (const path of LOCAL_IMPLEMENTATIONS.flatMap((entry) => entry.files)) {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), path);
}
const options = {
  root,
  writeReport: false,
  verifyFixedSources: false,
  fetchImpl: async (url) => ({ ok: true, json: async () => ({ sha: url.split("/").at(-1) }) }),
  logger: { log: () => {}, warn: (message) => console.log(`  warn: ${message}`) },
};
const unreleased = GITHUB_SOURCES.filter((source) => source.unreleased !== undefined).map(
  (s) => s.id,
);
console.log(`Unreleased pins in this tree: ${unreleased.join(", ") || "none"}`);
let failures = 0;
process.env.CI = "true";
try {
  await verifyDependencyProvenance(options);
  console.log("CI=true: NOT REFUSED");
  failures += unreleased.length > 0 ? 1 : 0;
} catch (error) {
  console.log(`CI=true: refused: ${error.message}`);
}
delete process.env.CI;
try {
  await verifyDependencyProvenance(options);
  console.log("CI unset: passed with warnings");
} catch (error) {
  console.log(`CI unset: UNEXPECTED refusal: ${error.message}`);
  failures += 1;
}
rmSync(root, { recursive: true, force: true });
process.exitCode = failures === 0 ? 0 : 1;

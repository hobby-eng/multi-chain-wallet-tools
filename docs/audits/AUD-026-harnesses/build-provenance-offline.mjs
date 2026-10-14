// AUD-026 build reviewer: runs tooling/verify-dependency-provenance.mjs with every GitHub request
// refused locally, so that the mandatory local checks (MnemoCode source manifest, vendored MHFE
// package, pnpm SHA-512 pins, Cargo checksums and full git commits, local source hashes) run
// without network access, and records which upstream queries the unmodified gate would send.
// Exits non-zero when any mandatory local check fails. Writes nothing into dist/.
import {
  verifyDependencyProvenance,
  GITHUB_SOURCES,
} from "../../../tooling/verify-dependency-provenance.mjs";

const attempted = [];
const refusingFetch = async (url) => {
  attempted.push(String(url));
  throw new Error("network refused by the AUD-026 offline harness");
};
const warnings = [];
const logger = {
  log: (...args) => console.log(...args),
  warn: (...args) => {
    warnings.push(args.join(" "));
    console.log(...args);
  },
};
const report = await verifyDependencyProvenance({
  fetchImpl: refusingFetch,
  timeoutMs: 1,
  writeReport: false,
  logger,
});
console.log(`GitHub sources listed: ${GITHUB_SOURCES.length}`);
console.log("Queries the unmodified gate sends on every build (refused here):");
for (const url of attempted) console.log(`  ${url}`);
console.log(
  `Locked: ${report.lockedDependencies.pnpmPackages} pnpm packages, ${report.lockedDependencies.cargoPackages} Cargo packages; local source groups: ${report.localSources.length}`,
);
const unreleased = GITHUB_SOURCES.filter((source) => source.unreleased !== undefined).map(
  (source) => `${source.id} (${source.commit}): ${source.unreleased}`,
);
console.log(`Unreleased upstreams (CI=true refuses them): ${unreleased.length}`);
for (const line of unreleased) console.log(`  ${line}`);
if (attempted.length !== GITHUB_SOURCES.length) {
  console.log("FAIL: the gate did not query each listed source exactly once");
  process.exitCode = 1;
}

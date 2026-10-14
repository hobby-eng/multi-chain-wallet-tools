// Builds a self-test entry for Node and checks that it reports exactly the expected checks. Naming
// the required checks instead of counting them means a silently dropped or renamed vector fails
// the release, and the failure says which.
import { withNodeModule } from "../../../tooling/node-module.mjs";

/**
 * Runs `run` of the module `entry` (from the repository root) and refuses a report whose checks
 * differ from `expectedChecks`; `label` names the self-test in the messages.
 */
export async function verifySelfTest({ entry, run, expectedChecks, label }) {
  if (typeof Uint8Array.fromBase64 !== "function") {
    Uint8Array.fromBase64 = (value) => new Uint8Array(Buffer.from(value, "base64"));
  }
  const report = await withNodeModule(entry, (module) => module[run](), {
    loader: { ".wasm": "binary" },
  });
  if (report?.passed !== true || !Array.isArray(report.checks)) {
    throw new Error(`${label} returned an incomplete report.`);
  }
  const missing = expectedChecks.filter((check) => !report.checks.includes(check));
  const unexpected = report.checks.filter((check) => !expectedChecks.includes(check));
  if (
    missing.length > 0 ||
    unexpected.length > 0 ||
    report.checks.length !== expectedChecks.length
  ) {
    throw new Error(
      `${label} vector set changed: missing ${missing.join(", ") || "none"}; unexpected ${unexpected.join(", ") || "none"}. ` +
        "Add a new vector to the expected list deliberately.",
    );
  }
  console.log(`Verified ${label}: ${report.checks.join(" · ")} (${report.durationMs} ms)`);
}

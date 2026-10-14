// Verify the exact local package/lockfile inventories; no remote availability is claimed.
import { verifyDependencyProvenance } from "../../../tooling/verify-dependency-provenance.mjs";
const result = await verifyDependencyProvenance({
  fetchImpl: async () => {
    throw new Error("Offline remediation check: upstream existence not queried.");
  },
  writeReport: false,
});
console.log(
  JSON.stringify({ localSources: result.localSources.length, upstreamAvailability: "not-queried" }),
);

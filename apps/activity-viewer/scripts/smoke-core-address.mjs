import { smokeNetwork, withNodeModule } from "../../../tooling/node-module.mjs";

const network = smokeNetwork("DashScan smoke");
// m/44'/5'/0'/0/0 and m/44'/1'/0'/0/0 of the public test phrase "abandon … about".
const knownAddress =
  network === "mainnet"
    ? "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5"
    : "yRd4FhXfVGHXpsuZXPNkMrfD9GVj46pnjt";

await withNodeModule("packages/dash-network/src/public-address.ts", async (module) => {
  const startedAt = performance.now();
  const snapshot = await module.queryCoreAddress(knownAddress, network, 2);
  if (snapshot.provider !== "DashScan" || snapshot.indexStatus !== "ok") {
    throw new Error("DashScan smoke did not return a synchronized provider snapshot.");
  }
  if (
    snapshot.indexedHeight < 1 ||
    snapshot.indexedTimeMs < 1 ||
    snapshot.transactions.length !== 2
  ) {
    throw new Error("DashScan smoke returned incomplete tip or transaction data.");
  }
  console.log(
    `Live DashScan ${network} smoke passed: Core height ${snapshot.indexedHeight}; ` +
      `${snapshot.transactionCount} transactions reported; ${snapshot.transactions.length} loaded; ` +
      `${snapshot.requests} requests; ${Math.round(performance.now() - startedAt)} ms.`,
  );
});

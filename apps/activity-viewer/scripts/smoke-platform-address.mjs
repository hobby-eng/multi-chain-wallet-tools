import { smokeNetwork, withNodeModule } from "../../../tooling/node-module.mjs";
import { EvoSDK } from "@dashevo/evo-sdk";

const network = smokeNetwork("Platform Explorer smoke");
// DIP17 m/9'/5'/17'/0'/0'/0 and m/9'/1'/17'/0'/0'/0 of the public test phrase "abandon … about".
const knownAddress =
  network === "mainnet"
    ? "dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs"
    : "tdash1kzfj6fvrpza60u6m9u2nhzkthey68v7cqg2u9ymk";

await withNodeModule("packages/dash-network/src/platform-address-history.ts", async (module) => {
  const startedAt = performance.now();
  const snapshot = await module.queryPlatformAddressHistory(knownAddress, network, 2);
  if (snapshot.provider !== "Dash Platform Explorer" || snapshot.indexStatus !== "synced") {
    throw new Error("Platform Explorer smoke did not return a synchronized provider snapshot.");
  }
  if (snapshot.indexedHeight < 1 || snapshot.indexedTimeMs < 1 || snapshot.transitions.length < 1) {
    throw new Error("Platform Explorer smoke returned incomplete tip or transition data.");
  }
  const sdk =
    network === "mainnet"
      ? EvoSDK.mainnetTrusted({
          settings: { connectTimeoutMs: 10_000, timeoutMs: 30_000, retries: 3 },
        })
      : EvoSDK.testnetTrusted({
          settings: { connectTimeoutMs: 10_000, timeoutMs: 30_000, retries: 3 },
        });
  await sdk.connect();
  const verified = await sdk.addresses.getWithProof(knownAddress);
  const info = verified.data;
  const metadata = verified.metadata;
  try {
    if (info === undefined)
      throw new Error("DAPI proof did not contain the known Platform address.");
    if (
      info.balance !== snapshot.explorerBalanceCredits ||
      info.nonce !== BigInt(snapshot.explorerNonce)
    ) {
      throw new Error("Platform Explorer balance/nonce do not match the DAPI proof.");
    }
    console.log(
      `Live Platform Explorer ${network} smoke passed: Platform height ${snapshot.indexedHeight}; ` +
        `${snapshot.totalTransitions} transitions reported; ${snapshot.transitions.length} loaded; ` +
        `DAPI proof height ${metadata.height}; balance/nonce agree; ` +
        `${snapshot.requests} Explorer requests; ${Math.round(performance.now() - startedAt)} ms.`,
    );
  } finally {
    info?.free();
    metadata.free();
    verified.free();
  }
});

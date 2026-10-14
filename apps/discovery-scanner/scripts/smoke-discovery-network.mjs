import { smokeNetwork } from "../../../tooling/node-module.mjs";
import { smokeScanConfig, withDashRecovery } from "./smoke-module.mjs";

const network = smokeNetwork("Recovery smoke", "testnet");
const identityIndexes = Number(process.argv[3] ?? "1");
if (!Number.isSafeInteger(identityIndexes) || identityIndexes < 1 || identityIndexes > 20) {
  throw new Error("Recovery smoke identity-index argument must be an integer from 1 through 20.");
}

// Public BIP39 vector. It is intentionally not a user wallet and must never receive funds.
const mnemonic =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

await withDashRecovery(async (module) => {
  const networkApi = new module.DirectRecoveryNetworkService();
  const progress = [];
  const startedAt = performance.now();
  const result = await module.DASH_RECOVERY_ADAPTER.scan(
    { id: "public-vector", label: "Public BIP39 vector", mnemonic, passphrase: "" },
    smokeScanConfig(network, {
      coreReceiveCount: 2,
      coreChangeCount: 2,
      platformAddressCount: 2,
      identityGapLimit: identityIndexes,
      identityScanLimit: identityIndexes,
    }),
    {
      signal: new AbortController().signal,
      networkApi,
      onProgress: (item) => progress.push(item),
      onFinding: () => {},
    },
  );
  const byId = new Map(result.sections.map((section) => [section.id, section]));
  for (const id of ["core", "platform", "identity"]) {
    const section = byId.get(id);
    if (section === undefined || section.state === "failed") {
      throw new Error(`Recovery ${id} smoke failed: ${section?.warning ?? "missing section"}`);
    }
  }
  if (
    Number(byId.get("core")?.scanned ?? 0) < 4 ||
    Number(byId.get("platform")?.scanned ?? 0) < 2
  ) {
    throw new Error("Recovery smoke did not scan at least the requested minimum address counts.");
  }
  if (byId.get("shielded")?.state !== "skipped" || progress.length < 3) {
    throw new Error(
      "Recovery smoke did not preserve disabled Orchard state or progress reporting.",
    );
  }
  // DIP17 m/9'/5'/17'/0'/0'/0 and m/9'/1'/17'/0'/0'/0 of the public test phrase "abandon … about".
  const knownAddress =
    network === "mainnet"
      ? "dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs"
      : "tdash1kzfj6fvrpza60u6m9u2nhzkthey68v7cqg2u9ymk";
  const addressResponse = await networkApi.platformAddresses(network, [knownAddress]);
  const entries = addressResponse.entries;
  if (
    entries.length !== 1 ||
    entries[0][0] === knownAddress ||
    !/^00[0-9a-f]{40}$/u.test(entries[0][0]) ||
    entries[0][1] == null ||
    BigInt(entries[0][1].balance) <= 0n
  ) {
    throw new Error(
      "Recovery smoke did not observe the expected internal Platform Map key and funded value.",
    );
  }
  const identityMetrics = new Map(
    byId.get("identity")?.metrics.map(({ label, value }) => [label, value]),
  );
  console.log(
    `Live recovery ${network} smoke passed: Core ${byId.get("core")?.scanned}; Platform ${byId.get("platform")?.scanned}; identity ${byId.get("identity")?.scanned}; funded Platform Map shape; ` +
      `${identityMetrics.get("Proof queries")} identity proofs; DAPI avg/max ${identityMetrics.get("DAPI average / max")}; ` +
      `${progress.length} progress events; ${Math.round(performance.now() - startedAt)} ms.`,
  );
});

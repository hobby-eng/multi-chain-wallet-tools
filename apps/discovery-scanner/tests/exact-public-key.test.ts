import { describe, expect, it, vi } from "vitest";
import { WatchOnlyFixtures } from "./watch-only-fixtures.js";
import { DASH_RECOVERY_ADAPTER } from "../src/coins/dash/index.js";
import type { RecoveryWatchOnlyScanConfig } from "../src/types.js";
import { enrichRecoveryHistory, RecoveryHistoryEnrichment } from "../src/history.js";
import { createRecoveryExport } from "../src/export.js";
const { publicKey, config, context, scan } = WatchOnlyFixtures;
// Published SEC2 generator's compressed HASH160, used only for synthetic proof-boundary fixtures.
const hash = "751e76e8199196d454941c45d1b3a323f1433bd6";

// Independent Python stdlib Base58Check first reproduced the published scalar-one Bitcoin address.
const EXACT_KEY_VECTORS = [
  {
    network: "mainnet",
    addresses: ["XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE", "XoyDQM3xGhFW5JqYBwTLckjqZ67Q3jZfAL"],
  },
  {
    network: "testnet",
    addresses: ["yWziQMcwmKjRdzi7eWjwiQX8EjWcd6dSg6", "yZbpRJ8PiEuaR3m5knmjenABqNbmZpwn7k"],
  },
] as const;
const EXACT_KEY_FORMS = [
  publicKey,
  "0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8",
];
const UNFRESH_INDEXES = [
  { name: "absent status", status: null, tip: { resultSet: [{ height: 7 }] }, tips: 0 },
  { name: "missing status", status: {}, tip: { resultSet: [{ height: 7 }] }, tips: 0 },
  {
    name: "syncing status",
    status: { status: "syncing" },
    tip: { resultSet: [{ height: 7 }] },
    tips: 0,
  },
  { name: "absent tip", status: { status: "ok" }, tip: {}, tips: 1 },
  { name: "empty tip", status: { status: "ok" }, tip: { resultSet: [] }, tips: 1 },
  {
    name: "negative height",
    status: { status: "ok" },
    tip: { resultSet: [{ height: -1 }] },
    tips: 1,
  },
];
const EXACT_KEY_PROOF_METADATA = {
  height: "7",
  protocolVersion: 1,
  coreChainLockedHeight: 7,
  timeMs: "1",
};
describe.each(EXACT_KEY_VECTORS)(
  "exact-key Core freshness on $network",
  ({ network, addresses }) => {
    it.each(EXACT_KEY_FORMS)(
      "keeps both public addresses behind one synchronized indexed tip: %s",
      async (key) => {
        const events: string[] = [];
        const status = vi.fn(async () => {
          events.push("status");
          return { status: "ok" };
        });
        const tip = vi.fn(async () => {
          events.push("tip");
          return { resultSet: [{ height: 7 }] };
        });
        const info = vi.fn(
          async (_network: RecoveryWatchOnlyScanConfig["network"], queried: readonly string[]) => {
            events.push("info");
            return queried.map((address) => ({ address, balance: "1", txCount: 1 }));
          },
        );
        const result = await scan(
          DASH_RECOVERY_ADAPTER,
          key,
          context({
            coreStatus: status,
            coreTip: tip,
            coreAddressInfo: info,
            platformAddresses: async () => ({
              entries: [[`00${hash}`, null]],
              metadata: EXACT_KEY_PROOF_METADATA,
            }),
            platformIdentityByPublicKeyHash: async () => ({
              identities: [],
              metadata: EXACT_KEY_PROOF_METADATA,
              proofQueries: 1,
              dapiDurationsMs: [1],
            }),
          }),
          { ...config, network },
        );
        expect(events).toEqual(["status", "tip", "info"]);
        expect(info.mock.calls[0]?.[1]).toEqual(addresses);
        const section = result.sections.find(({ id }) => id === "core");
        expect(section?.state).toBe("complete");
        expect(section?.findings.map(({ title }) => title)).toEqual(addresses);
        expect(section?.proof).toContain("indexed Core height 7");
        expect(result.sections.map(({ state }) => state)).toEqual([
          "complete",
          "complete",
          "complete",
        ]);
        expect(result.sections.find(({ id }) => id === "platform")?.findings).toEqual([]);
        expect(result.sections.find(({ id }) => id === "identity")?.findings).toEqual([]);
      },
    );
    it.each(EXACT_KEY_FORMS)(
      "keeps every stale or unknown index distinct from an empty wallet: %s",
      async (key) => {
        for (const scenario of UNFRESH_INDEXES) {
          const status = vi.fn(async () => scenario.status);
          const tip = vi.fn(async () => scenario.tip);
          const info = vi.fn(
            async (_network: RecoveryWatchOnlyScanConfig["network"], queried: readonly string[]) =>
              queried.map((address) => ({ address, balance: "1", txCount: 1 })),
          );
          const result = await scan(
            DASH_RECOVERY_ADAPTER,
            key,
            context({ coreStatus: status, coreTip: tip, coreAddressInfo: info }),
            { ...config, network },
          );
          const core = result.sections.find(({ id }) => id === "core");
          expect(core?.state, scenario.name).toBe("failed");
          expect(core?.findings, scenario.name).toEqual([]);
          expect(core?.proof, scenario.name).toBe("Not completed");
          expect(status, scenario.name).toHaveBeenCalledTimes(1);
          expect(tip, scenario.name).toHaveBeenCalledTimes(scenario.tips);
          expect(info, scenario.name).not.toHaveBeenCalled();
        }
      },
    );
  },
);

it("returns partial exact-key sections and drops late findings when the scan is cancelled", async () => {
  const abort = new AbortController();
  const onFinding = vi.fn();
  const ctx = context({
    coreStatus: async () => ({ status: "ok" }),
    coreTip: async () => ({ resultSet: [{ height: 7 }] }),
    coreAddressInfo: async (_network, addresses) => {
      abort.abort();
      return addresses.map((address) => ({ address, balance: "1", txCount: 1 }));
    },
  });
  const result = await scan(DASH_RECOVERY_ADAPTER, publicKey, {
    ...ctx,
    signal: abort.signal,
    onFinding,
  });
  expect(result.sections).toHaveLength(3);
  expect(
    result.sections.every(({ state, findings }) => state === "partial" && findings.length === 0),
  ).toBe(true);
  expect(onFinding).not.toHaveBeenCalled();
  expect(result.warnings.some((warning) => warning.includes("cancelled"))).toBe(true);
});

it.each(["before", "during"] as const)(
  "preserves completed Core balances when cancelled %s history enrichment",
  async (when) => {
    const abort = new AbortController();
    const history = vi.fn(
      async (_network: RecoveryWatchOnlyScanConfig["network"], address: string) => {
        abort.abort();
        return {
          address,
          txCount: 1,
          received: "99",
          sent: "0",
          firstSeenBlockTimestamp: null,
          lastSeenBlockTimestamp: null,
        };
      },
    );
    const ctx = {
      ...context({
        coreStatus: async () => ({ status: "ok" }),
        coreTip: async () => ({ resultSet: [{ height: 7 }] }),
        coreAddressInfo: async (_network, addresses) =>
          addresses.map((address) => ({ address, balance: "1", txCount: 0 })),
        platformAddresses: async () => {
          if (when === "before") {
            abort.abort();
            throw new DOMException("Synthetic cancelled provider", "AbortError");
          }
          return { entries: [[`00${hash}`, null]], metadata: EXACT_KEY_PROOF_METADATA };
        },
        platformIdentityByPublicKeyHash: async () => ({
          identities: [],
          metadata: EXACT_KEY_PROOF_METADATA,
          proofQueries: 1,
          dapiDurationsMs: [1],
        }),
        coreAddressHistory: history,
      }),
      signal: abort.signal,
    };
    const result = await scan(DASH_RECOVERY_ADAPTER, publicKey, ctx);
    expect(result.sections[0]?.state).toBe("complete");
    expect(result.sections[0]?.findings).toHaveLength(2);
    expect(await enrichRecoveryHistory(DASH_RECOVERY_ADAPTER, result, ctx)).toBe("cancelled");
    expect(history).toHaveBeenCalledTimes(when === "before" ? 0 : 1);
    for (const finding of result.sections[0]!.findings) {
      expect(finding.balanceAtomic).toBe(1n);
      expect(finding.history).toMatchObject({
        status: "unavailable",
        totalReceivedAtomic: null,
        totalSentAtomic: null,
        transactionCount: null,
      });
      expect(finding.history?.note).toContain("cancelled");
    }
    const exported: unknown = JSON.parse(createRecoveryExport([result], "json").text);
    expect(exported).toMatchObject({
      results: [
        {
          sections: [
            {
              state: "complete",
              findings: EXACT_KEY_VECTORS[0]!.addresses.map((title) => ({
                title,
                balanceAtomic: "1",
                history: { status: "unavailable", totalReceivedAtomic: null },
              })),
            },
            { id: "platform", state: when === "before" ? "partial" : "complete" },
            { id: "identity", state: when === "before" ? "partial" : "complete" },
          ],
        },
      ],
    });
  },
);

it("keeps completed history when a later address is cancelled and refuses reusing the pass", async () => {
  const abort = new AbortController();
  let calls = 0;
  const ctx = {
    ...context({
      coreStatus: async () => ({ status: "ok" }),
      coreTip: async () => ({ resultSet: [{ height: 7 }] }),
      coreAddressInfo: async (_network, addresses) =>
        addresses.map((address) => ({ address, balance: "1", txCount: 0 })),
      platformAddresses: async () => ({
        entries: [[`00${hash}`, null]],
        metadata: EXACT_KEY_PROOF_METADATA,
      }),
      platformIdentityByPublicKeyHash: async () => ({
        identities: [],
        metadata: EXACT_KEY_PROOF_METADATA,
        proofQueries: 1,
        dapiDurationsMs: [1],
      }),
      coreAddressHistory: async (_network, address) => {
        calls += 1;
        if (calls === 2) abort.abort();
        return {
          address,
          txCount: 1,
          received: calls === 1 ? "11" : "99",
          sent: "0",
          firstSeenBlockTimestamp: null,
          lastSeenBlockTimestamp: null,
        };
      },
    }),
    signal: abort.signal,
  };
  const result = await scan(DASH_RECOVERY_ADAPTER, publicKey, ctx);
  const pass = new RecoveryHistoryEnrichment(DASH_RECOVERY_ADAPTER, result, ctx);
  expect(await pass.run()).toBe("cancelled");
  expect(calls).toBe(2);
  expect(result.sections[0]?.findings[0]?.history).toMatchObject({
    status: "complete",
    totalReceivedAtomic: "11",
  });
  expect(result.sections[0]?.findings[1]?.history).toMatchObject({
    status: "unavailable",
    totalReceivedAtomic: null,
  });
  await expect(pass.run()).rejects.toMatchObject({ code: "recovery.history.used" });
  expect(calls).toBe(2);
});

import { describe, expect, it } from "vitest";
import { createPublicActivityExport, publicActivityRows } from "../src/export-public.js";

const state = {
  coin: "future-coin",
  asset: "UNIT",
  decimals: 8,
  network: "mainnet" as const,
  mode: "batch" as const,
  results: [
    {
      coin: "future-coin",
      address: "=unsafe",
      balanceAtomic: 42n,
      nonce: null,
      blockHeight: 100n,
      history: {
        asset: "UNIT",
        atomicUnit: "unit",
        decimals: 8,
        scope: "lifetime",
        firstReceived: null,
        lastReceived: null,
        firstSpent: null,
        lastSpent: null,
        status: "complete" as const,
        transactionCount: 2,
        pendingTransactionCount: 0,
        totalReceivedAtomic: "50",
        totalSentAtomic: "8",
        totalFeesAtomic: null,
        firstSeen: null,
        lastSeen: null,
        source: "test",
        note: "complete",
      },
    },
  ],
};

describe("public activity export", () => {
  it("exports any adapter coin using the shared schema", async () => {
    expect(publicActivityRows(state)[1]?.slice(0, 3)).toEqual([
      "future-coin",
      "mainnet",
      "=unsafe",
    ]);
    const file = await createPublicActivityExport(state, "csv", new Date("2026-01-02T03:04:05Z"));
    expect(file.filename).toBe("wallet-activity-future-coin-batch-20260102T030405Z.csv");
    const text = await file.blob.text();
    expect(text).toContain("' =unsafe".replace(" ", ""));
    expect(text).toContain("42");
  });

  it("names the Hedera accounts a lookup found in its last column, empty for other coins", async () => {
    const [result] = state.results;
    if (result === undefined) throw new Error("No result.");
    const hedera = {
      ...state,
      coin: "hedera",
      results: [
        {
          ...result,
          coin: "hedera",
          address: "0.0.163372",
          accounts: [
            { id: "0.0.163372", balance: 14285n },
            { id: "0.0.629081", balance: 1n },
          ],
        },
      ],
    };
    const rows = publicActivityRows(hedera);
    expect(rows[0]?.at(-1)).toBe("account_ids");
    expect(rows[1]?.at(-1)).toBe("0.0.163372 0.0.629081");
    expect(publicActivityRows(state)[1]?.at(-1)).toBeNull();
    const file = await createPublicActivityExport(hedera, "json", new Date("2026-01-02T03:04:05Z"));
    const json = JSON.parse(await file.blob.text()) as {
      results: { accounts?: { id: string; balance: string }[] }[];
    };
    // Exact integers as text, as every other amount of the export.
    expect(json.results[0]?.accounts).toEqual([
      { id: "0.0.163372", balance: "14285" },
      { id: "0.0.629081", balance: "1" },
    ]);
    const csv = await (await createPublicActivityExport(hedera, "csv")).blob.text();
    // The CSV encoder ends its lines with CRLF.
    expect(csv.split("\r\n")[0]?.endsWith(",account_ids")).toBe(true);
  });
});

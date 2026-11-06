import type { FetchLike } from "@ckd/dash-network/provider-http.js";

/** Synthetic zero-history resources with independently adjustable collection coverage. */
export class PlatformIdentityHistoryFixture {
  readonly identifier = "1".repeat(31) + "2";
  readonly urls: string[] = [];
  readonly collections = new Map<string, Record<string, unknown>[]>();
  tokenTotal: number | null = 0;
  readonly info: Record<string, unknown> = {
    identifier: this.identifier,
    owner: this.identifier,
    revision: "1",
    balance: "50",
    totalTxs: 0,
    totalTransfers: 0,
    totalDocuments: 0,
    totalDataContracts: 0,
  };

  readonly fetch: FetchLike = async (input) => {
    this.urls.push(input);
    const url = new URL(input);
    if (url.pathname === "/status")
      return Response.json({
        network: "mainnet",
        indexer: { status: "synced" },
        api: { block: { height: 10, timestamp: "2026-09-01T00:00:00.000Z" } },
      });
    if (url.pathname.endsWith(`/identity/${this.identifier}`)) return Response.json(this.info);
    const collection = url.pathname.split("/").at(-1) ?? "";
    const rows = this.collections.get(collection) ?? [];
    const page = Number(url.searchParams.get("page") ?? 1);
    const limit = Number(url.searchParams.get("limit") ?? rows.length);
    return Response.json({
      resultSet: rows.slice((page - 1) * limit, page * limit),
      pagination: { total: collection === "tokens" ? this.tokenTotal : rows.length },
    });
  };
}

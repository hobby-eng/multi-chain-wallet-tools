import type { FetchLike } from "@ckd/dash-network/provider-http.js";

/** Synthetic public DashScan responses; no request leaves the test process. */
export class DashScanCoreFixture {
  static readonly address = "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5";
  readonly inputs: Record<string, unknown>[] = [
    { address: DashScanCoreFixture.address, amount: "200" },
    { address: "Xother", amount: "900" },
  ];
  readonly outputs: Record<string, unknown>[] = [
    { address: DashScanCoreFixture.address, addresses: [DashScanCoreFixture.address], value: 1000 },
  ];
  readonly transaction: Record<string, unknown> = {
    hash: "ab".repeat(32),
    type: "CLASSIC",
    blockHeight: 2_531_700,
    confirmations: 36,
    timestamp: "2026-09-01T18:54:00.000Z",
    instantLock: "01",
    chainLocked: true,
    blockHash: "cd".repeat(32),
    vIn: this.inputs,
    vOut: this.outputs,
  };
  readonly summary: Record<string, unknown> = {
    address: DashScanCoreFixture.address,
    balance: "810",
    received: "1000",
    sent: "200",
    txCount: 1,
  };
  readonly urls: string[] = [];

  /** Pending rows are returned beside, but not counted as, confirmed transactions. */
  pending(): void {
    Object.assign(this.transaction, {
      timestamp: null,
      blockHeight: null,
      blockHash: null,
      confirmations: 0,
    });
    this.summary.txCount = 0;
  }

  readonly fetch: FetchLike = async (input) => {
    this.urls.push(input);
    const path = new URL(input).pathname;
    const body =
      path === "/status"
        ? { status: "ok" }
        : path === "/blocks"
          ? { resultSet: [{ height: 2_531_735, timestamp: "2026-09-01T19:54:32.000Z" }] }
          : path.endsWith("/transactions")
            ? { resultSet: [this.transaction], pagination: { total: 1 } }
            : this.summary;
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  };
}

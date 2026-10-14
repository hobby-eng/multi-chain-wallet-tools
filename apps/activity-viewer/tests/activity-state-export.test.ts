import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import writeExcelFile, { type SheetData } from "write-excel-file/universal";
import { ShieldedActivityLedger } from "@ckd/dash-network/activity.js";
import { queryCoreAddress, type CoreAddressTransaction } from "@ckd/dash-network/public-address.js";
import { queryPlatformAddressHistory } from "@ckd/dash-network/platform-address-history.js";
import type { ScannedMatch, ShieldedPage, ViewerKeyKind } from "@ckd/dash-network/types.js";
import {
  createViewerExport,
  createViewerWorkbookExport,
  type ViewerBatchExportState,
  type ViewerSingleExportState,
} from "../src/export.js";
import { csvRecords, workbookRecords } from "./export-test-support.js";

const generatedAt = new Date("2026-09-01T21:30:00.000Z");
const coreAddress = "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5";

async function coreState(
  balance: bigint,
  received: bigint,
  sent: bigint,
): Promise<Extract<ViewerSingleExportState, { mode: "core" }>> {
  // Synthetic HTTP bodies exercise the actual normalizer without contacting a provider.
  const snapshot = await queryCoreAddress(coreAddress, "mainnet", 20, undefined, async (input) => {
    const url = new URL(input);
    const value = url.pathname.endsWith("/status")
      ? { status: "ok" }
      : url.pathname.endsWith("/blocks")
        ? { resultSet: [{ height: 100, timestamp: generatedAt.toISOString() }] }
        : url.pathname.endsWith("/transactions")
          ? { resultSet: [], pagination: { total: 0 } }
          : {
              address: coreAddress,
              txCount: 0,
              balance: balance.toString(),
              received: received.toString(),
              sent: sent.toString(),
            };
    return new Response(JSON.stringify(value));
  });
  return { mode: "core", network: "mainnet", snapshot };
}

function batch(state: ViewerSingleExportState): ViewerBatchExportState {
  return {
    batch: true,
    mode: state.mode,
    network: state.network,
    items: [{ id: "query-1", label: "1 · synthetic public fixture", state }],
    errors: [
      {
        id: "query-2",
        label: "2 · invalid public input",
        message: "Lookup failed.",
        mode: state.mode,
      },
    ],
  };
}

it("reads values after styled self-closing and omitted workbook cells in their own columns", async () => {
  // The pinned writer styles empty strings as <c .../>, while a null cell is omitted entirely.
  const data: SheetData = [
    ["timestamp", "status", "omitted", "styled_blank", "amount_atomic", "metadata"],
    ["", "pending", null, "", "9007199254740993", "instant_locked=false & chain_locked=true"],
  ];
  const blob = await writeExcelFile([{ sheet: "Fixture", data }], {
    fontFamily: "Arial",
    fontSize: 10,
  }).toBlob();
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const xml = strFromU8(files["xl/worksheets/sheet1.xml"]!);
  expect(xml).toMatch(/<c\b[^>]*\br="A2"[^>]*\/>/u);
  expect(xml).toMatch(/<c\b[^>]*\br="D2"[^>]*\/>/u);
  expect(xml).not.toMatch(/<c\b[^>]*\br="C2"/u);
  expect(await workbookRecords(blob, 1)).toEqual([
    {
      timestamp: "",
      status: "pending",
      omitted: "",
      styled_blank: "",
      amount_atomic: "9007199254740993",
      metadata: "instant_locked=false & chain_locked=true",
    },
  ]);
});

describe("AUD-028 Core activity serialization", () => {
  it.each([
    [5n, 10n, 7n, 2n],
    [1n, 10n, 7n, -2n],
    [3n, 10n, 7n, 0n],
    [9_007_199_254_740_993n, 9_007_199_254_740_991n, 0n, 2n],
  ])(
    "exports reported balance %s, received %s, sent %s, discrepancy %s exactly",
    async (reported, received, sent, discrepancy) => {
      const state = await coreState(reported, received, sent);
      expect(state.snapshot.unconfirmedDuffs).toBe(discrepancy);
      for (const exportedState of [state, batch(state)]) {
        const json = JSON.parse(createViewerExport(exportedState, "json", generatedAt).text);
        expect(json.version).toBe(3);
        const data = "batch" in exportedState ? json.data.results[0].data : json.data;
        expect(data.balance).toEqual({
          reportedBalanceDuffs: reported.toString(),
          balanceDiscrepancyDuffs: discrepancy.toString(),
          totalReceivedDuffs: received.toString(),
          totalSentDuffs: sent.toString(),
        });
        const csv = csvRecords(createViewerExport(exportedState, "csv", generatedAt).text);
        const workbook = await createViewerWorkbookExport(exportedState, generatedAt);
        const xlsx = await workbookRecords(workbook.blob, 2);
        for (const rows of [csv, xlsx]) {
          const summary = rows.find((row) => row.record_type === "address_summary")!;
          expect(summary.schema_version).toBe("3");
          expect(summary.amount_atomic).toBe(reported.toString());
          expect(summary.metadata).toContain(`reported_balance_duffs=${reported}`);
          expect(summary.metadata).toContain(`balance_discrepancy_duffs=${discrepancy}`);
          expect(summary.metadata).not.toMatch(/confirmed_duffs/u);
        }
        if ("batch" in exportedState) {
          expect(csv.find((row) => row.record_type === "error")?.status).toBe("failed");
          expect(json.data.errors[0].message).toBe("Lookup failed.");
          expect((await workbookRecords(workbook.blob, 3))[0]?.status).toBe("failed");
        }
      }
    },
  );

  it("keeps confirmation state independent of lock flags in single and batch files", async () => {
    const state = await coreState(0n, 0n, 0n);
    const cases = [
      { confirmations: null, blockHeight: null, expected: "pending" },
      { confirmations: 0, blockHeight: null, expected: "unconfirmed" },
      { confirmations: 1, blockHeight: 100, expected: "confirmed" },
      { confirmations: null, blockHeight: 0, expected: "confirmed" },
    ] as const;
    const transactions: CoreAddressTransaction[] = [];
    const expected: string[] = [];
    for (const item of cases) {
      for (const [instantLocked, chainLocked] of [
        [false, false],
        [true, false],
        [false, true],
        [true, true],
      ] as const) {
        transactions.push({
          txid: transactions.length.toString(16).padStart(64, "0"),
          type: "CLASSIC",
          timestampMs: null,
          blockHeight: item.blockHeight,
          confirmations: item.confirmations,
          instantLocked,
          chainLocked,
          receivedDuffs: 0n,
          spentInputDuffs: 0n,
          netDuffs: 0n,
          feeDuffs: null,
          blockHash: null,
        });
        expected.push(item.expected);
      }
    }
    state.snapshot.transactions = transactions;
    for (const exportedState of [state, batch(state)]) {
      const rows = csvRecords(createViewerExport(exportedState, "csv", generatedAt).text).filter(
        (row) => row.record_type === "transaction",
      );
      expect(rows.map((row) => row.status)).toEqual(expected);
      rows.forEach((row, index) => {
        expect(row.metadata).toContain(`instant_locked=${transactions[index]!.instantLocked}`);
        expect(row.metadata).toContain(`chain_locked=${transactions[index]!.chainLocked}`);
      });
      const json = JSON.parse(createViewerExport(exportedState, "json", generatedAt).text);
      const data = "batch" in exportedState ? json.data.results[0].data : json.data;
      expect(
        data.transactions.map(
          (transaction: { confirmationStatus: string }) => transaction.confirmationStatus,
        ),
      ).toEqual(expected);
      const workbook = await createViewerWorkbookExport(exportedState, generatedAt);
      const xlsx = (await workbookRecords(workbook.blob, 2)).filter(
        (row) => row.record_type === "transaction",
      );
      expect(xlsx.map((row) => row.status)).toEqual(expected);
      xlsx.forEach((row, index) => {
        expect(row.timestamp).toBe("");
        expect(row.transaction_hash).toBe(transactions[index]!.txid);
        expect(row.block_height).toBe(String(transactions[index]!.blockHeight ?? ""));
        expect(row.amount_atomic).toBe("0");
        expect(row.metadata).toContain(`instant_locked=${transactions[index]!.instantLocked}`);
        expect(row.metadata).toContain(`chain_locked=${transactions[index]!.chainLocked}`);
      });
    }
  });
});

function orchardState(
  keyKind: ViewerKeyKind,
  complete: boolean,
  spent: boolean,
): ViewerSingleExportState {
  const ledger = new ShieldedActivityLedger(keyKind);
  // Public synthetic note data, with a later action matching the note's nullifier when spent.
  const nullifier = "01".repeat(32);
  const note = {
    value: 9_007_199_254_740_993n,
    address: "synthetic-note-address",
    addressRaw: "00".repeat(43),
    memo: "",
    memoHex: "",
    ...(keyKind === "full" ? { noteNullifier: nullifier } : {}),
  };
  const match: ScannedMatch = {
    position: 0n,
    cmx: "02".repeat(32),
    actionNullifier: "00".repeat(32),
    ...(keyKind === "outgoing" ? { outgoing: note } : { incoming: note }),
  };
  const wireNote = (spentAction: boolean) => ({
    cmx: new Uint8Array(32),
    nullifier: new Uint8Array(32).fill(spentAction ? 1 : 0),
    cvNet: new Uint8Array(32),
    encryptedNote: new Uint8Array(),
  });
  const page: ShieldedPage = {
    notes: [wireNote(false), ...(spent ? [wireNote(true)] : [])],
    proofHeight: 1n,
    coreChainLockedHeight: 1,
    timeMs: 1n,
    protocolVersion: 1,
  };
  ledger.applyPage(0n, page, [match]);
  return { mode: "shielded", network: "mainnet", snapshot: ledger.snapshot(complete) };
}

describe("AUD-028 Orchard activity serialization", () => {
  it.each([
    ["full", false, false, "unknown", null],
    ["full", true, false, "spendable", "9007199254740993"],
    ["full", false, true, "spent", null],
    ["full", true, true, "spent", "0"],
    ["incoming", true, false, "unknown", null],
    ["incoming", false, false, "unknown", null],
    ["outgoing", true, false, "unknown", null],
    ["outgoing", false, false, "unknown", null],
  ] as const)(
    "keeps %s complete=%s spent=%s consistent in all formats",
    async (keyKind, complete, spent, status, balance) => {
      const state = orchardState(keyKind, complete, spent);
      for (const exportedState of [state, batch(state)]) {
        const json = JSON.parse(createViewerExport(exportedState, "json", generatedAt).text);
        const data = "batch" in exportedState ? json.data.results[0].data : json.data;
        expect(data.summary.balanceCredits).toBe(balance);
        expect(data.notes[0].spent).toBe(status === "unknown" ? null : status === "spent");
        expect(data.notes[0].spendStatus).toBe(status);
        const csv = csvRecords(createViewerExport(exportedState, "csv", generatedAt).text);
        const workbook = await createViewerWorkbookExport(exportedState, generatedAt);
        const xlsx = await workbookRecords(workbook.blob, 2);
        for (const rows of [csv, xlsx]) {
          const summary = rows.find((row) => row.record_type === "scan_summary")!;
          expect(summary.status).toBe(complete ? "complete" : "partial");
          expect(summary.amount_atomic).toBe(balance ?? "");
          const note = rows.find((row) => row.record_type === "note")!;
          expect(note.status).toBe(status);
          expect(note.amount_atomic).toBe("9007199254740993");
          expect(note.metadata).toContain(`scan_complete=${complete}`);
        }
        expect((await workbookRecords(workbook.blob, 1))[0]?.balance_atomic).toBe(balance ?? "");
      }
    },
  );
});

it("keeps admitted auxiliary Platform history separate from proof-backed state", async () => {
  const address = "dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs";
  const history = await queryPlatformAddressHistory(
    address,
    "mainnet",
    20,
    undefined,
    async (url) => {
      const body = url.endsWith("/status")
        ? {
            network: "evo1",
            indexer: { status: "synced" },
            api: { block: { height: 100, timestamp: generatedAt.toISOString() } },
          }
        : {
            bech32mAddress: address.toUpperCase(),
            totalTxs: 0,
            incomingTxs: 0,
            outgoingTxs: 0,
            nonce: 0,
            balance: "2",
            totalIncomingAmount: "2",
            totalOutgoingAmount: null,
          };
      return new Response(JSON.stringify(body));
    },
  );
  const state: ViewerSingleExportState = {
    mode: "platform",
    network: "mainnet",
    snapshot: {
      kind: "platform",
      network: "mainnet",
      address,
      exists: true,
      balanceCredits: 5n,
      nonce: 1n,
      proofHeight: 101n,
      coreChainLockedHeight: 100,
      protocolVersion: 1,
      responseTimeMs: 1n,
    },
    history,
  };
  const json = JSON.parse(createViewerExport(state, "json", generatedAt).text);
  expect(json.data.state.balanceCredits).toBe("5");
  expect(json.data.state.nonce).toBe("1");
  expect(json.data.history.explorerState.balanceCredits).toBe("2");
  expect(json.data.history.explorerState.nonce).toBe(0);
  const csv = csvRecords(createViewerExport(state, "csv", generatedAt).text);
  const workbook = await createViewerWorkbookExport(state, generatedAt);
  const xlsx = await workbookRecords(workbook.blob, 2);
  for (const rows of [csv, xlsx]) {
    expect(rows[0]?.status).toBe("proof_takes_precedence");
    expect(rows[0]?.amount_atomic).toBe("5");
    expect(rows[0]?.metadata).toContain("explorer_balance_credits=2");
  }
});

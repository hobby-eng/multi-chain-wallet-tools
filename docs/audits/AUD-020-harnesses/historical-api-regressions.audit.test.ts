import { describe, expect, it } from "vitest";
import { createRecoveryExport } from "../../../apps/discovery-scanner/src/export.ts";
import type { RecoveryWalletResult } from "../../../apps/discovery-scanner/src/types.ts";

function resultWithoutBalanceUnit(coinId: string, coinLabel: string, balanceLabel: string) {
  return {
    inputId: "public-vector",
    label: "public vector",
    coinId,
    coinLabel,
    network: "mainnet",
    startedAt: "2026-10-01T00:00:00.000Z",
    completedAt: "2026-10-01T00:01:00.000Z",
    overview: [],
    warnings: [],
    sections: [
      {
        id: "core",
        title: `${coinLabel} accounts`,
        description: "synthetic public result",
        state: "complete",
        metrics: [],
        findings: [
          {
            id: `${coinId}:0`,
            title: "synthetic public address",
            subtitle: "receive address",
            balanceAtomic: 12345678n,
            balanceLabel,
            fields: [],
          },
        ],
        scanned: 1,
        source: "synthetic fixture",
        proof: "none",
      },
    ],
  } as unknown as RecoveryWalletResult;
}

function displayBalance(result: RecoveryWalletResult): string {
  const [header, row] = createRecoveryExport([result], "csv").text.trim().split("\r\n");
  // The exporter quotes every cell, including escaped embedded quotes.
  const parseCells = (line: string) =>
    [...line.matchAll(/"((?:[^"]|"")*)"/gu)].map((match) => match[1]!.replaceAll('""', '"'));
  return parseCells(row!)[parseCells(header!).indexOf("balance_display")]!;
}

describe("AUD-017-API002: current non-Dash adapter balance shapes", () => {
  it.each([
    ["bitcoin", "Bitcoin", "0.12345678 BTC"],
    ["ethereum", "Ethereum", "0.000000000012345678 ETH"],
  ])("reproduces the empty balance_display for %s without balanceUnit", (coinId, coinLabel, label) => {
    expect(displayBalance(resultWithoutBalanceUnit(coinId, coinLabel, label))).toBe("");
  });
});
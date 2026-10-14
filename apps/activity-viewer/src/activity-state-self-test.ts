import { PlatformAddressHistoryAdmission } from "@ckd/dash-network/platform-address-history-admission.js";
import { ShieldedActivityState } from "@ckd/dash-network/shielded-activity-state.js";
import type { ActivitySnapshot, ShieldedActivity } from "@ckd/dash-network/types.js";
import type { CoreAddressSnapshot } from "@ckd/dash-network/public-address.js";
import { bech32m } from "@scure/base";
import { CoreActivityState } from "./core-activity-state.js";
import { createViewerExport } from "./export-text.js";

const PLATFORM_ADDRESS = "dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs";

function requireCheck(passed: boolean, label: string): void {
  if (!passed) throw new Error(`Activity state self-test failed: ${label}.`);
}

function requireRefusal(run: () => unknown, label: string): void {
  try {
    run();
  } catch {
    return;
  }
  throw new Error(`Activity state self-test failed: ${label} was admitted.`);
}

/** Fast local known answers for accounting, confirmation and auxiliary-history admission. */
export class ActivityStateSelfTest {
  static run(): readonly string[] {
    requireCheck(
      CoreActivityState.confirmationStatus({ confirmations: 0, blockHeight: null }) ===
        "unconfirmed" &&
        CoreActivityState.confirmationStatus({ confirmations: null, blockHeight: null }) ===
          "pending" &&
        CoreActivityState.confirmationStatus({ confirmations: 1, blockHeight: 10 }) ===
          "confirmed" &&
        CoreActivityState.confirmationStatus({ confirmations: null, blockHeight: 0 }) ===
          "confirmed",
      "Core confirmation state",
    );
    // Independent arithmetic known answer: reported 5 minus (received 10 minus sent 7) is 2.
    const core: CoreAddressSnapshot = {
      kind: "core",
      provider: "Synthetic public fixture",
      address: "Xfixture",
      network: "mainnet",
      balanceDuffs: 5n,
      unconfirmedDuffs: 2n,
      totalReceivedDuffs: 10n,
      totalSentDuffs: 7n,
      transactionCount: 0,
      transactions: [],
      historyLimit: 1,
      endpoint: "https://example.invalid",
      indexStatus: "ok",
      indexedHeight: 1,
      indexedTimeMs: 1,
      requests: 0,
    };
    const generatedAt = new Date(0);
    const state = { mode: "core" as const, network: "mainnet" as const, snapshot: core };
    const json = JSON.parse(createViewerExport(state, "json", generatedAt).text);
    requireCheck(
      json.data.balance.reportedBalanceDuffs === "5" &&
        json.data.balance.balanceDiscrepancyDuffs === "2" &&
        !("confirmedDuffs" in json.data.balance) &&
        !("unconfirmedDuffs" in json.data.balance),
      "Core export accounting",
    );
    const csv = createViewerExport(state, "csv", generatedAt).text;
    requireCheck(
      csv.includes("balance_discrepancy_duffs=2") && !csv.includes("unconfirmed_duffs="),
      "Core CSV accounting",
    );

    const record: ShieldedActivity = {
      position: 0n,
      cmx: "",
      actionNullifier: "",
      direction: "received",
      spent: false,
      incoming: { value: 1n, address: "synthetic-note", addressRaw: "", memoHex: "", memo: "" },
    };
    const snapshot: ActivitySnapshot = {
      records: [record],
      scannedNotes: 1n,
      proofHeight: 1n,
      protocolVersion: 1,
      complete: false,
      keyKind: "full",
      balance: 1n,
      receivedExternal: 1n,
      sentExternal: 0n,
      selfOrChange: 0n,
    };
    const partial = new ShieldedActivityState(snapshot);
    requireCheck(
      partial.noteSpendStatus(record) === "unknown" && partial.balance === null,
      "partial Orchard spend state",
    );
    requireCheck(
      ShieldedActivityState.noteSpendStatus(record, true, "full") === "spendable",
      "complete Orchard spend state",
    );
    requireCheck(
      ShieldedActivityState.noteSpendStatus({ ...record, spent: true }, false, "full") === "spent",
      "observed Orchard spend",
    );
    requireCheck(
      ShieldedActivityState.noteSpendStatus(record, true, "incoming") === "unknown",
      "incoming-only Orchard capability",
    );
    const { incoming, ...outgoingRecord } = record;
    requireCheck(
      ShieldedActivityState.noteSpendStatus(
        { ...outgoingRecord, outgoing: incoming! },
        true,
        "outgoing",
      ) === "unknown",
      "outgoing-only Orchard capability",
    );
    const shielded = { mode: "shielded" as const, network: "mainnet" as const, snapshot };
    const shieldedJson = JSON.parse(createViewerExport(shielded, "json", generatedAt).text);
    requireCheck(
      shieldedJson.data.summary.balanceCredits === null &&
        shieldedJson.data.notes[0].spent === null &&
        shieldedJson.data.notes[0].spendStatus === "unknown",
      "partial Orchard JSON",
    );
    const shieldedCsv = createViewerExport(shielded, "csv", generatedAt).text;
    requireCheck(
      shieldedCsv.includes(",unknown,") && !shieldedCsv.includes(",spendable,"),
      "partial Orchard CSV",
    );

    const admission = new PlatformAddressHistoryAdmission(PLATFORM_ADDRESS, "mainnet");
    requireCheck(
      admission.admitResource(PLATFORM_ADDRESS.toUpperCase()) === PLATFORM_ADDRESS,
      "normalized Platform resource",
    );
    requireRefusal(() => admission.admitInfo({}), "missing Platform resource");
    requireRefusal(() => admission.admitResource("invalid"), "malformed Platform resource");
    // A different checksum-valid public resource must also be refused, not just malformed input.
    const unrelatedAddress = bech32m.encode(
      "dash",
      // Synthetic DIP18 P2PKH payload: type 0xb0 followed by a zero HASH160 (20 bytes).
      bech32m.toWords(Uint8Array.of(0xb0, ...new Uint8Array(20))),
    );
    requireRefusal(() => admission.admitResource(unrelatedAddress), "unrelated Platform resource");
    requireRefusal(
      () => new PlatformAddressHistoryAdmission(PLATFORM_ADDRESS, "testnet"),
      "wrong Platform network",
    );
    return [
      "Core confirmation and export accounting",
      "Orchard completeness and spend state",
      "Platform history resource binding",
    ];
  }
}

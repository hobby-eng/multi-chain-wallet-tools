import type { PlatformHistorySummaryView } from "@ckd/network-boundary/protocol.js";
import type { PlatformAddressHistoryAdmission } from "@ckd/dash-network/platform-address-history-admission.js";
import type { RecoveryField } from "../../types.js";
import {
  exactSafeInteger,
  exactUnsigned,
  formatDashFromCredits,
  object,
  seenFields,
} from "./util.js";

export interface ValidatedPlatformHistory {
  transactionCount: number;
  incomingCount: number;
  outgoingCount: number;
  totalReceived: bigint;
  totalSent: bigint;
  totalFees: bigint | null;
  firstSeen: string | null;
  lastSeen: string | null;
  indexedHeight: number;
  fundingCoreTx: string | null;
}

function optionalTimestamp(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Isolated Platform history returned an invalid ${label}.`);
  }
  return value;
}

export function validatePlatformHistory(
  value: PlatformHistorySummaryView,
  expectedResource: string | Pick<PlatformAddressHistoryAdmission, "admitResource">,
  expectedBalance: bigint,
): ValidatedPlatformHistory {
  const history = object(value, "Isolated Platform history response");
  if (typeof expectedResource === "string") {
    // Identity IDs have their own format; address admission owns DIP18/network validation.
    if (history.resource !== expectedResource)
      throw new Error("Isolated Platform history returned the wrong resource.");
  } else {
    expectedResource.admitResource(history.resource);
  }
  const balance = exactUnsigned(history.balance, "Platform history balance");
  if (balance !== expectedBalance)
    throw new Error("Platform Explorer balance did not match the proof-verified DAPI balance.");
  return {
    transactionCount: exactSafeInteger(
      history.transactionCount,
      "Platform history transaction count",
    ),
    incomingCount: exactSafeInteger(history.incomingCount, "Platform history incoming count"),
    outgoingCount: exactSafeInteger(history.outgoingCount, "Platform history outgoing count"),
    totalReceived: exactUnsigned(history.totalReceived, "Platform history received amount"),
    totalSent: exactUnsigned(history.totalSent, "Platform history sent amount"),
    totalFees:
      history.totalFees === null
        ? null
        : exactUnsigned(history.totalFees, "Platform history fee amount"),
    firstSeen: optionalTimestamp(history.firstSeen, "first-seen timestamp"),
    lastSeen: optionalTimestamp(history.lastSeen, "last-seen timestamp"),
    indexedHeight: exactSafeInteger(history.indexedHeight, "Platform history indexed height"),
    fundingCoreTx:
      typeof history.fundingCoreTx === "string" && /^[0-9a-f]{64}$/u.test(history.fundingCoreTx)
        ? history.fundingCoreTx
        : null,
  };
}

/** The history fields of a Platform address or identity finding, with its fees when known. */
export function platformHistoryFields(history: ValidatedPlatformHistory): RecoveryField[] {
  return [
    { label: "Transactions reported", value: String(history.transactionCount) },
    { label: "Incoming credit events", value: String(history.incomingCount) },
    { label: "Outgoing credit events", value: String(history.outgoingCount) },
    { label: "Lifetime received", value: formatDashFromCredits(history.totalReceived) },
    { label: "Lifetime sent", value: formatDashFromCredits(history.totalSent) },
    ...(history.totalFees === null
      ? []
      : [{ label: "Lifetime fees spent", value: formatDashFromCredits(history.totalFees) }]),
    ...seenFields(history),
  ];
}

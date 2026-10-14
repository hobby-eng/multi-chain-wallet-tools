import { RECOVERY_SECTION_GROUPS } from "./recovery-section-groups.js";
import { AtomicAmount } from "@ckd/core/atomic-amount.js";
import { validateHistory, historyAmount } from "./history.js";
import { encodeCsvCell } from "@ckd/export/csv.js";
import type {
  RecoveryExportEnvelope,
  RecoveryExportResult,
  RecoverySectionId,
  RecoveryWalletResult,
} from "./types.js";

export type RecoveryExportFormat = "json" | "csv";

export interface RecoveryExportFile {
  filename: string;
  mimeType: "application/json" | "text/csv";
  text: string;
}

function safeTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/gu, "-");
}

function exportHistory(
  value: NonNullable<RecoveryWalletResult["sections"][number]["findings"][number]["history"]>,
) {
  const history = validateHistory(value);
  const {
    firstReceived: _firstReceived,
    lastReceived: _lastReceived,
    firstSpent: _firstSpent,
    lastSpent: _lastSpent,
    ...summary
  } = history;
  return summary;
}

function exportableResults(results: RecoveryWalletResult[]): RecoveryExportResult[] {
  return results.map((result) => ({
    inputId: result.inputId,
    label: result.label,
    coinId: result.coinId,
    coinLabel: result.coinLabel,
    network: result.network,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    overview: result.overview,
    warnings: result.warnings,
    sections: result.sections.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description,
      state: section.state,
      ...(section.balanceAvailable === undefined
        ? {}
        : { balanceAvailable: section.balanceAvailable }),
      scanned: section.scanned.toString(),
      source: section.source,
      proof: section.proof,
      ...(section.warning === undefined ? {} : { warning: section.warning }),
      metrics: section.metrics,
      findings: section.findings.map((finding) => ({
        id: finding.id,
        title: finding.title,
        subtitle: finding.subtitle,
        balanceAtomic: finding.balanceAtomic?.toString() ?? null,
        balanceLabel: finding.balanceLabel,
        ...(finding.balanceUnit === undefined
          ? {}
          : {
              balanceUnit: {
                asset: finding.balanceUnit.asset,
                atomicUnit: finding.balanceUnit.atomicUnit,
                decimals: finding.balanceUnit.decimals,
              },
            }),
        fields: finding.fields,
        ...(finding.history === undefined ? {} : { history: exportHistory(finding.history) }),
      })),
    })),
  }));
}

function csvCell(value: string): string {
  return encodeCsvCell(value, true);
}

const CSV_FIELD_COLUMNS = [
  ["Scan family", "scan_family", RECOVERY_SECTION_GROUPS.members("core")],
  ["Derivation path", "derivation_path", RECOVERY_SECTION_GROUPS.members("derivable")],
  ["Branch", "branch", RECOVERY_SECTION_GROUPS.members("addressable")],
  ["Address index", "address_index", RECOVERY_SECTION_GROUPS.members("addressable")],
  ["Transactions reported", "transactions_reported", RECOVERY_SECTION_GROUPS.members("history")],
  ["Incoming credit events", "incoming_credit_events", RECOVERY_SECTION_GROUPS.members("credits")],
  ["Outgoing credit events", "outgoing_credit_events", RECOVERY_SECTION_GROUPS.members("credits")],
  ["Lifetime received", "lifetime_received_display", RECOVERY_SECTION_GROUPS.members("history")],
  ["Lifetime sent", "lifetime_sent_display", RECOVERY_SECTION_GROUPS.members("history")],
  ["Lifetime fees spent", "lifetime_fees_spent_dash", ["identity"]],
  ["First seen", "first_seen", RECOVERY_SECTION_GROUPS.members("history")],
  ["Last seen", "last_seen", RECOVERY_SECTION_GROUPS.members("history")],
  ["Public-key hash", "public_key_hash", RECOVERY_SECTION_GROUPS.members("history")],
  ["Pool position", "pool_position", ["shielded"]],
  ["Spent at pool position", "spent_at_pool_position", ["shielded"]],
  ["Direction", "direction", ["shielded"]],
  ["Note value", "note_value_dash", ["shielded"]],
  ["Spend state", "spend_state", ["shielded"]],
] as const;

const CSV_SECTION_METRIC_COLUMNS = [
  ["Spendable balance", "section_spendable_balance_dash", true, ["shielded"]],
  ["Lifetime received", "section_lifetime_received_dash", true, ["shielded"]],
  ["Lifetime sent", "section_lifetime_sent_dash", true, ["shielded"]],
  ["Lifetime self/change", "section_lifetime_self_change_dash", true, ["shielded"]],
  ["Observed received", "section_observed_received_dash", true, ["shielded"]],
  ["Observed sent", "section_observed_sent_dash", true, ["shielded"]],
  ["Observed self/change", "section_observed_self_change_dash", true, ["shielded"]],
  ["Incoming notes", "section_incoming_notes", false, ["shielded"]],
  ["Outgoing notes", "section_outgoing_notes", false, ["shielded"]],
  ["Self/change notes", "section_self_change_notes", false, ["shielded"]],
  ["Spendable notes", "section_spendable_notes", false, ["shielded"]],
  ["Spent notes", "section_spent_notes", false, ["shielded"]],
  ["Notes with memo", "section_notes_with_memo", false, ["shielded"]],
  ["Recovered notes", "section_recovered_notes", false, ["shielded"]],
  ["First activity pool position", "section_first_activity_pool_position", false, ["shielded"]],
  ["Last activity pool position", "section_last_activity_pool_position", false, ["shielded"]],
] as const;

function appliesToIncludedSection(
  sectionIds: readonly RecoverySectionId[],
  included: ReadonlySet<RecoverySectionId>,
): boolean {
  return sectionIds.some((sectionId) => included.has(sectionId));
}

function isDedicatedFieldLabel(label: string): boolean {
  return (
    CSV_FIELD_COLUMNS.some(([known]) => known === label) ||
    /derivation path$/iu.test(label) ||
    /public-key hash$/iu.test(label)
  );
}

function fieldValue(
  fields: RecoveryWalletResult["sections"][number]["findings"][number]["fields"],
  label: string,
): string {
  if (label === "Derivation path")
    return fields.find((field) => /derivation path$/iu.test(field.label))?.value ?? "";
  if (label === "Public-key hash")
    return fields.find((field) => /public-key hash$/iu.test(field.label))?.value ?? "";
  return fields.find((field) => field.label === label)?.value ?? "";
}

function numericDash(value: string): string {
  return /^(\d+(?:\.\d+)?) DASH(?:\b|$)/u.exec(value)?.[1] ?? "";
}

function findingBalanceDisplay(
  finding: RecoveryWalletResult["sections"][number]["findings"][number],
): string {
  if (finding.balanceAtomic != null && finding.balanceUnit !== undefined) {
    return AtomicAmount.format(finding.balanceAtomic, finding.balanceUnit.decimals);
  }
  return numericDash(finding.balanceLabel);
}

function csvFieldValue(
  fields: RecoveryWalletResult["sections"][number]["findings"][number]["fields"],
  label: string,
): string {
  const value = fieldValue(fields, label);
  return label === "Lifetime received" ||
    label === "Lifetime sent" ||
    label === "Lifetime fees spent" ||
    label === "Note value"
    ? numericDash(value)
    : value;
}

function sectionMetricValue(
  metrics: RecoveryWalletResult["sections"][number]["metrics"],
  label: string,
  numeric: boolean,
): string {
  const value = metrics.find((metric) => metric.label === label)?.value ?? "";
  return numeric ? numericDash(value) : value;
}

const HISTORY_COLUMNS = [
  ["status", "history_status"],
  ["source", "history_source"],
  ["scope", "history_scope"],
  ["note", "history_note"],
  ["asset", "history_asset"],
  ["atomicUnit", "history_atomic_unit"],
  ["decimals", "history_decimals"],
  ["totalReceivedAtomic", "total_received_atomic"],
  ["totalSentAtomic", "total_sent_atomic"],
  ["totalFeesAtomic", "total_fees_atomic"],
  ["firstSeen", "history_first_seen_utc"],
  ["lastSeen", "history_last_seen_utc"],
  ["transactionCount", "history_transaction_count"],
  ["pendingTransactionCount", "pending_transaction_count"],
] as const;
const HISTORY_AMOUNT_COLUMNS = [
  ["totalReceivedAtomic", "total_received"],
  ["totalSentAtomic", "total_sent"],
  ["totalFeesAtomic", "total_fees"],
] as const;

function toCsv(results: RecoveryWalletResult[]): string {
  const includedSections = new Set<RecoverySectionId>(
    results.flatMap((result) =>
      result.sections.filter((section) => section.state !== "skipped").map((section) => section.id),
    ),
  );
  const fieldColumns = CSV_FIELD_COLUMNS.filter(([, , sectionIds]) =>
    appliesToIncludedSection(sectionIds, includedSections),
  );
  const sectionMetricColumns = CSV_SECTION_METRIC_COLUMNS.filter(([, , , sectionIds]) =>
    appliesToIncludedSection(sectionIds, includedSections),
  );
  const header = [
    "wallet_label",
    "coin",
    "network",
    "section",
    "section_state",
    "resource",
    "description",
    "balance_atomic",
    "balance_asset",
    "balance_atomic_unit",
    "balance_decimals",
    "balance_display",
    ...HISTORY_COLUMNS.map(([, column]) => column),
    ...HISTORY_AMOUNT_COLUMNS.map(([, column]) => column),
    ...fieldColumns.map(([, column]) => column),
    ...sectionMetricColumns.map(([, column]) => column),
    "metadata",
    "warnings",
    "proof",
  ];
  const csvRow = (cells: readonly string[]): string => cells.map(csvCell).join(",");
  const rows = [csvRow(header)];
  for (const result of results) {
    for (const section of result.sections) {
      // Every row of a section ends with the same notes: the warnings and the proof.
      const notes = [
        [...result.warnings, ...(section.warning ? [section.warning] : [])].join(" | "),
        section.proof,
      ];
      if (section.findings.length === 0) {
        rows.push(
          csvRow([
            result.label,
            result.coinLabel,
            result.network,
            section.title,
            section.state,
            "",
            section.description,
            "",
            "",
            "",
            "",
            "",
            ...HISTORY_COLUMNS.map(() => ""),
            ...HISTORY_AMOUNT_COLUMNS.map(() => ""),
            ...fieldColumns.map(() => ""),
            ...sectionMetricColumns.map(([label, , numeric]) =>
              sectionMetricValue(section.metrics, label, numeric),
            ),
            "",
            ...notes,
          ]),
        );
        continue;
      }
      for (const finding of section.findings) {
        const metadata = finding.fields
          .filter(({ label }) => !isDedicatedFieldLabel(label))
          .map(({ label, value }) => `${label}: ${value}`)
          .join(" | ");
        rows.push(
          csvRow([
            result.label,
            result.coinLabel,
            result.network,
            section.title,
            section.state,
            finding.title,
            finding.subtitle,
            finding.balanceAtomic?.toString() ?? "",
            finding.balanceUnit?.asset ?? "",
            finding.balanceUnit?.atomicUnit ?? "",
            String(finding.balanceUnit?.decimals ?? ""),
            findingBalanceDisplay(finding),
            ...HISTORY_COLUMNS.map(([key]) => String(finding.history?.[key] ?? "")),
            ...HISTORY_AMOUNT_COLUMNS.map(([key]) =>
              finding.history?.[key] == null
                ? ""
                : historyAmount(finding.history[key]!, finding.history).split(" ")[0]!,
            ),
            ...fieldColumns.map(([label]) =>
              label === "First seen" && finding.history
                ? (finding.history.firstSeen ?? "")
                : label === "Last seen" && finding.history
                  ? (finding.history.lastSeen ?? "")
                  : csvFieldValue(finding.fields, label),
            ),
            ...sectionMetricColumns.map(([label, , numeric]) =>
              sectionMetricValue(section.metrics, label, numeric),
            ),
            metadata,
            ...notes,
          ]),
        );
      }
    }
  }
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

export function createRecoveryExport(
  results: RecoveryWalletResult[],
  format: RecoveryExportFormat,
  date = new Date(),
): RecoveryExportFile {
  if (results.length === 0) throw new Error("Run a recovery scan before exporting.");
  const suffix = safeTimestamp(date);
  if (format === "json") {
    const envelope: RecoveryExportEnvelope = {
      format: "wallet-discovery-report",
      version: 1,
      createdAt: date.toISOString(),
      containsSecrets: false,
      safetyNotice:
        "No mnemonic, BIP39 passphrase, seed, private key, spending key, or viewing key is included.",
      results: exportableResults(results),
    };
    return {
      filename: `wallet-discovery-report-${suffix}.json`,
      mimeType: "application/json",
      text: `${JSON.stringify(envelope, null, 2)}\n`,
    };
  }
  return {
    filename: `wallet-discovery-report-${suffix}.csv`,
    mimeType: "text/csv",
    text: toCsv(results),
  };
}

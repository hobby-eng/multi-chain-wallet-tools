import { PlatformProofIndexReconciliation } from "@ckd/dash-network/platform-proof-index.js";
import { ShieldedActivityState } from "@ckd/dash-network/shielded-activity-state.js";
import { encodeCsv, type CsvValue } from "@ckd/export/csv.js";
export type { CsvValue } from "@ckd/export/csv.js";
import { formatDashCredits, formatDashDuffs } from "@ckd/core/dash-units.js";
import type { ViewerNetwork } from "@ckd/dash-network/types.js";
import type {
  ViewerBatchExportState,
  ViewerExportState,
  ViewerSingleExportState,
} from "./export-model.js";
import {
  exactJson,
  exportError,
  isBatchExportState,
  VIEWER_EXPORT_SCHEMA_VERSION,
} from "./export-common.js";
import { CoreActivityState } from "./core-activity-state.js";
import { IdentityHistoryCoverage } from "@ckd/dash-network/identity-history-coverage.js";

function timestamp(value: number | bigint | null): string {
  if (value === null) return "";
  const numeric = typeof value === "bigint" ? Number(value) : value;
  return Number.isFinite(numeric) && numeric > 0 ? new Date(numeric).toISOString() : "";
}

function csv(rows: ReadonlyArray<ReadonlyArray<CsvValue>>): string {
  return encodeCsv(rows);
}

function directionFromNet(value: bigint): string {
  if (value > 0n) return "received";
  if (value < 0n) return "sent";
  return "related";
}

/** Column order shared by CSV serialization and XLSX detail projections. */
export const CSV_HEADER: CsvValue[] = [
  "schema_version",
  "generated_at",
  "mode",
  "network",
  "query_label",
  "resource_id",
  "resource_name",
  "record_type",
  "record_id",
  "source",
  "timestamp",
  "status",
  "type",
  "subtype",
  "direction",
  "amount_atomic",
  "amount_unit",
  "amount_dash",
  "transaction_hash",
  "block_height",
  "public_key_hash",
  "public_key",
  "metadata",
];

interface CsvRecord {
  queryLabel: string;
  resourceId?: CsvValue;
  resourceName?: CsvValue;
  recordType: string;
  recordId?: CsvValue;
  source?: CsvValue;
  timestamp?: CsvValue;
  status?: CsvValue;
  type?: CsvValue;
  subtype?: CsvValue;
  direction?: CsvValue;
  amountAtomic?: bigint | null;
  amountUnit?: "credits" | "duffs";
  transactionHash?: CsvValue;
  blockHeight?: CsvValue;
  publicKeyHash?: CsvValue;
  publicKey?: CsvValue;
  metadata?: CsvValue;
}

function metadata(
  entries: ReadonlyArray<readonly [string, CsvValue | readonly string[] | undefined]>,
): string {
  return entries
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value]) => `${label}=${Array.isArray(value) ? value.join("; ") : String(value)}`)
    .join(" | ");
}

function amountDash(value: bigint | null | undefined, unit: CsvRecord["amountUnit"]): string {
  if (value === null || value === undefined || unit === undefined) return "";
  const formatted =
    unit === "duffs" ? formatDashDuffs(value, true) : formatDashCredits(value, true);
  return formatted.replace(/ DASH$/u, "");
}

function csvRecord(
  mode: ViewerBatchExportState["mode"],
  network: ViewerNetwork,
  generatedAt: string,
  record: CsvRecord,
): CsvValue[] {
  return [
    String(VIEWER_EXPORT_SCHEMA_VERSION),
    generatedAt,
    mode,
    network,
    record.queryLabel,
    record.resourceId ?? null,
    record.resourceName ?? null,
    record.recordType,
    record.recordId ?? null,
    record.source ?? null,
    record.timestamp ?? null,
    record.status ?? null,
    record.type ?? null,
    record.subtype ?? null,
    record.direction ?? null,
    record.amountAtomic ?? null,
    record.amountUnit ?? null,
    amountDash(record.amountAtomic, record.amountUnit),
    record.transactionHash ?? null,
    record.blockHeight ?? null,
    record.publicKeyHash ?? null,
    record.publicKey ?? null,
    record.metadata ?? null,
  ];
}

function coreRows(
  state: Extract<ViewerSingleExportState, { mode: "core" }>,
  generatedAt: string,
): CsvValue[][] {
  const { snapshot } = state;
  const balance = new CoreActivityState(snapshot).balance;
  const queryLabel = snapshot.address;
  const records = [
    csvRecord(state.mode, state.network, generatedAt, {
      queryLabel,
      resourceId: snapshot.address,
      resourceName: snapshot.address,
      recordType: "address_summary",
      recordId: snapshot.address,
      source: snapshot.provider,
      timestamp: timestamp(snapshot.indexedTimeMs),
      status: snapshot.indexStatus,
      type: "CORE_ADDRESS",
      direction: "related",
      amountAtomic: balance.reportedBalanceDuffs,
      amountUnit: "duffs",
      blockHeight: snapshot.indexedHeight,
      metadata: metadata([
        ["reported_balance_duffs", balance.reportedBalanceDuffs],
        ["balance_discrepancy_duffs", balance.balanceDiscrepancyDuffs],
        ["total_received_duffs", balance.totalReceivedDuffs],
        ["total_sent_duffs", balance.totalSentDuffs],
        ["transaction_count", snapshot.transactionCount],
        ["history_limit", snapshot.historyLimit],
        ["requests", snapshot.requests],
      ]),
    }),
    ...snapshot.transactions.map((transaction) =>
      csvRecord(state.mode, state.network, generatedAt, {
        queryLabel,
        resourceId: snapshot.address,
        resourceName: snapshot.address,
        recordType: "transaction",
        recordId: transaction.txid,
        source: snapshot.provider,
        timestamp: timestamp(transaction.timestampMs),
        status: CoreActivityState.confirmationStatus(transaction),
        type: transaction.type,
        direction: directionFromNet(transaction.netDuffs),
        amountAtomic: transaction.netDuffs,
        amountUnit: "duffs",
        transactionHash: transaction.txid,
        blockHeight: transaction.blockHeight,
        metadata: metadata([
          ["confirmations", transaction.confirmations],
          ["instant_locked", transaction.instantLocked],
          ["chain_locked", transaction.chainLocked],
          ["received_duffs", transaction.receivedDuffs],
          ["spent_input_duffs", transaction.spentInputDuffs],
          ["fee_duffs", transaction.feeDuffs],
          ["block_hash", transaction.blockHash],
        ]),
      }),
    ),
  ];
  return [CSV_HEADER, ...records];
}

function platformRows(
  state: Extract<ViewerSingleExportState, { mode: "platform" }>,
  generatedAt: string,
): CsvValue[][] {
  const { snapshot, history } = state;
  const reconciliation = new PlatformProofIndexReconciliation(snapshot, history);
  const queryLabel = snapshot.address;
  const records = [
    csvRecord(state.mode, state.network, generatedAt, {
      queryLabel,
      resourceId: snapshot.address,
      resourceName: history.base58Address ?? snapshot.address,
      recordType: "address_summary",
      recordId: snapshot.address,
      source: "Dash Platform DAPI + Dash Platform Explorer",
      timestamp: timestamp(history.indexedTimeMs),
      status: reconciliation.status,
      type: "PLATFORM_ADDRESS",
      direction: "related",
      amountAtomic: snapshot.balanceCredits,
      amountUnit: "credits",
      blockHeight: snapshot.proofHeight,
      metadata: metadata([
        ["exists", snapshot.exists],
        ["legacy_alias", history.base58Address],
        ["outgoing_nonce", snapshot.nonce],
        ["dapi_proof_height", snapshot.proofHeight],
        ["core_chain_locked_height", snapshot.coreChainLockedHeight],
        ["protocol_version", snapshot.protocolVersion],
        ["explorer_balance_credits", history.explorerBalanceCredits],
        ["explorer_nonce", history.explorerNonce],
        ["platform_index_height", history.indexedHeight],
        ["total_incoming_credits", history.totalIncomingCredits],
        ["total_outgoing_credits", history.totalOutgoingCredits],
        ["transition_count", history.totalTransitions],
        ["incoming_transitions", history.incomingTransitions],
        ["outgoing_transitions", history.outgoingTransitions],
        ["history_limit", history.historyLimit],
        ["requests", history.requests + 1],
      ]),
    }),
    ...history.transitions.map((transition) =>
      csvRecord(state.mode, state.network, generatedAt, {
        queryLabel,
        resourceId: snapshot.address,
        resourceName: history.base58Address ?? snapshot.address,
        recordType: "transition",
        recordId: transition.hash,
        source: history.provider,
        timestamp: timestamp(transition.timestampMs),
        status: transition.status,
        type: transition.type,
        subtype: transition.batchType,
        direction: transition.incoming ? "incoming" : "outgoing",
        transactionHash: transition.hash,
        blockHeight: transition.blockHeight,
        metadata: metadata([
          ["error", transition.error],
          ["gas_used_credits", transition.gasUsed],
          ["block_hash", transition.blockHash],
        ]),
      }),
    ),
  ];
  return [CSV_HEADER, ...records];
}

function shieldedRows(
  state: Extract<ViewerSingleExportState, { mode: "shielded" }>,
  generatedAt: string,
): CsvValue[][] {
  const { snapshot } = state;
  const activity = new ShieldedActivityState(snapshot);
  const queryLabel = `${snapshot.keyKind} viewing key`;
  const records = [
    csvRecord(state.mode, state.network, generatedAt, {
      queryLabel,
      resourceId: "shielded-pool",
      resourceName: queryLabel,
      recordType: "scan_summary",
      recordId: "shielded-pool",
      source: "Dash Platform DAPI proof",
      status: snapshot.complete ? "complete" : "partial",
      type: "ORCHARD_SCAN",
      direction: "related",
      amountAtomic: activity.balance,
      amountUnit: "credits",
      blockHeight: snapshot.proofHeight,
      metadata: metadata([
        ["key_capability", snapshot.keyKind],
        ["protocol_version", snapshot.protocolVersion],
        ["pool_actions_scanned", snapshot.scannedNotes],
        ["external_received_credits", snapshot.receivedExternal],
        ["external_sent_credits", snapshot.sentExternal],
        ["self_change_credits", snapshot.selfOrChange],
      ]),
    }),
    ...snapshot.records.map((record) => {
      const note = record.incoming ?? record.outgoing;
      return csvRecord(state.mode, state.network, generatedAt, {
        queryLabel,
        resourceId: note?.address ?? "shielded-pool",
        resourceName: note?.address ?? "Recovered Orchard note",
        recordType: "note",
        recordId: record.position,
        source: "Local Orchard recovery",
        status: activity.noteSpendStatus(record),
        type: "ORCHARD_NOTE",
        direction: record.direction,
        amountAtomic: note?.value ?? null,
        amountUnit: "credits",
        blockHeight: snapshot.proofHeight,
        metadata: metadata([
          ["scan_complete", snapshot.complete],
          ["key_capability", snapshot.keyKind],
          ["pool_position", record.position],
          ["memo", note?.memo],
          ["spent_at_position", record.spentAtPosition],
          ["note_commitment", record.cmx],
          ["action_nullifier", record.actionNullifier],
          ["note_nullifier", note?.noteNullifier],
        ]),
      });
    }),
  ];
  return [CSV_HEADER, ...records];
}

function identityRows(
  state: Extract<ViewerSingleExportState, { mode: "identity" }>,
  generatedAt: string,
): CsvValue[][] {
  const proofHeights = [
    ...new Set(state.snapshot.proofs.map(({ height }) => height.toString())),
  ].join(" ");
  const queryLabel = state.snapshot.resolvedDpnsName ?? state.snapshot.inputLabel;
  const rows: CsvValue[][] = [
    csvRecord(state.mode, state.network, generatedAt, {
      queryLabel,
      resourceName: state.snapshot.resolvedDpnsName,
      recordType: "query",
      recordId: state.snapshot.inputKind,
      source: "Dash Platform DAPI proof",
      status: state.snapshot.identities.length === 0 ? "not_found" : "verified",
      type: state.snapshot.inputKind,
      metadata: metadata([
        ["input_label", state.snapshot.inputLabel],
        ["lookup_public_key_hash", state.snapshot.publicKeyHashHex],
        ["resolved_dpns_document_id", state.snapshot.resolvedDpnsDocumentId],
        [
          "resolved_registration_transaction_hash",
          state.snapshot.resolvedRegistrationTransactionHash,
        ],
        ["proof_heights", proofHeights],
        ["proof_response_count", state.snapshot.proofs.length],
        ["requests", state.snapshot.requests],
      ]),
    }),
  ];
  for (const identity of state.snapshot.identities) {
    rows.push(...new IdentityCsvRows(state, generatedAt, identity).rows());
  }
  return [CSV_HEADER, ...rows];
}

type IdentityExportState = Extract<ViewerSingleExportState, { mode: "identity" }>;
type ExportedIdentity = IdentityExportState["snapshot"]["identities"][number];
type IndexedIdentityHistory = NonNullable<IdentityExportState["histories"][number]["history"]>;

function identityCsvFacts(
  state: IdentityExportState,
  generatedAt: string,
  identity: ExportedIdentity,
) {
  const historyResult = state.histories.find(
    ({ identifier }) => identifier === identity.identifier,
  );
  return {
    state,
    generatedAt,
    identity,
    historyResult,
    history: historyResult?.history ?? null,
    coverage: new IdentityHistoryCoverage(historyResult),
    identityName: identity.dpnsNames[0] ?? identity.identifier,
    queryLabel: state.snapshot.resolvedDpnsName ?? state.snapshot.inputLabel,
  };
}

class IdentityCsvRows {
  readonly #facts: ReturnType<typeof identityCsvFacts>;
  constructor(state: IdentityExportState, generatedAt: string, identity: ExportedIdentity) {
    this.#facts = identityCsvFacts(state, generatedAt, identity);
  }

  rows(): CsvValue[][] {
    const rows = [...this.#summary(), ...this.#keys()];
    const history = this.#facts.history;
    if (history !== null) {
      rows.push(...this.#aliases(history));
      rows.push(...this.#activity(history));
      rows.push(...this.#documents(history));
      rows.push(...this.#dataContracts(history));
      rows.push(...this.#withdrawals(history));
      rows.push(...this.#tokens(history));
    }
    return rows;
  }

  #record(record: Omit<CsvRecord, "queryLabel" | "resourceId" | "resourceName">): CsvValue[] {
    const { state, generatedAt, queryLabel, identity, identityName } = this.#facts;
    return csvRecord(state.mode, state.network, generatedAt, {
      queryLabel,
      resourceId: identity.identifier,
      resourceName: identityName,
      ...record,
    });
  }

  #summary(): CsvValue[][] {
    const { identity, history, historyResult, coverage } = this.#facts;
    const rows: CsvValue[][] = [];
    rows.push(
      this.#record({
        recordType: "identity",
        recordId: identity.identifier,
        source:
          history === null
            ? "Dash Platform DAPI proof"
            : "Dash Platform DAPI proof + Dash Platform Explorer",
        timestamp: timestamp(history?.registeredAtMs ?? null),
        status:
          historyResult?.error === null || historyResult === undefined
            ? "verified"
            : "proof_verified_history_unavailable",
        type: history?.registrationType ?? "IDENTITY",
        subtype: history?.registrationFundingSource ?? null,
        direction: "related",
        amountAtomic: identity.balanceCredits,
        amountUnit: "credits",
        transactionHash: history?.registrationTransactionHash ?? null,
        blockHeight: history?.indexedHeight ?? null,
        metadata: metadata([
          ["identity_id_hex", identity.identifierHex],
          ["dapi_revision", identity.revision],
          ["dapi_nonce", identity.nonce],
          ["proof_verified_dpns_names", identity.dpnsNames],
          ["registered_at", timestamp(history?.registeredAtMs ?? null)],
          ["funding_core_transaction_hash", history?.fundingCoreTransactionHash],
          ["funding_core_transaction_output_index", history?.fundingCoreTransactionOutputIndex],
          ["funding_core_transaction_error", history?.fundingCoreTransactionError],
          ["system_identity", history?.systemIdentity],
          ["registered_key_count", identity.publicKeys.length],
          ["explorer_balance_credits", history?.explorerBalanceCredits],
          ["explorer_revision", history?.explorerRevision],
          ["explorer_nonce", history?.explorerNonce],
          ["total_transactions", history?.totalTransactions],
          ["total_transfers", history?.totalTransfers],
          ["total_documents", history?.totalDocuments],
          ["total_data_contracts", history?.totalDataContracts],
          ["total_gas_spent_credits", history?.totalGasSpentCredits],
          ["average_gas_spent_credits", history?.averageGasSpentCredits],
          ["explorer_reported_top_up_count", history?.totalTopUps],
          ["explorer_reported_top_up_credits", history?.totalTopUpsCredits],
          ["total_withdrawals", history?.totalWithdrawals],
          ["total_withdrawal_credits", history?.totalWithdrawalsCredits],
          ["last_withdrawal_hash", history?.lastWithdrawalHash],
          ["last_withdrawal_at", timestamp(history?.lastWithdrawalTimestampMs ?? null)],
          ["explorer_index_status", history?.indexStatus],
          ["explorer_indexed_at", timestamp(history?.indexedTimeMs ?? null)],
          ["history_limit", history?.historyLimit],
          ["history_requests", history?.requests],
          ["history_coverage", coverage.status],
          ["history_warnings", coverage.warnings ?? undefined],
          ["history_error", historyResult?.error],
        ]),
      }),
    );
    return rows;
  }

  #keys(): CsvValue[][] {
    const { identity } = this.#facts;
    const rows: CsvValue[][] = [];
    for (const key of identity.publicKeys) {
      rows.push(
        this.#record({
          recordType: "public_key",
          recordId: key.keyId,
          source: "Dash Platform DAPI proof",
          timestamp: timestamp(key.disabledAtMs),
          status: key.disabledAtMs === null ? "active" : "disabled",
          type: key.purpose,
          subtype: `${key.securityLevel}/${key.keyType}`,
          direction: "related",
          publicKeyHash: key.publicKeyHashHex,
          publicKey: key.dataHex,
          metadata: metadata([
            ["purpose_number", key.purposeNumber],
            ["security_level_number", key.securityLevelNumber],
            ["key_type_number", key.keyTypeNumber],
            ["read_only", key.readOnly],
            ["is_master", key.isMaster],
            ["matches_lookup", key.matchesLookup],
            [
              "contract_bounds",
              key.contractBounds === null ? null : JSON.stringify(key.contractBounds, exactJson),
            ],
          ]),
        }),
      );
    }
    return rows;
  }

  #aliases(history: IndexedIdentityHistory): CsvValue[][] {
    const rows: CsvValue[][] = [];
    for (const alias of history.aliases) {
      rows.push(
        this.#record({
          recordType: "alias",
          recordId: alias.documentId,
          source: history.provider,
          timestamp: timestamp(alias.timestampMs),
          status: alias.status,
          type: "DPNS_ALIAS",
          direction: "related",
          transactionHash: alias.transactionHash,
          metadata: metadata([
            ["name", alias.name],
            ["contested", alias.contested],
          ]),
        }),
      );
    }

    return rows;
  }

  #activity(history: IndexedIdentityHistory): CsvValue[][] {
    const rows: CsvValue[][] = [];
    for (const event of history.activity) {
      rows.push(
        this.#record({
          recordType: "activity",
          recordId: event.transactionHash,
          source: history.provider,
          timestamp: timestamp(event.timestampMs),
          status: event.status,
          type: event.type,
          subtype: event.batchType,
          direction: event.direction,
          amountAtomic: event.netAmountCredits,
          amountUnit: "credits",
          transactionHash: event.transactionHash,
          blockHeight: event.blockHeight,
          metadata: metadata([
            ["error", event.error],
            ["block_hash", event.blockHash],
            ["gas_used_credits", event.gasUsedCredits],
          ]),
        }),
      );
      event.transfers.forEach((transfer, index) => {
        rows.push(
          this.#record({
            recordType: "transfer",
            recordId: `${event.transactionHash}:${index}`,
            source: history.provider,
            timestamp: timestamp(event.timestampMs),
            status: event.status,
            type: "CREDIT_TRANSFER",
            direction: transfer.direction,
            amountAtomic: transfer.amountCredits,
            amountUnit: "credits",
            transactionHash: event.transactionHash,
            blockHeight: event.blockHeight,
            metadata: metadata([
              ["sender", transfer.sender],
              ["recipient", transfer.recipient],
            ]),
          }),
        );
      });
    }

    return rows;
  }

  #documents(history: IndexedIdentityHistory): CsvValue[][] {
    const rows: CsvValue[][] = [];
    for (const document of history.documents) {
      rows.push(
        this.#record({
          recordType: "document",
          recordId: document.identifier,
          source: history.provider,
          timestamp: timestamp(document.timestampMs),
          status: document.deleted ? "deleted" : "current",
          type: "DOCUMENT",
          subtype: document.documentTypeName,
          direction: "related",
          transactionHash: document.transactionHash,
          metadata: metadata([
            ["data_contract_id", document.dataContractIdentifier],
            ["revision", document.revision],
            ["system", document.system],
          ]),
        }),
      );
    }

    return rows;
  }

  #dataContracts(history: IndexedIdentityHistory): CsvValue[][] {
    const rows: CsvValue[][] = [];
    for (const contract of history.dataContracts) {
      rows.push(
        this.#record({
          recordType: "data_contract",
          recordId: contract.identifier,
          source: history.provider,
          timestamp: timestamp(contract.timestampMs),
          status: contract.system ? "system" : "user",
          type: "DATA_CONTRACT",
          subtype: contract.name,
          direction: "related",
          transactionHash: contract.transactionHash,
          metadata: metadata([
            ["version", contract.version],
            ["documents_count", contract.documentsCount],
            ["tokens_count", contract.tokensCount],
            ["description", contract.description],
            ["keywords", contract.keywords],
          ]),
        }),
      );
    }

    return rows;
  }

  #withdrawals(history: IndexedIdentityHistory): CsvValue[][] {
    const rows: CsvValue[][] = [];
    for (const withdrawal of history.withdrawals) {
      rows.push(
        this.#record({
          recordType: "withdrawal",
          recordId: withdrawal.documentId,
          source: history.provider,
          timestamp: timestamp(withdrawal.timestampMs),
          status: withdrawal.status,
          type: "IDENTITY_CREDIT_WITHDRAWAL",
          direction: "outgoing",
          amountAtomic: withdrawal.amountCredits,
          amountUnit: "credits",
          transactionHash: withdrawal.coreTransactionHash,
          metadata: metadata([["withdrawal_address", withdrawal.withdrawalAddress]]),
        }),
      );
    }

    return rows;
  }

  #tokens(history: IndexedIdentityHistory): CsvValue[][] {
    const rows: CsvValue[][] = [];
    for (const token of history.tokens) {
      rows.push(
        this.#record({
          recordType: "token",
          recordId: token.identifier,
          source: history.provider,
          timestamp: timestamp(token.timestampMs),
          type: "TOKEN",
          subtype: token.name,
          direction: "related",
          metadata: metadata([
            ["data_contract_id", token.dataContractIdentifier],
            ["position", token.position],
            ["description", token.description],
            ["supply_unit", "token atomic units"],
            ["total_supply", token.totalSupply],
            ["base_supply", token.baseSupply],
            ["max_supply", token.maxSupply],
            ["decimals", token.decimals],
            ["mintable", token.mintable],
            ["burnable", token.burnable],
            ["freezable", token.freezable],
            ["destroyable", token.destroyable],
          ]),
        }),
      );
    }
    return rows;
  }
}

/** Serializes public activity records and batch failures using one CSV field model. */
export class ViewerCsv {
  /** Returns a detached labelled row after checking its agreement with the field model. */
  static withQueryLabel(row: readonly CsvValue[], label: string): CsvValue[] {
    ViewerCsv.#requireRow(row);
    const column = CSV_HEADER.indexOf("query_label");
    if (column < 0) throw new ViewerExportRecordError();
    const labelled = [...row];
    labelled[column] = label;
    return labelled;
  }

  static #requireRow(value: unknown): void {
    // Keep the Array.isArray narrowing away from the caller's readonly CsvValue[] type.
    if (!Array.isArray(value) || value.length !== CSV_HEADER.length)
      throw new ViewerExportRecordError();
  }
  /** Returns the fixed header and records for a single public query. */
  static rows(state: ViewerSingleExportState, generatedAt: string): CsvValue[][] {
    return state.mode === "core"
      ? coreRows(state, generatedAt)
      : state.mode === "platform"
        ? platformRows(state, generatedAt)
        : state.mode === "identity"
          ? identityRows(state, generatedAt)
          : shieldedRows(state, generatedAt);
  }

  /** Returns spreadsheet-safe CSV, including explicit batch failures. */

  static text(state: ViewerExportState, generatedAt: string): string {
    const rows = isBatchExportState(state)
      ? [
          CSV_HEADER,
          ...state.items.flatMap((item) =>
            ViewerCsv.rows(item.state, generatedAt)
              .slice(1)
              .map((row) => ViewerCsv.withQueryLabel(row, item.label)),
          ),
          ...state.errors.map((sourceError) => {
            const error = exportError(sourceError, state.mode);
            return csvRecord(state.mode, state.network, generatedAt, {
              queryLabel: error.label,
              recordType: "error",
              recordId: error.id,
              status: "failed",
              metadata: metadata([["message", error.message]]),
            });
          }),
        ]
      : ViewerCsv.rows(state, generatedAt);
    return csv(rows);
  }
}

/** Refuses an inconsistent public table rather than silently emitting missing cells. */
export class ViewerExportRecordError extends Error {
  readonly code = "viewer.export.record";
  constructor() {
    super("Public export records do not match their column model.");
    this.name = "ViewerExportRecordError";
  }
}

/** Compatibility entry for the shared CSV/XLSX single-query projection. */
export function singleRows(state: ViewerSingleExportState, generatedAt: string): CsvValue[][] {
  return ViewerCsv.rows(state, generatedAt);
}

/** Compatibility entry for a complete public CSV export. */
export function createViewerCsvText(state: ViewerExportState, generatedAt: string): string {
  return ViewerCsv.text(state, generatedAt);
}

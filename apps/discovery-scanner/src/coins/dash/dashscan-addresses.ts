// The DashScan side of every Dash Core-chain section: P2PKH addresses derived locally, their
// balances asked in batches, the gap kept after each used one, the history of those shown, and the
// fields, totals and warnings of the section. The seed scan of BIP44 and of each extra path family
// and the watch-only xpub scan differ only in their paths and labels, so they share this one
// implementation instead of a copy each.
import type { HDKey } from "@scure/bip32";
import { requirePublic } from "@ckd/core/bip32.js";
import { bytesToHex, encodeP2pkh, hash160, wipe } from "@ckd/core/crypto.js";
import { isAbortError } from "@ckd/core/error-handling.js";
import { getDashNetwork } from "@ckd/core/networks.js";
import type { RecoveryNetworkGateway } from "../../network-gateway.js";
import type {
  RecoveryField,
  RecoveryFinding,
  RecoveryMetric,
  RecoveryNetwork,
  RecoverySectionId,
} from "../../types.js";
import { dashCoreHistory } from "./history.js";
import { AddressBook, type BatchOptions } from "../../address-book.js";
import {
  seenFields,
  formatDashFromDuffs,
  validateDashScanAddressBatch,
  validateDashScanAddressHistory,
  type DashScanAddressInfo,
  type DashScanHistorySummary,
} from "./util.js";

/** A locally derived Core-chain address; only `address` is sent to DashScan. */
export interface DashScanAddress {
  readonly address: string;
  readonly index: number;
  readonly path: string;
  readonly publicKeyHash: string;
}

/** An address of a batch that the section shows, with its optional history. */
export interface ShownDashScanAddress {
  readonly derived: DashScanAddress;
  readonly info: DashScanAddressInfo;
  readonly history?: DashScanHistorySummary;
}

/** What a batch shows besides funded addresses, and which shown addresses get a history. */
export interface DashScanBatchOptions extends BatchOptions {
  readonly history: (derived: DashScanAddress) => boolean;
}

export class DashScanAddresses {
  readonly book: AddressBook<DashScanAddressInfo>;
  readonly #gateway: RecoveryNetworkGateway;
  readonly #network: RecoveryNetwork;
  readonly #p2pkh: number;
  readonly #section: RecoverySectionId;
  readonly #signal: AbortSignal;
  #historyFailures = 0;

  constructor(
    gateway: RecoveryNetworkGateway,
    network: RecoveryNetwork,
    section: RecoverySectionId,
    signal: AbortSignal,
  ) {
    this.#gateway = gateway;
    this.#network = network;
    this.#p2pkh = getDashNetwork(network).p2pkh;
    this.#section = section;
    this.#signal = signal;
    this.book = new AddressBook({
      lookUp: (addresses) => this.#lookUp(addresses),
      balance: (info) => info.balance,
      used: (info) => info.txCount > 0 || info.balance > 0n,
    });
  }

  /** The P2PKH address of a derived child; the child's keys are wiped. */
  address(child: HDKey, index: number, path: string): DashScanAddress {
    const publicKey = requirePublic(child, path);
    const publicKeyHash = hash160(publicKey);
    try {
      return {
        address: encodeP2pkh(publicKeyHash, this.#p2pkh),
        index,
        path,
        publicKeyHash: bytesToHex(publicKeyHash),
      };
    } finally {
      wipe(publicKey, publicKeyHash);
      child.wipePrivateData();
    }
  }

  /**
   * Asks DashScan for the batch, extends `target` past each used address and returns the new
   * target with the addresses to show and the history of each that asks for one.
   */
  async batch(
    chunk: readonly DashScanAddress[],
    target: number,
    options: DashScanBatchOptions,
  ): Promise<{ target: number; shown: ShownDashScanAddress[] }> {
    const batch = await this.book.batch(chunk, target, options);
    // Funded addresses are always few and recovery-relevant, so each shown one gets its history;
    // used empty ones, which can number in the thousands after CoinJoin, only when asked.
    const shown = await Promise.all(
      batch.shown.map(async ({ derived, state: info }) => {
        const history = options.history(derived) ? await this.#history(derived.address) : undefined;
        return history === undefined ? { derived, info } : { derived, info, history };
      }),
    );
    return { target: batch.target, shown };
  }

  /** The finding of a shown address: the caller's own fields first, then the common ones. */
  finding(
    id: string,
    subtitle: string,
    { derived, info, history }: ShownDashScanAddress,
    leading: readonly RecoveryField[],
  ): RecoveryFinding {
    return {
      id,
      title: derived.address,
      subtitle,
      balanceAtomic: info.balance,
      balanceLabel: formatDashFromDuffs(info.balance),
      ...(history === undefined ? {} : { history: dashCoreHistory(history) }),
      fields: [
        ...leading,
        { label: "Transactions reported", value: String(history?.txCount ?? info.txCount) },
        ...(history === undefined ? [] : lifetimeFields(history)),
        { label: "Public-key hash", value: derived.publicKeyHash, copyable: true },
      ],
    };
  }

  /** The section's balance and address counts, followed by its own count of what it checked. */
  metrics(checked: RecoveryMetric): RecoveryMetric[] {
    return [...this.book.metrics(formatDashFromDuffs), checked];
  }

  /** What the section must say about a cut gap and missing histories. */
  warnings(): string[] {
    const failures = this.#historyFailures;
    const gap = this.book.gap.warning;
    return [
      ...(gap === undefined ? [] : [gap]),
      ...(failures > 0
        ? [
            `${failures} optional historical address summar${failures === 1 ? "y" : "ies"} could not be loaded; balance and transaction-count discovery remains complete.`,
          ]
        : []),
    ];
  }

  async #lookUp(addresses: readonly string[]): Promise<DashScanAddressInfo[]> {
    const value = await this.#gateway.runPublic(
      { network: this.#network, addresses },
      `${this.#section}.address-info`,
      () => this.#gateway.networkApi.coreAddressInfo(this.#network, [...addresses], this.#signal),
      this.#signal,
    );
    return validateDashScanAddressBatch(value, addresses);
  }

  async #history(address: string): Promise<DashScanHistorySummary | undefined> {
    try {
      const value = await this.#gateway.runPublic(
        { network: this.#network, address },
        `${this.#section}.address-history`,
        () => this.#gateway.networkApi.coreAddressHistory(this.#network, address, this.#signal),
        this.#signal,
      );
      return validateDashScanAddressHistory(value, address);
    } catch (cause) {
      if (isAbortError(cause)) throw cause;
      this.#historyFailures += 1;
      return undefined;
    }
  }
}

function lifetimeFields(history: DashScanHistorySummary): RecoveryField[] {
  return [
    { label: "Lifetime received", value: formatDashFromDuffs(history.received) },
    { label: "Lifetime sent", value: formatDashFromDuffs(history.sent) },
    ...seenFields(history),
  ];
}

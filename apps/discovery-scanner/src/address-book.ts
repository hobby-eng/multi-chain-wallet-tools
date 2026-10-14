// The addresses one scan section has asked a provider about, whatever the coin: each address asked
// once and counted once, the target of its branch extended past each used one, and the addresses
// the section shows picked by one rule. The findings of the section, one per address, live next to
// it: an address that a second path reaches again gains that path instead of a second finding.
import { AddressGapTracker } from "./address-gap.js";
import type {
  RecoveryFinding,
  RecoveryMetric,
  RecoveryScanContext,
  RecoverySectionId,
} from "./types.js";
import { fundedMetric, locatedValueMetric } from "./wallet-result.js";

/** The coin's side of an address book. */
export interface AddressSource<State> {
  /** The states of `addresses`, in their order; called once per batch with only new addresses. */
  lookUp(addresses: readonly string[]): Promise<readonly State[]>;
  balance(state: State): bigint;
  /** Whether the address was ever used: funds, transactions or a nonce. */
  used(state: State): boolean;
  /** The key that tells two addresses apart; Ethereum's ignores letter case. */
  key?(address: string): string;
}

/** A derived address of a batch. */
export interface BatchAddress {
  readonly address: string;
  readonly index: number;
}

/** What a batch shows besides funded addresses, and how far its target may grow. */
export interface BatchOptions {
  readonly includeUsedZeroBalance: boolean;
  /** The largest target, when the profile has a smaller one than the BIP32 index space. */
  readonly maximum?: number;
}

export class AddressBook<State> {
  readonly gap = new AddressGapTracker();
  readonly #source: AddressSource<State>;
  readonly #states = new Map<string, State>();
  #balance = 0n;
  #used = 0;
  #funded = 0;

  constructor(source: AddressSource<State>) {
    this.#source = source;
  }

  /**
   * Asks for the addresses of `chunk` not asked yet, extends `target` past each used one and
   * returns the new target with the addresses to show: the funded ones, and the used empty ones
   * when asked.
   */
  async batch<Address extends BatchAddress>(
    chunk: readonly Address[],
    target: number,
    options: BatchOptions,
  ): Promise<{ target: number; shown: Array<{ derived: Address; state: State }> }> {
    const states = await this.states(chunk.map(({ address }) => address));
    const shown: Array<{ derived: Address; state: State }> = [];
    for (const [position, derived] of chunk.entries()) {
      const state = states[position]!;
      const used = this.#source.used(state);
      if (used) {
        target = this.gap.extend(target, derived.index, options.maximum);
      }
      if (this.#source.balance(state) > 0n || (used && options.includeUsedZeroBalance))
        shown.push({ derived, state });
    }
    return { target, shown };
  }

  /** The lookUp of a branch scan through this book, with `options` for every batch. */
  lookUpWith(options: BatchOptions) {
    return <Address extends BatchAddress>(chunk: readonly Address[], target: number) =>
      this.batch(chunk, target, options);
  }

  /** The states of `addresses`, in their order; only those not asked yet are asked. */
  async states(addresses: readonly string[]): Promise<State[]> {
    await this.#lookUp(addresses);
    return addresses.map((address) => {
      const state = this.#states.get(this.#key(address));
      if (state === undefined) throw new Error("The provider's batch omitted a requested address.");
      return state;
    });
  }

  /** The sum of the balances of every address asked. */
  get balance(): bigint {
    return this.#balance;
  }

  get funded(): number {
    return this.#funded;
  }

  get used(): number {
    return this.#used;
  }

  /** How many distinct addresses were asked. */
  get queried(): number {
    return this.#states.size;
  }

  /** The balance and address counts a section opens its metrics with. */
  metrics(format: (amount: bigint) => string): RecoveryMetric[] {
    return [
      {
        label: "Spendable balance",
        value: format(this.#balance),
        tone: this.#balance > 0n ? "positive" : "neutral",
      },
      { label: "Funded addresses", value: String(this.#funded) },
      { label: "Previously used · empty", value: String(this.#used - this.#funded) },
    ];
  }

  /** The value located and the funded addresses that a wallet result opens its overview with. */
  overview(format: (amount: bigint) => string, fundedLabel = "Funded addresses"): RecoveryMetric[] {
    return [locatedValueMetric(this.#balance, format), fundedMetric(this.#funded, fundedLabel)];
  }

  #key(address: string): string {
    return this.#source.key?.(address) ?? address;
  }

  async #lookUp(addresses: readonly string[]): Promise<void> {
    const missing = [...new Set(addresses)].filter(
      (address) => !this.#states.has(this.#key(address)),
    );
    if (missing.length === 0) return;
    const states = await this.#source.lookUp(missing);
    if (states.length !== missing.length)
      throw new Error("The provider's batch did not keep the requested result count.");
    states.forEach((state, position) => {
      this.#states.set(this.#key(missing[position]!), state);
      const balance = this.#source.balance(state);
      this.#balance += balance;
      if (this.#source.used(state)) this.#used += 1;
      if (balance > 0n) this.#funded += 1;
    });
  }
}

/** The findings of one section, one per address. */
export class AddressFindings {
  readonly list: RecoveryFinding[] = [];
  readonly #byKey = new Map<string, RecoveryFinding>();
  readonly #onFinding: (finding: RecoveryFinding) => void;

  constructor(onFinding: (finding: RecoveryFinding) => void) {
    this.#onFinding = onFinding;
  }

  /** The findings of `section` of the wallet `inputId`, each reported to the scan as it is shown. */
  static reportedTo(
    context: Pick<RecoveryScanContext, "onFinding">,
    inputId: string,
    section: RecoverySectionId,
  ): AddressFindings {
    return new AddressFindings((finding) => context.onFinding(inputId, section, finding));
  }

  has(key: string): boolean {
    return this.#byKey.has(key);
  }

  /**
   * Shows `finding()` for an address seen first; an address shown already gains `path` as an
   * alternate derivation path instead.
   */
  show(key: string, path: string, finding: () => RecoveryFinding): void {
    const existing = this.#byKey.get(key);
    if (existing !== undefined) {
      if (!existing.fields.some(({ value }) => value === path))
        existing.fields.push({ label: "Alternate derivation path", value: path, copyable: true });
      return;
    }
    const shown = finding();
    this.#byKey.set(key, shown);
    this.list.push(shown);
    this.#onFinding(shown);
  }
}

/** One branch of a scan: how it starts, how its addresses are made, asked about and shown. */
export interface BranchScan<Address, Shown> {
  /** The addresses scanned at least, before any used one pushes the target on. */
  readonly initial: number;
  /** Addresses per provider request. */
  readonly batchSize: number;
  readonly signal: AbortSignal;
  /** The message of the cancellation, which names the scan. */
  readonly cancelled: string;
  derive(index: number): Address;
  lookUp(chunk: Address[], target: number): Promise<{ target: number; shown: readonly Shown[] }>;
  show(shown: Shown): void;
  /** Called after each batch with the addresses checked and the target now. */
  progress(checked: number, target: number): void;
}

/**
 * Scans one branch from index 0 in batches until its target, which every used address pushes on
 * by the gap; returns how many addresses were checked.
 */
export async function scanBranch<Address, Shown>(
  scan: BranchScan<Address, Shown>,
): Promise<number> {
  let target = scan.initial;
  let offset = 0;
  while (offset < target) {
    if (scan.signal.aborted) throw new DOMException(scan.cancelled, "AbortError");
    const from = offset;
    const end = Math.min(from + scan.batchSize, target);
    const chunk = Array.from({ length: end - from }, (_, relative) => scan.derive(from + relative));
    const batch = await scan.lookUp(chunk, target);
    target = batch.target;
    for (const shown of batch.shown) scan.show(shown);
    offset = end;
    scan.progress(offset, target);
  }
  return offset;
}

/**
 * Scans `branches` one after another; `scanOf` describes each, knowing how many addresses the
 * branches before it checked. Returns how many addresses all of them checked.
 */
export async function scanBranches<Branch, Address, Shown>(
  branches: Iterable<Branch>,
  scanOf: (branch: Branch, checkedBefore: number) => BranchScan<Address, Shown>,
): Promise<number> {
  let checked = 0;
  for (const branch of branches) checked += await scanBranch(scanOf(branch, checked));
  return checked;
}

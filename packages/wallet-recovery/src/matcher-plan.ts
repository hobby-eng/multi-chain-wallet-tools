import { Tsv } from "@ckd/export/tsv.js";
import { MAX_BIP32_INDEX } from "@ckd/core/bip32-limits.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import { textLines } from "@ckd/core/text-lines.js";
import {
  resolveCoinProtocol,
  type CoinAdapter,
  type CoinRegistry,
} from "@ckd/coins/registry-base.js";
import type { CoinDerivationInput } from "@ckd/coins/registry.js";
import type { DerivationResult, NetworkName } from "@ckd/core/types.js";
import { MnemonicEntries } from "@ckd/core/mnemonic-entries.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import { defined } from "@ckd/core/defined.js";
import { MatcherScope } from "./matcher-scope.js";
import { MatcherSecrets } from "./matcher-secrets.js";
import { LocalSearchAdmission } from "./local-search-admission.js";
import {
  matchedTargetField,
  rowFields,
  type AddressSearchRequest,
  type AddressSearchResult,
} from "./address-search.js";
import type { WalletMatcherTarget, WalletMatcherTargetDetector } from "./matcher-types.js";

const MAX_ACCOUNTS = 21;
const ERRORS = new ErrorCatalog("wallet.matcher-plan", {
  empty: () => "Enter at least one BIP39 seed phrase, one phrase per line.",
  passphrase: () => "A passphrase line has no matching seed phrase line.",
  accounts: () => `Scan at most ${MAX_ACCOUNTS} accounts in one Wallet Matcher run.`,
  index: (label: string) => `${label} must be a whole BIP32 index.`,
  network: () => "Choose a supported Matcher network.",
  wiped: () => "This Matcher input owner has been released.",
  reproduce: () => "Could not reproduce the matched path. Run Wallet Matcher again.",
  changed: () =>
    "Recovery inputs or search settings changed. Run Wallet Matcher again before reveal.",
  private: () => "No private key field is available for the matched path.",
});

/** Public identity of a match; never contains seed bytes or private key fields. */
export interface MatcherFinding {
  readonly seedNumber: number;
  readonly addressNumber: number;
  readonly address: string;
  readonly normalizedAddress: string;
  readonly fieldKeys?: readonly string[];
  readonly adapterId: string;
  readonly adapter: string;
  readonly account: number;
  readonly branch: number;
  readonly index: number;
  readonly path: string;
}

/** A browser worker or test adapter executes the same narrow search/derive operations. */
export interface MatcherWorker {
  searchMany(
    adapterId: string,
    input: Omit<CoinDerivationInput, "start" | "count">,
    requests: readonly AddressSearchRequest[],
    start: number,
    count: number,
  ): Promise<AddressSearchResult[]>;
  derive(adapterId: string, input: CoinDerivationInput): Promise<DerivationResult>;
}

/** Raw field snapshot; public selectors/ranges are admitted before any seed is generated. */
export interface MatcherPlanInput {
  readonly source:
    | { readonly kind: "lists"; readonly phrases: string; readonly passphrases: string }
    | { readonly kind: "linked"; readonly mnemonic: string; readonly passphrase: string };
  readonly targets: string;
  readonly network: string;
  readonly coin: string;
  readonly allCoins: boolean;
  readonly change: boolean;
  readonly accountStart: number;
  readonly accountEnd: number;
  readonly indexStart: number;
  readonly indexCount: number;
}

/** Host services, including the build-specific registry and deterministic BIP39 seed implementation. */
export interface MatcherServices {
  readonly registry: CoinRegistry;
  readonly detectTargets: WalletMatcherTargetDetector;
  readonly mnemonicToSeed: (mnemonic: string, passphrase: string) => Uint8Array;
}

/** A stopped search cannot be mistaken for a complete no-match result. */
export type MatcherSearchOutcome =
  | { readonly kind: "stopped" }
  | { readonly kind: "complete"; readonly findings: readonly MatcherFinding[] };

interface SearchJob {
  readonly seedIndex: number;
  readonly adapter: CoinAdapter;
  readonly targets: WalletMatcherTarget[];
  readonly account: number;
  readonly branch: number;
}

/** Admits one Matcher request and owns its seed bytes until its search/reveal operation settles. */
export class WalletMatcherPlan implements Disposable {
  readonly #registry: CoinRegistry;
  readonly #network: NetworkName;
  readonly #targets: WalletMatcherTarget[];
  readonly #seeds: Uint8Array[] = [];
  readonly #jobs: SearchJob[];
  readonly #start: number;
  readonly #count: number;
  #wiped = false;

  /** Input strings are consumed synchronously; only seed bytes remain after construction. */
  constructor(input: MatcherPlanInput, services: MatcherServices) {
    this.#registry = services.registry;
    if (input.network !== "mainnet" && input.network !== "testnet")
      throw ERRORS.create("network", []);
    this.#network = input.network;
    for (const [label, value] of [
      ["Account start", input.accountStart],
      ["Account finish", input.accountEnd],
    ] as const)
      if (!Number.isSafeInteger(value) || value < 0 || value > MAX_BIP32_INDEX)
        throw ERRORS.create("index", [label]);
    if (
      input.accountEnd < input.accountStart ||
      input.accountEnd - input.accountStart >= MAX_ACCOUNTS
    )
      throw ERRORS.create("accounts", []);
    LocalSearchAdmission.range(input.indexStart, input.indexCount);
    this.#start = input.indexStart;
    this.#count = input.indexCount;
    this.#targets = MatcherScope.targets(
      input.targets,
      this.#network,
      services.detectTargets,
      services.registry,
      input.coin,
      input.allCoins,
    );
    const mnemonics =
      input.source.kind === "linked"
        ? [input.source.mnemonic]
        : MnemonicEntries.parse(input.source.phrases);
    if (mnemonics.length === 0) throw ERRORS.create("empty", []);
    const passphrases =
      input.source.kind === "linked"
        ? [input.source.passphrase]
        : textLines(input.source.passphrases);
    if (passphrases.slice(mnemonics.length).some((value) => value.length > 0))
      throw ERRORS.create("passphrase", []);
    try {
      for (const [index, phrase] of mnemonics.entries())
        this.#seeds.push(services.mnemonicToSeed(phrase, passphrases[index] ?? ""));
      this.#jobs = this.#planJobs(input);
    } catch (cause) {
      this.wipe();
      throw cause;
    }
  }

  #adapter(id: string): CoinAdapter {
    return resolveCoinProtocol(this.#registry, id) ?? this.#registry.getCoinAdapter(id);
  }

  #planJobs(input: MatcherPlanInput): SearchJob[] {
    const targets = new Map<string, WalletMatcherTarget[]>();
    for (const target of this.#targets)
      for (const id of target.adapterIds) {
        const group = targets.get(id) ?? [];
        group.push(target);
        targets.set(id, group);
      }
    return this.#seeds.flatMap((_, seedIndex) =>
      [...targets].flatMap(([id, compatible]) => {
        const adapter = this.#adapter(id);
        const accounts =
          adapter.accountControl === false
            ? [adapter.defaults.account]
            : Array.from(
                { length: input.accountEnd - input.accountStart + 1 },
                (_, offset) => input.accountStart + offset,
              );
        return accounts.flatMap((account) =>
          MatcherScope.branches(adapter, input.change, input.allCoins).map((branch) => ({
            seedIndex,
            adapter,
            targets: compatible,
            account,
            branch,
          })),
        );
      }),
    );
  }

  /** Searches public targets; cancellation is explicit and publishes no later progress. */
  async search(
    worker: MatcherWorker,
    current: () => boolean,
    progress: (completed: number, total: number) => void,
  ): Promise<MatcherSearchOutcome> {
    const findings: MatcherFinding[] = [];
    for (const [place, job] of this.#jobs.entries()) {
      this.#assertLive();
      if (!current()) return { kind: "stopped" };
      const results = await worker.searchMany(
        job.adapter.id,
        {
          seed: defined(this.#seeds[job.seedIndex]),
          network: this.#network,
          account: job.account,
          branch: job.branch,
        },
        job.targets.map((target) => ({
          id: target.id,
          address: target.normalized,
          ...(target.fieldKeys === undefined ? {} : { fieldKeys: target.fieldKeys }),
        })),
        this.#start,
        this.#count,
      );
      this.#assertLive();
      if (!current()) return { kind: "stopped" };
      for (const result of results) {
        const target = defined(this.#targets.find(({ id }) => id === result.id));
        findings.push({
          seedNumber: job.seedIndex + 1,
          addressNumber: Number(target.id.slice("address-".length)),
          address: target.input,
          normalizedAddress: target.normalized,
          ...(target.fieldKeys === undefined ? {} : { fieldKeys: target.fieldKeys }),
          adapterId: job.adapter.id,
          adapter: job.adapter.label,
          account: job.account,
          branch: job.branch,
          index: result.index,
          path: result.path,
        });
      }
      progress(place + 1, this.#jobs.length);
    }
    this.#assertLive();
    if (!current()) return { kind: "stopped" };
    return { kind: "complete", findings };
  }

  /** Rechecks matches and returns a separate byte owner; every transient derived row is retired. */
  async privateValues(
    findings: readonly MatcherFinding[],
    worker: MatcherWorker,
    current: () => boolean,
  ): Promise<MatcherSecrets | undefined> {
    const secrets = new MatcherSecrets();
    let transferred = false;
    try {
      for (const finding of findings) {
        this.#assertLive();
        if (!current()) return undefined;
        const derived = await worker.derive(finding.adapterId, {
          seed: defined(this.#seeds[finding.seedNumber - 1]),
          network: this.#network,
          account: finding.account,
          branch: finding.branch,
          start: finding.index,
          count: 1,
        });
        try {
          this.#assertLive();
          if (!current()) return undefined;
          const row = derived.rows.find(({ index }) => index === finding.index);
          if (row === undefined) throw ERRORS.create("reproduce", []);
          const fields = rowFields(row);
          if (
            matchedTargetField(this.#adapter(finding.adapterId), fields, {
              address: finding.normalizedAddress,
              ...(finding.fieldKeys === undefined ? {} : { fieldKeys: finding.fieldKeys }),
            }) === undefined
          )
            throw ERRORS.create("changed", []);
          const privateFields = [
            ...new Map(
              fields.filter(({ secret }) => secret).map((field) => [field.key, field]),
            ).values(),
          ];
          if (privateFields.length === 0) throw ERRORS.create("private", []);
          secrets.add(WalletMatcherPlan.row(finding), privateFields);
        } finally {
          clearDerivationResult(derived);
        }
      }
      if (!current()) return undefined;
      transferred = true;
      return secrets;
    } finally {
      if (!transferred) secrets.wipe();
    }
  }

  /** One row identity shared by private/public exports. */
  static row(finding: MatcherFinding): string[] {
    return [String(finding.seedNumber), finding.address, finding.adapter, finding.path];
  }

  /** Public TSV contains no generated private fields. */
  static publicTsv(findings: readonly MatcherFinding[]): string {
    return Tsv.table([MatcherSecrets.COLUMNS, ...findings.map((finding) => this.row(finding))]);
  }

  #assertLive(): void {
    if (this.#wiped) throw ERRORS.create("wiped", []);
  }
  /** Wipes seed storage once the operation has settled; borrowed worker ports never own it. */
  wipe(): void {
    this.#wiped = true;
    for (const seed of this.#seeds) seed.fill(0);
    this.#seeds.length = 0;
  }
  /** Releases the operation's input storage. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}

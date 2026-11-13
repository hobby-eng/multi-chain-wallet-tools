import { Tsv } from "@ckd/export/tsv.js";
import { MAX_BIP32_INDEX } from "@ckd/core/bip32-limits.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import { textLines } from "@ckd/core/text-lines.js";
import {
  resolveCoinProtocol,
  type CoinAdapter,
  type CoinRegistry,
  type PhraseSeedReaders,
  type SeedSource,
} from "@ckd/coins/registry-base.js";
import type { CoinDerivationInput } from "@ckd/coins/registry.js";
import type { DerivationResult, NetworkName } from "@ckd/core/types.js";
import { MnemonicEntries } from "@ckd/core/mnemonic-entries.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import { defined } from "@ckd/core/defined.js";
import { SecretValue } from "@ckd/core/secret-value.js";
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
  seed: (label: string) => `This build cannot read the seed that ${label} derives from.`,
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

/**
 * Raw field snapshot. Its network, ranges, targets and lists are admitted before any seed is
 * generated; a phrase's checksum is checked only when its seeds are made, by the seed readers.
 */
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
  /**
   * The readers of the seeds that some variants derive from instead of BIP39's (CoinAdapter
   * seedSource), such as Cardano's CIP-3 roots; composed only in builds with those variants.
   */
  readonly phraseSeedReaders?: PhraseSeedReaders;
}

/** The key of BIP39's seed among a phrase's seeds; the others are keyed by their SeedSource. */
const BIP39_SEED = "bip39";
type SeedKey = SeedSource | typeof BIP39_SEED;
type SeedReader = (phrase: string, passphrase: string) => Uint8Array;

/**
 * Where a search is: first the phrases whose seeds are made ("seeds"), then the wallet structures
 * searched ("search"), each as `completed` of `total`.
 */
export interface MatcherProgress {
  readonly stage: "seeds" | "search";
  readonly completed: number;
  readonly total: number;
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

/**
 * Admits one Matcher request and owns its phrases and seed bytes until its search/reveal operation
 * settles. Seeds are made when they are needed, never at admission: a search makes every phrase's,
 * one phrase per turn of the host's event loop, and a reveal only its findings'.
 */
export class WalletMatcherPlan implements Disposable {
  readonly #registry: CoinRegistry;
  readonly #network: NetworkName;
  readonly #targets: WalletMatcherTarget[];
  /** The readers of the seeds that the searched variants derive from, by seed key. */
  readonly #readers: Map<SeedKey, SeedReader>;
  /**
   * Each phrase and its passphrase as wipeable code units, kept because seeds are made later, in
   * turns (a CIP-3 root alone is a 4096-round PBKDF2), and wiped once every seed of it is made.
   */
  readonly #phrases: SecretValue<readonly string[]>[];
  /** Each phrase's seeds made so far, by phrase index, one for each kind of #readers. */
  readonly #seeds = new Map<number, Map<SeedKey, Uint8Array>>();
  readonly #jobs: SearchJob[];
  readonly #start: number;
  readonly #count: number;
  #wiped = false;

  /**
   * Admits the fields synchronously and makes no seed, so a phrase with a bad checksum is refused
   * later, when search() or a reveal makes its seeds; the phrases are kept as wipeable code units
   * and their strings go out of scope.
   */
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
    this.#readers = this.#seedReaders(services);
    this.#jobs = this.#planJobs(input, mnemonics.length);
    this.#phrases = mnemonics.map((phrase, index) =>
      SecretValue.utf16Texts([phrase, passphrases[index] ?? ""]),
    );
  }

  #adapter(id: string): CoinAdapter {
    return resolveCoinProtocol(this.#registry, id) ?? this.#registry.getCoinAdapter(id);
  }

  /**
   * The seed readers that the targets' variants need, by seed key: BIP39's seed for a variant
   * without a seedSource, else the reader of its own (a CIP-3 root for Cardano's Icarus variants).
   * Refuses a variant whose seed this build cannot read, before any seed is made.
   */
  #seedReaders(services: MatcherServices): Map<SeedKey, SeedReader> {
    const readers = new Map<SeedKey, SeedReader>();
    for (const id of new Set(this.#targets.flatMap(({ adapterIds }) => adapterIds))) {
      const adapter = this.#adapter(id);
      const source = adapter.seedSource;
      const read =
        source === undefined
          ? services.mnemonicToSeed
          : source === "ton-phrase"
            ? undefined
            : services.phraseSeedReaders?.[source];
      if (read === undefined) throw ERRORS.create("seed", [adapter.label]);
      readers.set(source ?? BIP39_SEED, read);
    }
    return readers;
  }

  /**
   * The seeds of phrase `seedIndex` of the kinds `keys`, made the first time they are asked for;
   * the phrase is wiped once all its kinds are made. A phrase the plan does not hold means that
   * the findings asked for came from other inputs.
   */
  #seedsOf(seedIndex: number, keys: Iterable<SeedKey>): Map<SeedKey, Uint8Array> {
    const phrase = this.#phrases[seedIndex];
    if (phrase === undefined) throw ERRORS.create("changed", []);
    const seeds = this.#seeds.get(seedIndex) ?? new Map<SeedKey, Uint8Array>();
    this.#seeds.set(seedIndex, seeds);
    const missing = [...keys].filter((key) => !seeds.has(key));
    if (missing.length === 0) return seeds;
    const [mnemonic = "", passphrase = ""] = phrase.value;
    for (const key of missing)
      seeds.set(key, defined(this.#readers.get(key))(mnemonic, passphrase));
    if (seeds.size === this.#readers.size) phrase.wipe();
    return seeds;
  }

  /** The seed that `adapter` derives from, of phrase `seedIndex`: never another kind's. */
  #seedOf(seedIndex: number, adapter: CoinAdapter): Uint8Array {
    const key = adapter.seedSource ?? BIP39_SEED;
    return defined(this.#seedsOf(seedIndex, [key]).get(key));
  }

  #planJobs(input: MatcherPlanInput, phrases: number): SearchJob[] {
    const targets = new Map<string, WalletMatcherTarget[]>();
    for (const target of this.#targets)
      for (const id of target.adapterIds) {
        const group = targets.get(id) ?? [];
        group.push(target);
        targets.set(id, group);
      }
    return Array.from({ length: phrases }, (_, seedIndex) => seedIndex).flatMap((seedIndex) =>
      [...targets].flatMap(([id, compatible]) => {
        const adapter = this.#adapter(id);
        const accounts =
          adapter.accountControl === false
            ? [adapter.defaults.account]
            : Array.from(
                { length: input.accountEnd - input.accountStart + 1 },
                (_, offset) => input.accountStart + offset,
              );
        const branches = MatcherScope.targetBranches(
          adapter,
          compatible,
          input.change,
          input.allCoins,
        );
        return accounts.flatMap((account) =>
          [...branches].map(([branch, targets]) => ({
            seedIndex,
            adapter,
            targets: [...targets],
            account,
            branch,
          })),
        );
      }),
    );
  }

  /**
   * Makes every phrase's seeds, then searches public targets. Seeds are made one phrase per
   * `yieldTurn`, with progress before the first, so that the host stays responsive and can stop the
   * search while they are made; cancellation is explicit and publishes no later progress.
   */
  async search(
    worker: MatcherWorker,
    current: () => boolean,
    progress: (progress: MatcherProgress) => void,
    yieldTurn: () => Promise<void>,
  ): Promise<MatcherSearchOutcome> {
    const phrases = this.#phrases.length;
    progress({ stage: "seeds", completed: 0, total: phrases });
    for (let seedIndex = 0; seedIndex < phrases; seedIndex += 1) {
      await yieldTurn();
      this.#assertLive();
      if (!current()) return { kind: "stopped" };
      this.#seedsOf(seedIndex, this.#readers.keys());
      progress({ stage: "seeds", completed: seedIndex + 1, total: phrases });
    }
    const findings: MatcherFinding[] = [];
    for (const [place, job] of this.#jobs.entries()) {
      this.#assertLive();
      if (!current()) return { kind: "stopped" };
      const results = await worker.searchMany(
        job.adapter.id,
        {
          seed: this.#seedOf(job.seedIndex, job.adapter),
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
      progress({ stage: "search", completed: place + 1, total: this.#jobs.length });
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
          seed: this.#seedOf(finding.seedNumber - 1, this.#adapter(finding.adapterId)),
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
  /** Wipes phrases and seeds once the operation has settled; borrowed worker ports own none. */
  wipe(): void {
    this.#wiped = true;
    for (const phrase of this.#phrases) phrase.wipe();
    for (const seeds of this.#seeds.values()) for (const seed of seeds.values()) seed.fill(0);
    this.#seeds.clear();
  }
  /** Releases the operation's input storage. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}

import type { CoinAdapter } from "@ckd/coins/registry.js";
import type { DerivationResult } from "@ckd/core/types.js";
import type { DerivationParameters } from "@ckd/coins/derivation-request.js";
import { EmbeddedDerivation } from "@ckd/coins/embedded-derivation.js";
import { DerivationBranches, type ResultBranch } from "@ckd/coins/derivation-branches.js";
import { DerivationStream } from "@ckd/coins/derivation-stream.js";
import { BrowserTurn } from "@ckd/ui/browser-turn.js";
import { DerivationCancelledError, type DerivationWorkerClient } from "../workers/derive-client.js";
import type { Bip85ChildWalletOptions } from "./bip85-child-wallet-types.js";

type ChildSource = Pick<Bip85ChildWalletOptions, "mnemonic" | "mnemonicToSeed" | "createWorker">;
interface ChildRun {
  worker?: DerivationWorkerClient;
  seed?: Uint8Array;
}

/** Owns a child operation's seed and native worker; Clear retires both before promise reactions run. */
export class Bip85ChildDerivation implements Disposable {
  readonly #source: ChildSource;
  readonly #passphrase: () => string;
  readonly #cleanupFailed: () => void;
  #active: ChildRun | undefined;
  #revision = 0;

  constructor(source: ChildSource, passphrase: () => string, cleanupFailed: () => void) {
    this.#source = source;
    this.#passphrase = passphrase;
    this.#cleanupFailed = cleanupFailed;
  }

  /** True only while this owner still accepts a result from its current worker. */
  get running(): boolean {
    return this.#active !== undefined;
  }

  /** Transfer complete admitted branches to the caller; revocation returns no result. */
  async derive(
    adapter: CoinAdapter,
    input: DerivationParameters,
  ): Promise<Map<ResultBranch, DerivationResult> | undefined> {
    EmbeddedDerivation.admit(input.count);
    this.wipe();
    const revision = this.#revision;
    const run: ChildRun = {};
    this.#active = run;
    let results: Map<ResultBranch, DerivationResult> | undefined;
    try {
      const worker = this.#source.createWorker();
      run.worker = worker;
      const seed = this.#seed();
      if (seed === undefined) return undefined;
      run.seed = seed;
      const branches = new DerivationBranches(
        adapter,
        input.branch,
        input.includeChange,
        input.includeCoinJoin,
      ).plans;
      results = await new DerivationStream({ worker, adapter, input, branches }).all(seed, {
        isStale: () => this.#active !== run,
        yieldTurn: () => BrowserTurn.yield(),
      });
    } catch (cause) {
      if (this.#active !== run) return undefined;
      throw cause;
    } finally {
      this.#retire(run);
    }
    if (revision !== this.#revision && results !== undefined) {
      DerivationStream.discard(results);
      return undefined;
    }
    return results;
  }

  #seed(): Uint8Array | undefined {
    const phrase = this.#source.mnemonic();
    // This synchronous view leaves scope before the worker wait; only the mutable seed is retained.
    return phrase === null ? undefined : this.#source.mnemonicToSeed(phrase, this.#passphrase());
  }

  #retire(run: ChildRun): void {
    if (this.#active === run) this.#active = undefined;
    run.seed?.fill(0);
    delete run.seed;
    const worker = run.worker;
    delete run.worker;
    try {
      worker?.terminate(new DerivationCancelledError("Child-wallet worker released."));
    } catch {
      this.#cleanupFailed();
    }
  }

  /** Revoke publication and wipe mutable seed bytes synchronously, before fallible native teardown. */
  wipe(): void {
    this.#revision += 1;
    const active = this.#active;
    if (active !== undefined) this.#retire(active);
  }

  [Symbol.dispose](): void {
    this.wipe();
  }
}

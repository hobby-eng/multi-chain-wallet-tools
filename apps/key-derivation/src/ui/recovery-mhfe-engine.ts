// The MHFE browser package as the page uses it: four independent module classes over one shared
// WebAssembly and worker script. The page compiles the WebAssembly once and creates each class on
// first use, so that a page that never uses MHFE does no work for it. Every operation runs in a
// fresh worker that its class terminates when it ends or is stopped, which also frees the 2 GiB of
// Argon2 memory of a core operation. The MHFE panel and the MHFE wallet check of Generate & Derive
// each hold an engine of their own, so that the one's Cancel never stops the other's work.
import {
  MhfeClient,
  type MhfeParameters,
  type MhfeSelfCheckProgress,
  type MhfeSelfCheckReport,
} from "@ckd/recovery-mhfe-wasm/core/client.js";
import {
  MhfePasswords,
  type MhfePasswordsParameters,
} from "@ckd/recovery-mhfe-wasm/passwords/passwords.js";
import { MhfeRepair } from "@ckd/recovery-mhfe-wasm/repair/repair.js";
import mhfeWasm from "@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm";
import { MhfeWallet, type MhfeWalletParameters } from "@ckd/recovery-mhfe-wasm/wallet/wallet.js";
import { MhfeRun } from "./recovery-mhfe-run.js";
import { StageProgress, type StageLabels } from "./recovery-mhfe-status.js";

// Texts of the package's classic scripts, embedded by build-key-derivation-html.mjs.
declare const __MHFE_WORKER_SOURCE__: string;
declare const __MHFE_ARGON2_THREADED_SOURCE__: string;
declare const __MHFE_ARGON2_SINGLE_THREADED_SOURCE__: string;

/**
 * Argon2 threads of the browser package in fast mode, one for each of the suites' four lanes; the
 * file version gets one.
 */
export const FAST_MODE_THREADS = 4;

/**
 * Seconds of one recovery at PIM 0 in this browser, from the fastest to the slowest computer: in
 * fast mode mhfe's own estimate for the command line (mhfe src/suite.rs, 60 to 120 s), in slow
 * mode, with one thread, four to seven minutes as measured. The panel's notice and the time of a
 * search for missing words both read it; a PIM multiplies it by PIM + 1.
 */
const RECOVERY_SECONDS = { fast: [60, 120], slow: [240, 420] } as const;

/** The name the page shows for each class of the package. */
export type MhfeClassName = "Core" | "Repair words" | "Passwords" | "Wallet";

/** The self-check report of one of the panel's classes, with the name the page shows for it. */
export interface MhfeClassReport {
  readonly name: MhfeClassName;
  readonly report: MhfeSelfCheckReport;
}

/** The two self-checks of one class: the quick one before first use, and the full one. */
interface MhfeClassChecks {
  readonly name: MhfeClassName;
  quick(): Promise<MhfeSelfCheckReport>;
  full(onProgress: (progress: MhfeSelfCheckProgress) => void): Promise<MhfeSelfCheckReport>;
}

export class MhfeEngine {
  /** The WebAssembly, compiled once for every engine of the page. */
  static #compiled: Promise<WebAssembly.Module> | undefined;
  #client: Promise<MhfeClient> | undefined;
  #repair: Promise<MhfeRepair> | undefined;
  #passwords: Promise<MhfePasswords> | undefined;
  #wallet: Promise<MhfeWallet> | undefined;
  /** The instances that exist, for Cancel; a class not created yet has nothing to stop. */
  #created: { client?: MhfeClient; wallet?: MhfeWallet } = {};
  /** Fields filled from the package's values, once its quick checks have passed. */
  readonly #onPassed: (() => void)[] = [];
  #passed = false;

  /**
   * Opened as a file, the page cannot be cross-origin isolated, so the browser gives Argon2 one
   * thread; the executable version of the tool serves the same page with the headers four threads need.
   */
  get fastMode(): boolean {
    return globalThis.crossOriginIsolated === true;
  }

  /** Seconds of one recovery at PIM 0 in this mode, from the fastest to the slowest computer. */
  get recoverySeconds(): readonly [number, number] {
    return RECOVERY_SECONDS[this.fastMode ? "fast" : "slow"];
  }

  /** The core's fixed values: suites, rounds, lengths, repair capacities and limits. */
  async coreParameters(): Promise<MhfeParameters> {
    return (await this.client()).parameters();
  }

  /** The wallet module's fixed values: its coins and the wallet check's bits. */
  async walletParameters(): Promise<MhfeWalletParameters> {
    return (await this.wallet()).parameters();
  }

  async passwordParameters(): Promise<MhfePasswordsParameters> {
    return (await this.passwords()).parameters();
  }

  /** The status line of a long operation of the core, started now. */
  async progress(stages: StageLabels): Promise<StageProgress> {
    const { rounds } = await this.coreParameters();
    return new StageProgress(stages, rounds);
  }

  /** The core: encryption, recovery, the rehearsal check, rekey, hidden wallets and the self-test. */
  client(): Promise<MhfeClient> {
    this.#client ??= this.#parts().then((parts) => {
      const client = new MhfeClient({
        ...parts,
        argon2Threaded: __MHFE_ARGON2_THREADED_SOURCE__,
        argon2SingleThreaded: __MHFE_ARGON2_SINGLE_THREADED_SOURCE__,
      });
      this.#created.client = client;
      return client;
    });
    return this.#client;
  }

  /** Repair words of a container and the repair of a damaged container phrase. */
  repair(): Promise<MhfeRepair> {
    this.#repair ??= this.#parts().then((parts) => new MhfeRepair(parts));
    return this.#repair;
  }

  /** The check word review of a password, its strength, and new passwords. */
  passwords(): Promise<MhfePasswords> {
    this.#passwords ??= this.#parts().then((parts) => new MhfePasswords(parts));
    return this.#passwords;
  }

  /** The wallet check, master key fingerprints, address searches and new phrases. */
  wallet(): Promise<MhfeWallet> {
    this.#wallet ??= this.#parts().then((parts) => {
      const wallet = new MhfeWallet(parts);
      this.#created.wallet = wallet;
      return wallet;
    });
    return this.#wallet;
  }

  /**
   * The quick self-check of every class the panel uses (the package's startupCheck), or of the
   * classes in `only`, the core's without Argon2, which every Argon2 operation checks itself before
   * its first round: milliseconds each. A failed part closes its class for good.
   */
  async startupChecks(only?: readonly MhfeClassName[]): Promise<MhfeClassReport[]> {
    const reports: MhfeClassReport[] = [];
    for (const { name, quick } of this.#classChecks())
      if (only === undefined || only.includes(name)) reports.push({ name, report: await quick() });
    return reports;
  }

  /**
   * The full self-check of every class, one after another, as `mhfe self-test` runs it without its
   * vectors: seconds, and at most 256 MiB for one Argon2 build at a time.
   */
  async fullChecks(
    onProgress?: (name: string, progress: MhfeSelfCheckProgress) => void,
  ): Promise<MhfeClassReport[]> {
    const reports: MhfeClassReport[] = [];
    for (const { name, full } of this.#classChecks())
      reports.push({ name, report: await full((progress) => onProgress?.(name, progress)) });
    return reports;
  }

  /**
   * Calls `listener` once the panel's quick checks have passed, before any of its fields opens:
   * for answers filled from the package's values, such as the lengths of a phrase.
   */
  whenPassed(listener: () => void): void {
    if (this.#passed) listener();
    else this.#onPassed.push(listener);
  }

  /** The panel's quick checks passed (MhfePanelCheck). */
  passed(): void {
    if (this.#passed) return;
    this.#passed = true;
    for (const listener of this.#onPassed.splice(0)) listener();
  }

  /** Stops the running core operation or session; its worker and memory are discarded. */
  cancelCore(): void {
    this.#created.client?.cancel();
  }

  /** Stops a new phrase being drawn. */
  cancelDraw(): void {
    this.#created.wallet?.cancel();
  }

  /**
   * Runs one operation with its Cancel button shown. Cancel calls `cancel`, which stops the
   * package's running work, and latches over every step the operation takes through its run
   * (MhfeRun.step), so that nothing starts or finishes after it, also while the package compiles.
   */
  runCancellable<T>(
    button: HTMLButtonElement,
    cancel: () => void,
    operation: (run: MhfeRun) => Promise<T>,
  ): Promise<T> {
    return new MhfeRun(cancel).withButton(button, operation);
  }

  /** The classes in the order the page checks them, each created on first use. */
  #classChecks(): readonly MhfeClassChecks[] {
    const checks = <T extends MhfeClient | MhfeRepair | MhfePasswords | MhfeWallet>(
      name: MhfeClassName,
      open: () => Promise<T>,
    ): MhfeClassChecks => ({
      name,
      quick: async () => (await open()).startupCheck(),
      full: async (onProgress) => (await open()).fullCheck({ onProgress }),
    });
    return [
      {
        ...checks("Core", () => this.client()),
        quick: async () => (await this.client()).startupCheck({ argon2: false }),
      },
      checks("Repair words", () => this.repair()),
      checks("Passwords", () => this.passwords()),
      checks("Wallet", () => this.wallet()),
    ];
  }

  /** The worker script and the WebAssembly, compiled once for every class of every engine. */
  #parts(): Promise<{ workerSource: string; wasm: WebAssembly.Module }> {
    MhfeEngine.#compiled ??= WebAssembly.compile(mhfeWasm);
    return MhfeEngine.#compiled.then((wasm) => ({ workerSource: __MHFE_WORKER_SOURCE__, wasm }));
  }
}

import { AddressTargetError, detectBitcoinAddressTargets } from "@ckd/recovery/address-targets.js";
import { searchAcrossAddresses } from "@ckd/recovery/multi-address-search.js";
import {
  LocalSearchAdmission,
  LocalSearchAdmissionError,
} from "@ckd/recovery/local-search-admission.js";
import type { CoinAdapter } from "@ckd/coins/registry.js";
import type { DerivationControls, DerivationControlValues } from "./inputs.js";
import type { KeyDerivationView } from "./view.js";
import type { DerivationWorkerClient } from "../workers/derive-client.js";
import { DerivationCancelledError } from "../workers/derive-client.js";
import { DerivationErrorText } from "./derivation-error-text.js";

/** Native page/worker edges of the optional known-address search. */
export interface AddressSearchRunner {
  createViewElements(document: Document): AddressSearchViewElements;
  start(params: {
    adapter: CoinAdapter;
    controls: DerivationControls;
    fields: AddressSearchViewElements;
    mnemonic: HTMLTextAreaElement;
    passphrase: HTMLInputElement;
    view: KeyDerivationView;
    readControls(adapter: CoinAdapter, controls: DerivationControls): DerivationControlValues;
    mnemonicToSeed(mnemonic: string, passphrase: string): Uint8Array;
    createWorker(): DerivationWorkerClient;
  }): void;
  invalidate(): void;
}

/** Native controls for public target addresses and their bounded derivation range. */
export interface AddressSearchViewElements {
  panel: HTMLElement;
  button: HTMLButtonElement;
  expectedAddress: HTMLTextAreaElement;
  searchStart: HTMLInputElement;
  searchCount: HTMLInputElement;
  result: HTMLElement;
}

type SearchParameters = Parameters<AddressSearchRunner["start"]>[0];
interface AddressSearchOperation {
  readonly revision: number;
  readonly abort: AbortController;
  readonly view: KeyDerivationView;
  worker: DerivationWorkerClient | null;
  seed: Uint8Array | null;
}

/** Owns the active search, mutable seed, queued jobs and revocable page publication together. */
export class BitcoinAddressSearch implements AddressSearchRunner, Disposable {
  #revision = 0;
  #active: AddressSearchOperation | null = null;
  #lastView: KeyDerivationView | null = null;
  #pageBound = false;

  #bindPage(document: Document): void {
    if (this.#pageBound || document.defaultView === undefined || document.defaultView === null)
      return;
    document.defaultView.addEventListener("pagehide", this.invalidate);
    this.#pageBound = true;
  }

  /** Reads only native controls; a missing template element is a host setup error. */
  createViewElements(document: Document): AddressSearchViewElements {
    this.#bindPage(document);
    const required = <T extends Element>(selector: string): T => {
      const element = document.querySelector<T>(selector);
      if (element === null) throw new Error(`Application template is missing ${selector}.`);
      return element;
    };
    return {
      panel: required<HTMLElement>("#address-search"),
      button: required<HTMLButtonElement>("#search-address"),
      expectedAddress: required<HTMLTextAreaElement>("#expected-address"),
      searchStart: required<HTMLInputElement>("#search-start"),
      searchCount: required<HTMLInputElement>("#search-count"),
      result: required<HTMLElement>("#search-result"),
    };
  }

  #release(search: AddressSearchOperation, report: boolean): void {
    const worker = search.worker;
    search.worker = null;
    search.seed?.fill(0);
    search.seed = null;
    try {
      search.abort.abort();
    } finally {
      try {
        worker?.terminate(new DerivationCancelledError("Address-search worker released."));
      } catch {
        if (report)
          queueMicrotask(() => search.view.showError(DerivationErrorText.CLEANUP_FAILURE));
      }
    }
  }

  /** Replaces an older search and admits its public range before obtaining any seed bytes. */
  start = (params: SearchParameters): void => {
    this.invalidate();
    this.#bindPage(params.view.document);
    this.#lastView = params.view;
    const search: AddressSearchOperation = {
      revision: ++this.#revision,
      view: params.view,
      worker: null,
      seed: null,
      abort: new AbortController(),
    };
    this.#active = search;
    void this.#run(params, search);
  };

  async #run(params: SearchParameters, search: AddressSearchOperation): Promise<void> {
    const { view, adapter, controls, fields, mnemonic, passphrase } = params;
    view.clearMessages();
    view.setSearchRunning(true);
    try {
      const baseInput = params.readControls(adapter, controls);
      const start =
        fields.searchStart.value.trim() === "" ? Number.NaN : Number(fields.searchStart.value);
      const count =
        fields.searchCount.value.trim() === "" ? Number.NaN : Number(fields.searchCount.value);
      LocalSearchAdmission.range(start, count);
      const targets = detectBitcoinAddressTargets(fields.expectedAddress.value, baseInput.network);
      const seed = params.mnemonicToSeed(mnemonic.value, passphrase.value);
      search.seed = seed;
      const worker = params.createWorker();
      search.worker = worker;
      const results = await searchAcrossAddresses({
        targets,
        start,
        count,
        signal: search.abort.signal,
        search: (adapterId, target) =>
          worker.search(
            adapterId,
            {
              seed,
              network: target.network,
              account: baseInput.account,
              branch: baseInput.branch,
            },
            target.normalized,
            start,
            count,
          ),
        onProgress: (completed, total) => {
          if (search.revision === this.#revision)
            view.showSearchResult(
              `Searching ${completed}/${total} address${total === 1 ? "" : "es"}…`,
              false,
            );
        },
      });
      if (search.revision !== this.#revision) return;
      const found = results.filter(({ match }) => match !== null);
      const incomplete = results.filter(({ error }) => error !== undefined).length;
      const details = results
        .map(({ target, match, error }) => {
          if (error !== undefined) return `${target.input}: search failed`;
          if (match === null) return `${target.input}: not found`;
          return `${target.input}: index ${match.index} (${match.path})`;
        })
        .join("\n");
      const warning =
        incomplete === 0
          ? ""
          : ` Incomplete: ${incomplete} address search${incomplete === 1 ? "" : "es"} failed.`;
      view.showSearchResult(
        `${found.length}/${results.length} address${results.length === 1 ? "" : "es"} found in indices ${start}…${start + count - 1}.${warning}\n${details}`,
        found.length > 0,
      );
    } catch (cause) {
      if (search.revision !== this.#revision) return;
      view.showError(
        cause instanceof LocalSearchAdmissionError || cause instanceof AddressTargetError
          ? cause.message
          : "Address search failed.",
      );
    } finally {
      this.#release(search, search.revision === this.#revision);
      if (this.#active === search) {
        this.#active = null;
        view.setSearchRunning(false);
      }
    }
  }

  /** Stops queued and native work; every old reply is stale even if its worker ignores termination. */
  invalidate = (): void => {
    this.#revision += 1;
    const search = this.#active;
    this.#active = null;
    try {
      if (search !== null) this.#release(search, true);
    } finally {
      if (search !== null) search.view.setSearchRunning(false);
      this.#lastView?.hideSearchResult();
    }
  };
  /** Ends the current search's seed and native lifetime. */
  wipe(): void {
    this.invalidate();
  }
  /** Releases the optional operation when its host ends. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}

/** Build composition keeps the established optional feature factory. */
export function createBitcoinAddressSearchRunner(): AddressSearchRunner {
  return new BitcoinAddressSearch();
}

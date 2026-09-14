import { detectBitcoinAddressTargets } from '@ckd/recovery/address-targets.js';
import { searchAcrossAddresses } from '@ckd/recovery/multi-address-search.js';
import type { CoinAdapter } from '@ckd/coins/registry.js';
import type { DerivationControls, DerivationControlValues } from './inputs.js';
import type { KeyDerivationView } from './view.js';
import type { DerivationWorkerClient } from '../workers/derive-client.js';
import { DerivationCancelledError } from '../workers/derive-client.js';

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

export interface AddressSearchViewElements {
  panel: HTMLElement;
  button: HTMLButtonElement;
  expectedAddress: HTMLTextAreaElement;
  searchStart: HTMLInputElement;
  searchCount: HTMLInputElement;
  result: HTMLElement;
}

interface AddressSearchOperation {
  revision: number;
  worker: DerivationWorkerClient | null;
  seed: Uint8Array | null;
}

export function createBitcoinAddressSearchRunner(): AddressSearchRunner {
  let revision = 0;
  let active: AddressSearchOperation | null = null;
  let lastView: KeyDerivationView | null = null;

  const release = (search: AddressSearchOperation): void => {
    search.worker?.terminate(new DerivationCancelledError('Address-search worker released.'));
    search.worker = null;
    search.seed?.fill(0);
    search.seed = null;
  };

  return {
    createViewElements(document: Document): AddressSearchViewElements {
      const required = <T extends Element>(selector: string): T => {
        const element = document.querySelector<T>(selector);
        if (element === null) throw new Error(`Application template is missing ${selector}.`);
        return element;
      };
      return {
        panel: required<HTMLElement>('#address-search'),
        button: required<HTMLButtonElement>('#search-address'),
        expectedAddress: required<HTMLTextAreaElement>('#expected-address'),
        searchStart: required<HTMLInputElement>('#search-start'),
        searchCount: required<HTMLInputElement>('#search-count'),
        result: required<HTMLElement>('#search-result'),
      };
    },
    start({ adapter, controls, fields, mnemonic, passphrase, view, readControls, mnemonicToSeed, createWorker }): void {
      lastView = view;
      const search: AddressSearchOperation = { revision: ++revision, worker: null, seed: null };
      active = search;
      void (async () => {
        view.clearMessages();
        view.setSearchRunning(true);
        try {
          const input = readControls(adapter, controls);
          const { includeChange, ...baseInput } = input;
          const start = Number(fields.searchStart.value);
          const count = Number(fields.searchCount.value);
          const targets = detectBitcoinAddressTargets(fields.expectedAddress.value, baseInput.network);
          search.seed = mnemonicToSeed(mnemonic.value, passphrase.value);
          search.worker = createWorker();
          const results = await searchAcrossAddresses({
            targets,
            start,
            count,
            search: (adapterId, target) =>
              search.worker!.search(
                adapterId,
                { seed: search.seed!, network: target.network, account: baseInput.account, branch: baseInput.branch },
                target.normalized,
                start,
                count,
              ),
            onProgress: (completed, total) => {
              if (search.revision === revision) {
                view.showSearchResult(`Searching ${completed}/${total} address${total === 1 ? '' : 'es'}…`, false);
              }
            },
          });
          if (search.revision !== revision) return;
          const found = results.filter(({ match }) => match !== null);
          const details = results
            .map(({ target, match, error }) => {
              if (error !== undefined) return `${target.input}: ${error}`;
              if (match === null) return `${target.input}: not found`;
              return `${target.input}: index ${match.index} (${match.path})`;
            })
            .join('\n');
          view.showSearchResult(
            `${found.length}/${results.length} address${results.length === 1 ? '' : 'es'} found in indices ${start}…${start + count - 1}.\n${details}`,
            found.length > 0,
          );
        } catch (cause) {
          if (search.revision !== revision) return;
          view.showError(cause instanceof Error ? cause.message : 'Address search failed.');
        } finally {
          release(search);
          if (active === search) {
            active = null;
            view.setSearchRunning(false);
          }
        }
      })();
    },
    invalidate(): void {
      revision += 1;
      if (active !== null) {
        release(active);
        active = null;
        lastView?.setSearchRunning(false);
      }
      lastView?.hideSearchResult();
    },
  };
}

import { mnemonicToSeed } from '@ckd/core/bip39.js';
import { findDerivedAddress } from '@ckd/recovery/address-search.js';
import { detectBitcoinAddressTargets } from '@ckd/recovery/address-targets.js';
import {
  searchAcrossSeedsAndAddresses,
  type MultiSeedAddressResult,
  type RecoverySeedTarget,
} from '@ckd/recovery/multi-seed-search.js';
import type { RuntimeCoinAdapter } from '@ckd/coins/runtime-registry.js';
import type { AddressSearchRunner } from './types.js';
import { parseConcurrency, parseInteger } from '@ckd/core/validation.js';

export function createBitcoinAddressSearchRunner(
  getAddressSearchAdapter: (id: string) => RuntimeCoinAdapter,
): AddressSearchRunner {
  return (snapshot, context) => {
    if (snapshot.coinId !== 'bitcoin') throw new Error('Select Bitcoin to use local address-target search.');
    const targets = detectBitcoinAddressTargets(
      snapshot.addressSearchTargets ?? '',
      snapshot.network === 'testnet' ? 'testnet' : 'mainnet',
    );
    const start = parseInteger(snapshot.addressSearchStart ?? '', 'Search start', 0);
    const count = parseInteger(snapshot.addressSearchCount ?? '', 'Search count', 1);
    const account = parseInteger(snapshot.account, 'Account', 0);
    const seedConcurrency =
      context.inputMode === 'single' ? 1 : parseConcurrency(snapshot.batchConcurrency, 'Batch seed concurrency');
    if (count > 5000) throw new Error('Search count must be an integer from 1 to 5000.');
    let inputs = [] as ReturnType<typeof context.recoveryInputs>;
    const seeds: RecoverySeedTarget[] = [];
    try {
      inputs = context.recoveryInputs(snapshot);
      for (const input of inputs) {
        const seed = mnemonicToSeed(input.mnemonic, input.passphrase);
        context.sessionSecretGuard.registerString('BIP39 mnemonic', input.mnemonic);
        context.sessionSecretGuard.registerString('BIP39 passphrase', input.passphrase);
        context.sessionSecretGuard.registerBytes('BIP39 seed', seed);
        seeds.push({ id: input.id, label: input.label, seed });
      }
      context.wipeInputObjects(inputs);
      context.resetState();
      const { controller: runController, generation } = context.prepareRun();
      context.view.setStatus(
        `Searching ${seeds.length} seed${seeds.length === 1 ? '' : 's'} across ${targets.length} Bitcoin address target${targets.length === 1 ? '' : 's'} locally.`,
      );
      void (async () => {
        const partial = new Array<MultiSeedAddressResult>(seeds.length * targets.length);
        let latest: MultiSeedAddressResult[] = [];
        try {
          latest = await searchAcrossSeedsAndAddresses({
            seeds,
            targets,
            start,
            count,
            concurrency: seedConcurrency,
            signal: runController.signal,
            onProgress: (completed, total, result, index) => {
              partial[index] = result;
              if (context.isCurrentRun(generation)) {
                context.view.renderAddressSearch(
                  partial.filter((item): item is MultiSeedAddressResult => item !== undefined),
                  completed,
                  total,
                );
              }
            },
            search: async (seed, adapterId, target, rangeStart, rangeCount, signal) => {
              const adapter = getAddressSearchAdapter(adapterId);
              const base = { seed, network: target.network, account, branch: 0 };
              const receive = await findDerivedAddress(
                adapter,
                base,
                target.normalized,
                rangeStart,
                rangeCount,
                signal,
              );
              if (receive !== null) return receive;
              return findDerivedAddress(
                adapter,
                { ...base, branch: 1 },
                target.normalized,
                rangeStart,
                rangeCount,
                signal,
              );
            },
          });
          if (!context.isCurrentRun(generation)) return;
          if (runController.signal.aborted) throw new DOMException('Address search cancelled.', 'AbortError');
          context.view.renderAddressSearch(latest, latest.length, seeds.length * targets.length);
          context.view.setStatus('Local Bitcoin address search complete. No network worker was used.');
        } catch (cause) {
          if (!context.isCurrentRun(generation)) return;
          context.view.resetAddressSearch();
          context.view.setStatus(
            runController.signal.aborted
              ? 'Local address search cancelled. No partial matches were retained.'
              : 'Local address search could not finish.',
          );
          if (!runController.signal.aborted) context.view.showError(context.describeUnknownError(cause));
        } finally {
          context.wipeInputObjects(inputs);
          context.sessionSecretGuard.clear();
          context.finishRun(generation);
        }
      })();
    } catch (cause) {
      // A later mnemonic conversion may fail after earlier seeds were allocated.
      for (const seed of seeds) seed.seed.fill(0);
      context.wipeInputObjects(inputs);
      context.sessionSecretGuard.clear();
      context.view.showError(context.describeUnknownError(cause));
    }
  };
}

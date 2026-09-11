import { assertIndex, MAX_BIP32_INDEX } from '@ckd/core/bip32.js';
import { ADDRESS_DISCOVERY_GAP } from './coins/dash/util.js';
import type { RecoveryScanConfig } from './types.js';

/** Validates the entire range before any network operation; iteration stays lazy. */
export function accountScanConfigs(config: RecoveryScanConfig, coinId: string): Iterable<RecoveryScanConfig> {
  assertIndex(config.account, 'Account');
  if (config.accountRangeEnd === undefined) return [config];
  assertIndex(config.accountRangeEnd, 'Last account');
  if (config.accountRangeEnd < config.account) throw new Error('Last account must be at least the first account.');
  if (!['bitcoin', 'ethereum', 'dash'].includes(coinId)) throw new Error('This coin does not support account ranges.');
  if (coinId === 'dash' && !(config.scanCore || config.scanLegacyCore || config.scanCoinJoin || config.scanPlatformAddresses || config.scanShieldedPool)) {
    throw new Error('Select an account-based Dash component: Core, Platform addresses, or Orchard.');
  }
  const padded = { ...config };
  const pad = (key: 'coreReceiveCount' | 'coreChangeCount' | 'legacyCoreCount' | 'coinJoinExternalCount' | 'coinJoinInternalCount' | 'platformAddressCount'): void => {
    const count = config[key];
    if (!Number.isSafeInteger(count) || count < 0 || count > MAX_BIP32_INDEX + 1 - ADDRESS_DISCOVERY_GAP) {
      throw new Error('Address minimum plus the 20-address margin exceeds the supported index range.');
    }
    // Zero disables a branch; a margin must never re-enable it.
    padded[key] = count === 0 ? 0 : count + ADDRESS_DISCOVERY_GAP;
  };
  if (coinId !== 'dash' || config.scanCore) pad('coreReceiveCount');
  if (coinId === 'bitcoin' || (coinId === 'dash' && config.scanCore)) pad('coreChangeCount');
  if (coinId === 'dash') {
    if (config.scanLegacyCore) pad('legacyCoreCount');
    if (config.scanCoinJoin) { pad('coinJoinExternalCount'); pad('coinJoinInternalCount'); }
    if (config.scanPlatformAddresses) pad('platformAddressCount');
  }
  return {
    *[Symbol.iterator]() {
      for (let account = config.account; account <= config.accountRangeEnd!; account += 1) {
        const first = account === config.account;
        yield {
          ...padded, account, accountRangeStart: config.account,
          // These paths do not contain the selected account parameter.
          scanCustomPath: first && config.scanCustomPath === true,
          scanPlatformIdentities: first && config.scanPlatformIdentities,
          scanIdentityFunding: first && config.scanIdentityFunding,
          scanProviderCollateral: first && config.scanProviderCollateral,
        };
      }
    },
  };
}

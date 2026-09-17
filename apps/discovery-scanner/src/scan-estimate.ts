import { RECOVERY_CORE_ADDRESS_BATCH, RECOVERY_PLATFORM_ADDRESS_BATCH } from '@ckd/network-boundary/protocol.js';

const COINJOIN_COIN_TYPE: Record<'mainnet' | 'testnet', number> = { mainnet: 5, testnet: 1 };

export function coinJoinPathPattern(network: string): string {
  const coinType = COINJOIN_COIN_TYPE[network as 'mainnet' | 'testnet'] ?? COINJOIN_COIN_TYPE.mainnet;
  return `external m/9'/${coinType}'/4'/0'/0/i · internal m/9'/${coinType}'/4'/0'/1/i`;
}

export function estimateInteger(value: string, minimum: number): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum) throw new Error('Invalid estimate input.');
  return number;
}

function estimateConcurrency(value: string): number {
  const number = estimateInteger(value, 1);
  if (number > 5) throw new Error('Invalid estimate concurrency.');
  return number;
}

interface StandardEstimateOptions {
  readonly customPath: boolean;
  readonly customRange: boolean;
  readonly requests: string;
  readonly includeUsedZero: boolean;
}

export function bitcoinScanEstimate(
  receiveCount: string,
  changeCount: string,
  options: StandardEstimateOptions,
): string {
  const perFamily = estimateInteger(receiveCount, 0) + estimateInteger(changeCount, 0);
  return `Bitcoin · 4 standard address families${options.customPath ? (options.customRange ? ' + custom account range' : ' + custom path') : ''} · ${(perFamily * 4).toLocaleString()} standard minimum addresses + 20-address post-use gaps · ${estimateConcurrency(options.requests)} network requests at once${options.includeUsedZero ? ' · zero-balance history enabled' : ''}`;
}

export function ethereumScanEstimate(receiveCount: string, options: StandardEstimateOptions): string {
  return `Ethereum EOA · 3 standard wallet profiles${options.customPath ? (options.customRange ? ' + custom account range' : ' + custom path') : ''} · ${estimateInteger(receiveCount, 1).toLocaleString()} minimum derivations per profile + 20-address post-use gaps · ${estimateConcurrency(options.requests)} network requests at once${options.includeUsedZero ? ' · used zero-balance accounts enabled' : ''}`;
}

interface DashScanEstimateInput {
  readonly scanCore: boolean;
  readonly receiveCount: string;
  readonly changeCount: string;
  readonly customPath: boolean;
  readonly scanLegacyCore: boolean;
  readonly legacyCoreCount: string;
  readonly scanCoinJoin: boolean;
  readonly coinJoinExternalCount: string;
  readonly coinJoinInternalCount: string;
  readonly scanIdentityFunding: boolean;
  readonly scanProviderCollateral: boolean;
  readonly providerCollateralCount: string;
  readonly scanPlatformAddresses: boolean;
  readonly platformCount: string;
  readonly scanPlatformIdentities: boolean;
  readonly identityLimit: string;
  readonly requestConcurrency: string;
  readonly includeUsedZero: boolean;
  readonly scanShielded: boolean;
}

export function dashScanEstimate(input: DashScanEstimateInput): string {
  const core = input.scanCore ? estimateInteger(input.receiveCount, 0) + estimateInteger(input.changeCount, 0) : 0;
  const legacyCore = input.scanCore && input.scanLegacyCore ? estimateInteger(input.legacyCoreCount, 0) * 2 : 0;
  const coinJoin =
    input.scanCore && input.scanCoinJoin
      ? estimateInteger(input.coinJoinExternalCount, 0) + estimateInteger(input.coinJoinInternalCount, 0)
      : 0;
  const providerCollateral =
    input.scanCore && input.scanProviderCollateral ? estimateInteger(input.providerCollateralCount, 0) : 0;
  const platform = input.scanPlatformAddresses ? estimateInteger(input.platformCount, 0) : 0;
  const coreBatches = Math.ceil((core + legacyCore + coinJoin + providerCollateral) / RECOVERY_CORE_ADDRESS_BATCH);
  const platformBatches = 2 * Math.ceil(platform / RECOVERY_PLATFORM_ADDRESS_BATCH);
  const identities = input.scanPlatformIdentities ? estimateInteger(input.identityLimit, 1) : 0;
  const requests = estimateConcurrency(input.requestConcurrency);
  const totalBatches = coreBatches + platformBatches;
  const optionalFamilies = [
    input.scanCore && input.scanLegacyCore,
    input.scanCore && input.scanCoinJoin,
    input.scanPlatformIdentities && input.scanIdentityFunding,
    input.scanCore && input.scanProviderCollateral,
  ].filter(Boolean).length;
  return `${input.scanCore ? 'Dash Core BIP44 selected' : 'Dash Core skipped'}${input.customPath ? ' · custom path selected' : ''} · ${optionalFamilies} optional coverage item${optionalFamilies === 1 ? '' : 's'} · ${totalBatches.toLocaleString()} minimum address batches${totalBatches > 0 ? ' + gap 20' : ''} · about ${identities.toLocaleString()} identity proof calls per seed phrase · ${requests} network request${requests === 1 ? '' : 's'} at once${input.includeUsedZero ? ' · zero-balance history enabled' : ''}${input.scanShielded ? ' · complete Orchard pool' : ''}`;
}

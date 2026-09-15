import { parseInteger } from '@ckd/core/validation.js';
import type { RecoveryInputSnapshot } from './view.js';
import type { RecoveryInputMode, RecoveryScanConfig, RecoverySeedInput } from './types.js';

export function createRecoverySeedInputs(
  snapshot: RecoveryInputSnapshot,
  inputMode: RecoveryInputMode,
  assertValidMnemonic: (value: string) => string,
): RecoverySeedInput[] {
  if (inputMode === 'single') {
    return [
      {
        id: 'seed-1',
        label: 'Seed phrase #1',
        mnemonic: assertValidMnemonic(snapshot.singleMnemonic),
        passphrase: snapshot.singlePassphrase,
      },
    ];
  }
  const mnemonicLines = snapshot.batchMnemonics.replaceAll('\r', '').split('\n');
  const passphraseLines = snapshot.batchPassphrases.replaceAll('\r', '').split('\n');
  const inputs: RecoverySeedInput[] = [];
  mnemonicLines.forEach((mnemonic, lineIndex) => {
    if (mnemonic.trim().length === 0) return;
    const number = inputs.length + 1;
    inputs.push({
      id: `seed-${number}`,
      label: `Seed phrase #${number} · source line ${lineIndex + 1}`,
      mnemonic: assertValidMnemonic(mnemonic),
      passphrase: passphraseLines[lineIndex] ?? '',
    });
  });
  if (inputs.length === 0) throw new Error('Enter at least one BIP39 seed phrase in batch mode.');
  return inputs;
}

export function recoveryScanConfig(snapshot: RecoveryInputSnapshot): RecoveryScanConfig {
  return {
    network: snapshot.network === 'testnet' ? 'testnet' : 'mainnet',
    account: parseInteger(snapshot.account, 'Account', 0),
    scanCore: snapshot.scanCore,
    coreReceiveCount: parseInteger(snapshot.coreReceiveCount, 'Core receive count', 0),
    coreChangeCount: parseInteger(snapshot.coreChangeCount, 'Core change count', 0),
    scanCustomPath: snapshot.scanCustomPath,
    customPathTemplate: snapshot.customPathTemplate.trim(),
    ...(snapshot.scanCustomPath && snapshot.scanCustomRange
      ? { customPathRangeEnd: snapshot.customPathRangeEnd.trim() }
      : {}),
    customPathFormat: snapshot.customPathFormat,
    customPathCount: parseInteger(snapshot.customPathCount, 'Custom path address count', 1),
    scanLegacyCore: snapshot.scanLegacyCore,
    legacyCoreCount: parseInteger(snapshot.legacyCoreCount, 'Legacy Core address count', 0),
    scanCoinJoin: snapshot.scanCoinJoin,
    coinJoinExternalCount: parseInteger(
      snapshot.coinJoinExternalCount,
      'Dash Mobile CoinJoin · DIP9 external address count',
      0,
    ),
    coinJoinInternalCount: parseInteger(
      snapshot.coinJoinInternalCount,
      'Dash Mobile CoinJoin · DIP9 internal address count',
      0,
    ),
    scanIdentityFunding: snapshot.scanIdentityFunding,
    identityFundingCount: parseInteger(snapshot.identityFundingCount, 'Registration funding keys to compare', 0),
    identityTopUpIdentityCount: parseInteger(
      snapshot.identityTopUpIdentityCount,
      'Identity-bound top-up identity count',
      0,
    ),
    identityTopUpCount: parseInteger(snapshot.identityTopUpCount, 'Identity-bound top-ups per identity', 0),
    scanProviderCollateral: snapshot.scanProviderCollateral,
    providerCollateralCount: parseInteger(
      snapshot.providerCollateralCount,
      'Provider collateral/holdings address count',
      0,
    ),
    scanPlatformAddresses: snapshot.scanPlatformAddresses,
    platformAddressCount: parseInteger(snapshot.platformAddressCount, 'Platform address count', 0),
    scanPlatformIdentities: snapshot.scanPlatformIdentities,
    identityStartIndex: parseInteger(snapshot.identityStartIndex, 'Identity start index', 0),
    identityGapLimit: parseInteger(snapshot.identityGapLimit, 'Identity gap limit', 1),
    identityScanLimit: parseInteger(snapshot.identityScanLimit, 'Identity scan limit', 1),
    includeUsedZeroBalance: snapshot.includeUsedZeroBalance,
    scanShieldedPool: snapshot.scanShieldedPool,
  };
}

export function wipeRecoverySeedInputs(inputs: RecoverySeedInput[]): void {
  for (const input of inputs) {
    input.mnemonic = '';
    input.passphrase = '';
  }
}

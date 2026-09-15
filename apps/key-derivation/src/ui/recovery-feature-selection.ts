import type { RecoverySourceTarget } from './recovery-source-link.js';
import type { RecoveryFeatureContext } from './recovery-workspace-shared.js';
import { installCodex32 } from './recovery-codex32.js';
import { installSeedQr } from './recovery-seedqr.js';
import { installShamir } from './recovery-shamir.js';
import { installSlip39 } from './recovery-slip39.js';
import { installWalletMatcher } from './recovery-wallet-matcher.js';
export const selectedRecoveryTargets: ReadonlySet<RecoverySourceTarget> = new Set([
  'matcher',
  'seedqr',
  'slip39',
  'shamir-raw',
  'shamir-words',
  'codex32',
]);
export function installSelectedRecoveryFeatures(context: RecoveryFeatureContext): void {
  installWalletMatcher(context);
  installSeedQr(context);
  installSlip39(context);
  installShamir(context);
  installCodex32(context);
}

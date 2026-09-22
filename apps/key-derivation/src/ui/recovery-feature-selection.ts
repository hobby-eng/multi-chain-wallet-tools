import type { RecoverySourceTarget } from './recovery-source-link.js';
import type { RecoveryFeatureContext } from './recovery-workspace-shared.js';
import { installCodex32 } from './recovery-codex32.js';
import { installSeedQr } from './recovery-seedqr.js';
import { installMhfe } from './recovery-mhfe.js';
import { installShamir } from './recovery-shamir.js';
import { installSlip39 } from './recovery-slip39.js';
import { installSskr } from './recovery-sskr.js';
import { installGordianEnvelope } from './recovery-gordian-envelope.js';
import { installWalletMatcher } from './recovery-wallet-matcher.js';
export const selectedRecoveryTargets: ReadonlySet<RecoverySourceTarget> = new Set([
  'matcher',
  'seedqr',
  'mhfe',
  'slip39',
  'shamir',
  'codex32',
  'sskr',
  'gordian-envelope',
]);
export function installSelectedRecoveryFeatures(context: RecoveryFeatureContext): void {
  installWalletMatcher(context);
  installSeedQr(context);
  installMhfe(context);
  installSlip39(context);
  installShamir(context);
  installCodex32(context);
  installSskr(context);
  installGordianEnvelope(context);
}

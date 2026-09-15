import type { RecoveryInputSnapshot } from './view.js';

/** Releases all sensitive or privacy-sensitive text retained by a form snapshot. */
export function wipeRecoveryInputSnapshot(snapshot: RecoveryInputSnapshot): void {
  snapshot.singleMnemonic = '';
  snapshot.singlePassphrase = '';
  snapshot.batchMnemonics = '';
  snapshot.batchPassphrases = '';
  snapshot.watchOnlyKeys = '';
}

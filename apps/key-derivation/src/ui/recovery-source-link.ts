import type {
  RecoverySourceReference,
  RecoverySourceTarget,
} from "@ckd/recovery/recovery-source.js";

/** Compatibility types; the library owns source capability and admitted destination shapes. */
export type {
  RecoverySourceReference,
  RecoverySourceTarget,
} from "@ckd/recovery/recovery-source.js";

export interface RecoverySourceReceiver {
  useSource(reference: RecoverySourceReference, target: RecoverySourceTarget): void;
  /**
   * The phrase entered in Generate & Derive, or null while there is no valid one. Each backup tab with an
   * empty phrase field then offers to use it, for someone who came here without "Use in Recover & Back Up".
   */
  offerSource(reference: RecoverySourceReference | null): void;
  setCryptoEnabled(enabled: boolean): void;
}

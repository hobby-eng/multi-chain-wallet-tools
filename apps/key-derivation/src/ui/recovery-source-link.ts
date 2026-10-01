export type RecoverySourceTarget =
  "matcher" | "seedqr" | "mnemocode" | "mhfe" | "slip39" | "codex32" | "sskr" | "gordian-envelope";

interface RecoverySourceValue {
  readonly mnemonic: string;
  readonly passphrase: string;
}

/** A capability-style reference: it contains no secret and expires when its source changes. */
export interface RecoverySourceReference {
  readonly label: string;
  read(): RecoverySourceValue | null;
}

export interface RecoverySourceReceiver {
  useSource(reference: RecoverySourceReference, target: RecoverySourceTarget): void;
  /**
   * The phrase entered in Generate & Derive, or null while there is no valid one. Each backup tab with an
   * empty phrase field then offers to use it, for someone who came here without "Use in Recover & Back Up".
   */
  offerSource(reference: RecoverySourceReference | null): void;
  setCryptoEnabled(enabled: boolean): void;
}

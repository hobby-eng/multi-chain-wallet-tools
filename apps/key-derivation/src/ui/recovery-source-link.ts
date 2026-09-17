export type RecoverySourceTarget = 'matcher' | 'seedqr' | 'slip39' | 'shamir' | 'codex32' | 'sskr' | 'gordian-envelope';

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
  setCryptoEnabled(enabled: boolean): void;
}

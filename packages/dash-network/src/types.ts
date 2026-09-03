export type ViewerNetwork = 'mainnet' | 'testnet';
export type ViewerKeyKind = 'full' | 'incoming' | 'outgoing';

export interface ShieldedEncryptedNote {
  cmx: Uint8Array;
  nullifier: Uint8Array;
  cvNet: Uint8Array;
  encryptedNote: Uint8Array;
}

export interface ShieldedPage {
  notes: ShieldedEncryptedNote[];
  proofHeight: bigint;
  coreChainLockedHeight: number;
  timeMs: bigint;
  protocolVersion: number;
}

export interface ShieldedPageSource {
  connect(): Promise<void>;
  fetchPage(startPosition: bigint, count: number): Promise<ShieldedPage>;
}

export interface DecryptedNoteView {
  value: bigint;
  addressRaw: string;
  address: string;
  memoHex: string;
  memo: string;
  noteNullifier?: string;
}

export interface ScannedMatch {
  position: bigint;
  cmx: string;
  actionNullifier: string;
  incoming?: DecryptedNoteView;
  outgoing?: DecryptedNoteView;
}

export type ActivityDirection = 'received' | 'sent' | 'self';

export interface ShieldedActivity {
  position: bigint;
  cmx: string;
  actionNullifier: string;
  direction: ActivityDirection;
  incoming?: DecryptedNoteView;
  outgoing?: DecryptedNoteView;
  spent?: boolean;
  spentAtPosition?: bigint;
}

export interface ActivitySnapshot {
  records: ShieldedActivity[];
  scannedNotes: bigint;
  proofHeight: bigint;
  protocolVersion: number;
  complete: boolean;
  keyKind: ViewerKeyKind;
  balance: bigint | null;
  receivedExternal: bigint | null;
  sentExternal: bigint | null;
  selfOrChange: bigint | null;
}

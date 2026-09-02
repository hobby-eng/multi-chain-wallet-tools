export interface EvoShieldedNoteLike {
  readonly cmx: Uint8Array;
  readonly nullifier: Uint8Array;
  readonly cvNet: Uint8Array;
  readonly encryptedNote: Uint8Array;
  free(): void;
}

/** Copy SDK-owned views before freeing their WASM allocation. */
export function copyAndFreeEvoShieldedNote(note: EvoShieldedNoteLike): {
  cmx: Uint8Array;
  nullifier: Uint8Array;
  cvNet: Uint8Array;
  encryptedNote: Uint8Array;
} {
  try {
    return {
      cmx: new Uint8Array(note.cmx),
      nullifier: new Uint8Array(note.nullifier),
      cvNet: new Uint8Array(note.cvNet),
      encryptedNote: new Uint8Array(note.encryptedNote),
    };
  } finally {
    note.free();
  }
}

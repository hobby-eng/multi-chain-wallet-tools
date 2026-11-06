/** The BIP39 word-count choices, shared by runtime admission and generated page controls. */
export const BIP39_WORD_COUNTS = [12, 15, 18, 21, 24] as const;

/** A word count represented by the protocol choices. */
export type Bip39WordCount = (typeof BIP39_WORD_COUNTS)[number];

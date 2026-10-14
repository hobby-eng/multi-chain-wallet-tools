// Bitcoin's Base58Check version bytes on its main network: of a key's hash (P2PKH, "1…") and of a
// script's hash (P2SH, "3…"), which Bitcoin Cash's legacy addresses and Litecoin's old "3…" ones
// share. A module of their own, so that a host of Bitcoin Cash takes them without SegWit and
// Taproot, and base58.ts, which the Dash edition carries, holds no fact of Bitcoin.
//
// Host-neutral: it imports nothing (test/portable-modules.test.ts).

/** The version byte of a Bitcoin P2PKH address. */
export const BITCOIN_P2PKH_VERSION = 0x00;
/** The version byte of a Bitcoin P2SH address. */
export const BITCOIN_P2SH_VERSION = 0x05;

// The bounds of BIP32 key indexes that every path check shares. Host-neutral and without
// packages, so that the coins, which do not load @scure/bip32, take them too
// (test/portable-modules.test.ts); a test keeps HARDENED_OFFSET equal to @scure/bip32's.

import type { WholeRange } from "./typed-number.js";

/** BIP32: indexes from 2^31 up are hardened. */
export const HARDENED_OFFSET = 2 ** 31;
/** BIP32: the highest index that is not hardened, 2^31 − 1; every step of an address path is at most this. */
export const LAST_NORMAL_INDEX = HARDENED_OFFSET - 1;
/** The account, the branch and the index of an address: each an index that is not hardened. */
export const NORMAL_INDEX_RANGE: WholeRange = Object.freeze({ min: 0, max: LAST_NORMAL_INDEX });

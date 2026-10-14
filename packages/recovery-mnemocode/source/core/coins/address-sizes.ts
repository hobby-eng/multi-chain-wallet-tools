// The sizes of what addresses commit to, which the readers of addresses and the guess of a written
// address form both derive their lengths from. Kept apart from the hashes that make them, so that
// a module that only reads the form of an address loads no hash.
//
// Host-neutral: it imports nothing (test/portable-modules.test.ts).

/** RIPEMD-160 gives 160 bits: a HASH160 is 20 bytes. */
export const HASH160_BYTES = 20;

/**
 * The bytes of an account written as 0x and hexadecimal digits: 20, the last bytes of a hash of
 * the key in the yellow paper of the coins that write accounts so (keccak-account.ts).
 */
export const HEX_ACCOUNT_BYTES = 20;

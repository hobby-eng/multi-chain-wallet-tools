// The index limits of BIP32, as data: an index from HARDENED_OFFSET on is hardened, so an ordinary
// account, branch or address index runs from 0 to MAX_BIP32_INDEX. It loads no key code, so that a
// page or a worker reads the bound from here without BIP32 itself (AUD-024 family 23).

/** The first hardened index, 2^31 (BIP32). */
export const BIP32_HARDENED_OFFSET = 2 ** 31;
/** The highest ordinary (non-hardened) index. */
export const MAX_BIP32_INDEX = BIP32_HARDENED_OFFSET - 1;

/** How many ordinary indices one branch has: the most addresses a scan of one branch can ask. */
export const BIP32_BRANCH_SIZE = BIP32_HARDENED_OFFSET;

/** The most results one worker call derives; a longer request goes in batches of this size. */
export const MAX_BATCH_SIZE = 50;

/** Refuses an index that is not a whole number from 0 to `max`, `name` naming it. */
export function assertIndex(value: number, name: string, max = MAX_BIP32_INDEX): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new Error(`${name} must be an integer from 0 to ${max}.`);
  }
  return value;
}

/** Refuses an address count that is not a whole number from `minimum` to BIP32_BRANCH_SIZE. */
export function assertAddressCount(value: number, label: string, minimum = 1): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > BIP32_BRANCH_SIZE) {
    throw new Error(`${label} must be an integer from ${minimum} to ${BIP32_BRANCH_SIZE}.`);
  }
  return value;
}

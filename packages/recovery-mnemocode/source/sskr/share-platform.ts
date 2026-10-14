/**
 * Host services for SSKR shares: the digest check and the SSKR library.
 *
 * The share modules are platform-neutral (split.ts, share-set.ts, joint-repair.ts). What only the
 * host has comes in through this interface: Node.js supplies it through `share-platform-node.ts`,
 * with node:crypto and the bundled SSKR WASM, and another host, such as a browser page, supplies
 * its own, as it does for the card renderers (export/platform.ts). Every share module that needs it
 * takes it as a parameter (split.ts, share-set.ts, share-input.ts, joint-repair.ts); none reads a
 * platform configured beforehand.
 */
export interface SharePlatform {
  /**
   * HMAC-SHA256 of `message` under `key`. Synchronous: the search calls it for every try. Returns
   * a fresh array of the 32 bytes of the MAC, which the caller owns and may wipe once it has
   * compared it; never storage that the host reuses or a view of `key` or `message`, which stay
   * the caller's and are not changed.
   */
  readonly hmacSha256: (key: Uint8Array, message: Uint8Array) => Uint8Array;
  /** The secret that complete shares restore, from the host's SSKR library; throws if none. */
  readonly combineShares: (records: readonly string[]) => Promise<Uint8Array>;
  /**
   * Shares of one group that split `secret`, `threshold` of `count` needed, as UR records, from
   * the host's SSKR library; `seed` (SEED_BYTES of fresh randomness) seeds its random numbers.
   * The library may wipe `seed`; its caller wipes it too.
   */
  readonly createShares: (
    secret: Uint8Array,
    threshold: number,
    count: number,
    seed: Uint8Array,
  ) => Promise<string[]>;
}

/**
 * Random bytes that seed one split: the SSKR WASM takes exactly 32, the seed of its ChaCha20
 * generator (sskr-wasm/rust/src/lib.rs). A deliberate copy across the languages, which the WASM
 * cannot export before it is loaded; test/sskr-vectors.test.ts keeps it in step by asking the
 * engine to take this length and refuse one byte less or more.
 */
export const SEED_BYTES = 32;

/**
 * The one group that MnemoCode writes, and so the group threshold it takes: createShares makes
 * shares of one group, which every host's bridge is asked for.
 */
export const ONE_GROUP = 1;

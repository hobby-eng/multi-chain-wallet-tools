// What the connected tools (the Discovery Scanner) derive of a single-key coin: its public addresses
// under the layouts its wallets use, each address derived as the Deriver derives its row but
// without any private key form, so that no private key string is ever made. Crypto-free: each kind
// of coin (bip44-coin.ts, ed25519-coin.ts) builds its scheme, and a coin with several kinds of keys
// or layouts combines them.

/** One way a coin's wallets lay out its addresses, from index 0 on. */
export interface AddressLayout {
  /**
   * The layout's id, unique among the layouts a scan checks: a coin's Deriver variant's adapter id,
   * "<adapter id>-accounts" for BIP44's account-index form, or a name of its own (a fixed path such
   * as "ethereum-classic-ledger-legacy", the Discovery Scanner's EVM layouts such as "standard").
   */
  readonly id: string;
  /** The layout's name in scan sections, with its path template. */
  readonly label: string;
  /** The path of index `index` when the scan starts at account `account`. */
  path(account: number, index: number): string;
  /** How many indexes the layout holds from account `account` on. */
  maximumCount(account: number): number;
}

/** The public addresses of one seed; whatever it derived from the seed lives until `wipe()`. */
export interface SeedAddresses {
  /** The address at index `index` of `layout`, one of its scheme's layouts. */
  address(layout: AddressLayout, account: number, index: number): string;
  /** Erases the seed's derivation root, as far as the runtime allows. */
  wipe(): void;
}

/** A coin's address layouts and the derivation of a seed's addresses under them. */
export interface CoinAddressScheme {
  readonly layouts: readonly AddressLayout[];
  /**
   * What the coin's wallets hold that these layouts cannot reach from a BIP39 seed, said where a
   * scan of them is described (TON's Telegram wallet, whose phrase is not a BIP39 phrase).
   */
  readonly notCovered?: string;
  /** The addresses of `seed`, which the caller keeps alive while they are used and then wipes. */
  open(seed: Uint8Array): SeedAddresses;
}

/**
 * One scheme of several, for a coin whose variants derive in different ways (Hedera's Ed25519 and
 * ECDSA keys): their layouts in order, each address derived by the scheme that owns its layout, and
 * every scheme opened on the seed wiped together. `notCovered` says what none of them reaches.
 */
export function combinedAddressScheme(
  schemes: readonly CoinAddressScheme[],
  notCovered?: string,
): CoinAddressScheme {
  const owner = new Map(
    schemes.flatMap((scheme, at) => scheme.layouts.map((layout) => [layout, at] as const)),
  );
  return Object.freeze({
    layouts: Object.freeze([...owner.keys()]),
    ...(notCovered === undefined ? {} : { notCovered }),
    open(seed: Uint8Array): SeedAddresses {
      const opened: SeedAddresses[] = [];
      try {
        for (const scheme of schemes) opened.push(scheme.open(seed));
      } catch (cause) {
        for (const addresses of opened) addresses.wipe();
        throw cause;
      }
      return {
        address(layout, account, index) {
          const at = owner.get(layout);
          const addresses = at === undefined ? undefined : opened[at];
          if (addresses === undefined)
            throw new Error(`${layout.id} is not a layout of this coin.`);
          return addresses.address(layout, account, index);
        },
        wipe() {
          for (const addresses of opened) addresses.wipe();
        },
      };
    },
  });
}

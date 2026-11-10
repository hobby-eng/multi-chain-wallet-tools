// What the connected tools (the Discovery Scanner) derive of a single-key coin: its public addresses
// under the layouts its wallets use, each address derived as the Deriver derives its row but
// without any private key form, so that no private key string is ever made. Crypto-free: each kind
// of coin (bip44-coin.ts, ed25519-coin.ts) builds its scheme.

/** One way a coin's wallets lay out its addresses, from index 0 on. */
export interface AddressLayout {
  /** The Deriver variant's adapter id, or "<adapter id>-accounts" for BIP44's account-index form. */
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
  /** The addresses of `seed`, which the caller keeps alive while they are used and then wipes. */
  open(seed: Uint8Array): SeedAddresses;
}

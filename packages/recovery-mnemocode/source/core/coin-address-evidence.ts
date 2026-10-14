// An address of one coin as wallet evidence: whether a BIP39 phrase, with its BIP39 passphrase, is
// the wallet that has the address at an account, branch and index, or among the addresses that
// follow. It takes the coin itself, a Coin of core/coins/, not its name, so that a host builds in
// only the coins it offers: the Dash edition of the Deriver takes core/coins/dash.ts alone, without
// the Bitcoin evidence of core/wallet-evidence.ts or the list of every coin (core/coins.ts), and
// carries no other coin's code or words. wallet-evidence.ts compares its "coin-address" kind here.
//
// From the host it needs PBKDF2-HMAC-SHA512, as core/master-fingerprint.ts takes it, which may
// answer at once (match) or later (matchAsync). It checks one phrase at a time and keeps nothing:
// the seed and every key derived are wiped before it returns.
//
// Host-neutral: it imports only core/master-fingerprint.ts, core/address-scan.ts, the types of
// core/coins/coin.ts and @scure/bip32 (test/portable-modules.test.ts).

import { HDKey } from "@scure/bip32";
import { addressCount, scanBranch, type AddressRange, type KeyMatch } from "./address-scan.js";
import type { AddressLocation, Coin, CoinAddress } from "./coins/coin.js";
import type { WalletMatch } from "./wallet-check.js";
import { Bip39Seed, type Pbkdf2HmacSha512 } from "./master-fingerprint.js";

/** An address of `coin` at `location`, or among `addresses` of them from there (one by default). */
export interface CoinAddressEvidence {
  readonly coin: Coin;
  readonly value: string;
  readonly location: AddressLocation;
  readonly addresses?: number | undefined;
}

/** Whether the wallet has the address, and where: the address in its standard form and its path. */
export interface CoinAddressMatch extends WalletMatch {
  readonly derived?: string;
}

/**
 * The address of one piece of evidence, read and placed once: compared on each path where its
 * coin's wallets put it, by its type and coin types, or DIP17's for Dash Platform. A few places,
 * not a search: a search of phrases compares millions of them. An address that no wallet can
 * have, and a place that no path has, are refused when it is made.
 */
export class CoinAddressComparison {
  /** Whether the address is one of a test network. */
  readonly testnet: boolean;
  readonly #address: CoinAddress;
  readonly #branchPaths: readonly string[];
  readonly #range: AddressRange;

  constructor(evidence: CoinAddressEvidence) {
    this.#address = evidence.coin.parse(evidence.value);
    this.#branchPaths = this.#address.branchPathsAt(evidence.location);
    this.#range = {
      first: evidence.location.index,
      count: addressCount(evidence.addresses, evidence.location.index),
    };
    this.testnet = this.#address.testnet;
  }

  /** The comparison with the wallet whose master key is `root`; every key it derives is wiped. */
  compare(root: HDKey): CoinAddressMatch {
    const address = this.#address;
    const matchOf: KeyMatch = (_node, publicKey) =>
      address.isAddressOf(publicKey) ? address.text : undefined;
    for (const branchPath of this.#branchPaths) {
      const found = scanBranch(root, branchPath, this.#range, matchOf);
      if (found !== undefined) return { matched: true, ...found };
    }
    return { matched: false };
  }
}

/**
 * Compares BIP39 phrases with an address of one coin. A class because the host's PBKDF2 is bound
 * once and every comparison uses it; it holds nothing else.
 */
export class CoinAddressCheck {
  readonly #seed: Bip39Seed;

  constructor(pbkdf2: Pbkdf2HmacSha512) {
    this.#seed = new Bip39Seed(pbkdf2);
  }

  /** Compares a phrase with `evidence`; evidence no wallet can match is refused before the seed. */
  match(mnemonic: string, evidence: CoinAddressEvidence, passphrase = ""): CoinAddressMatch {
    const comparison = new CoinAddressComparison(evidence);
    // A root's version bytes do not enter an address: BIP32's default ones serve every coin.
    return this.#seed.withRoot(mnemonic, passphrase, (root) => comparison.compare(root));
  }

  /** The same as match, with a PBKDF2 that may answer later. */
  async matchAsync(
    mnemonic: string,
    evidence: CoinAddressEvidence,
    passphrase = "",
  ): Promise<CoinAddressMatch> {
    const comparison = new CoinAddressComparison(evidence);
    return this.#seed.withRootLater(mnemonic, passphrase, (root) => comparison.compare(root));
  }
}

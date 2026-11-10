// The public facts of an Ed25519 coin derived by SLIP-10 (../slip10-ed25519.ts): every level of
// its path is hardened, and the row index is one level of it (Solana's account, Stellar's account,
// Hedera's key index). Crypto-free, so that the page's registry and previews read it without the
// derivation runtime.
import { indexRange } from "./registry-base.js";
import { assertPathRange, type PathRange } from "../derivation-path.js";
import { CoinVariant, type CoinVariantFacts } from "./coin-variant.js";

/** A level of the path: a fixed index, or the row index. */
export type Ed25519PathLevel = number | "index";

interface ProfileFacts extends CoinVariantFacts {
  /** The levels of the path below m, each hardened. */
  readonly levels: readonly Ed25519PathLevel[];
}

/** One variant of an Ed25519 coin: its names and its path with the row index in it. */
export class Ed25519CoinProfile extends CoinVariant {
  readonly #levels: readonly Ed25519PathLevel[];

  constructor(facts: ProfileFacts) {
    super(facts);
    this.#levels = Object.freeze([...facts.levels]);
  }

  /** The child indexes of row `index`, each to be hardened. */
  indexes(index: number): number[] {
    return this.#levels.map((level) => (level === "index" ? index : level));
  }

  /** The path of row `index`, such as m/44'/501'/3'/0'. */
  path(index: number): string {
    return this.#text(String(index));
  }

  /** The path with the row range in place of the index, such as m/44'/501'/0…19'/0'. */
  pathPreview(input: PathRange): string {
    assertPathRange(input.start, input.count);
    return this.#text(indexRange(input.start, input.count));
  }

  /** The path's template, with i for the row index. */
  get template(): string {
    return this.#text("i");
  }

  #text(index: string): string {
    const levels = this.#levels.map((level) => `${level === "index" ? index : level}'`);
    return `m/${levels.join("/")}`;
  }
}

// The public facts of a coin that keeps one secp256k1 key per BIP44-style address and differs from
// the others only in its paths and its address form: Litecoin, Dogecoin, Bitcoin Cash, Zcash's
// transparent addresses, XRP, Tron, Ethereum Classic, Cosmos, Injective and Hedera's ECDSA keys.
// Crypto-free, so that the page's registry and its previews read them without the derivation
// runtime.
import { DerivationPathProfile } from "../derivation-path.js";
import { CoinVariant, type CoinVariantFacts } from "./coin-variant.js";

/** How a coin's results are split: Receive and Change tabs, or Ethereum's address branch. */
export type Bip44CoinBranches = "receive-change" | "address-branch";

interface ProfileFacts extends CoinVariantFacts {
  /** What the address pays to, such as "P2WPKH"; empty for a coin without one. */
  readonly outputType: string;
  readonly purpose: number;
  readonly coinType: number;
  readonly branches: Bip44CoinBranches;
}

/** One variant of such a coin: its names and its paths m/purpose'/coin'/account'/branch/index. */
export class Bip44CoinProfile extends CoinVariant {
  readonly #outputType: string;
  /** The BIP43 purpose of the variant's paths: 44, 49 or 84. */
  readonly purpose: number;
  /** The coin type of the variant's paths, such as 144 (SLIP-44). */
  readonly coinType: number;
  readonly branches: Bip44CoinBranches;
  readonly paths: DerivationPathProfile;

  constructor(facts: ProfileFacts) {
    super(facts);
    this.#outputType = facts.outputType;
    this.purpose = facts.purpose;
    this.coinType = facts.coinType;
    this.branches = facts.branches;
    this.paths = new DerivationPathProfile(
      ({ account }) => `m/${facts.purpose}'/${facts.coinType}'/${account}'`,
    );
  }

  /** The adapter's full label, such as "Litecoin Native SegWit · BIP84 / P2WPKH". */
  override get label(): string {
    return this.#outputType === "" ? super.label : `${super.label} / ${this.#outputType}`;
  }

  /** A coin with one profile, m/44'/coinType'/account'/branch/index, as its only variant. */
  static single(
    facts: Pick<ProfileFacts, "adapterId" | "group" | "variantLabel" | "coinType" | "branches"> & {
      readonly outputType?: string;
    },
  ): readonly Bip44CoinProfile[] {
    return Object.freeze([
      new Bip44CoinProfile({ outputType: "", ...facts, purpose: 44, defaultVariant: true }),
    ]);
  }
}

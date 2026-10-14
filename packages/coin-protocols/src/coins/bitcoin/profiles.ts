import { getBitcoinNetwork } from "@ckd/core/networks.js";
import { DerivationPathProfile } from "../../derivation-path.js";

export type BitcoinMode = "legacy" | "nested-segwit" | "native-segwit" | "taproot";
type DescriptorScript = "pkh" | "sh-wpkh" | "wpkh" | "tr";

interface ProfileFacts {
  readonly mode: BitcoinMode;
  readonly purpose: number;
  readonly name: string;
  readonly outputType: string;
  readonly descriptorScript: DescriptorScript;
  readonly defaultVariant?: boolean;
}

/** Public purpose/script metadata shared by previews, derivation and discovery. */
export class BitcoinPurposeProfile {
  readonly #facts: Readonly<ProfileFacts>;
  readonly paths: DerivationPathProfile;

  private constructor(facts: ProfileFacts) {
    this.#facts = Object.freeze(facts);
    this.paths = new DerivationPathProfile(
      ({ network, account }) =>
        `m/${this.purpose}'/${getBitcoinNetwork(network).coinType}'/${account}'`,
    );
  }

  static readonly profiles: readonly BitcoinPurposeProfile[] = Object.freeze([
    new BitcoinPurposeProfile({
      mode: "legacy",
      purpose: 44,
      name: "Legacy",
      outputType: "P2PKH",
      descriptorScript: "pkh",
    }),
    new BitcoinPurposeProfile({
      mode: "nested-segwit",
      purpose: 49,
      name: "Nested SegWit",
      outputType: "P2SH-P2WPKH",
      descriptorScript: "sh-wpkh",
    }),
    new BitcoinPurposeProfile({
      mode: "native-segwit",
      purpose: 84,
      name: "Native SegWit",
      outputType: "P2WPKH",
      descriptorScript: "wpkh",
    }),
    new BitcoinPurposeProfile({
      mode: "taproot",
      purpose: 86,
      name: "Taproot",
      outputType: "P2TR",
      descriptorScript: "tr",
      defaultVariant: true,
    }),
  ]);

  static forMode(mode: BitcoinMode): BitcoinPurposeProfile {
    const profile = this.profiles.find((candidate) => candidate.mode === mode);
    if (profile === undefined) throw new Error(`Unsupported Bitcoin mode: ${String(mode)}.`);
    return profile;
  }

  static forAdapterId(id: string): BitcoinPurposeProfile | undefined {
    return this.profiles.find((profile) => profile.adapterId === id);
  }

  get mode(): BitcoinMode {
    return this.#facts.mode;
  }
  get purpose(): number {
    return this.#facts.purpose;
  }
  get adapterId(): string {
    return `bitcoin-${this.mode}`;
  }
  get label(): string {
    return `${this.#facts.name} · BIP${this.purpose}`;
  }
  get adapterLabel(): string {
    return `${this.label} / ${this.#facts.outputType}`;
  }
  get derivationLabel(): string {
    return `Bitcoin ${this.#facts.name} (BIP${this.purpose} / ${this.#facts.outputType})`;
  }
  get defaultVariant(): boolean {
    return this.#facts.defaultVariant === true;
  }
  get descriptorScript(): DescriptorScript {
    return this.#facts.descriptorScript;
  }

  descriptorForKey(key: string): string {
    return this.descriptorScript === "sh-wpkh"
      ? `sh(wpkh(${key}))`
      : `${this.descriptorScript}(${key})`;
  }
}

export const BITCOIN_PROFILES = BitcoinPurposeProfile.profiles;

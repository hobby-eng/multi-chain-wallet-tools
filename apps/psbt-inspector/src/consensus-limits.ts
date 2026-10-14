import { DESCRIPTOR_FRAGMENTS } from "./descriptor-fragments.js";
import { fragmentBodies, splitTopLevelArguments } from "./balanced-syntax.js";

export const CONSENSUS_LIMITS = Object.freeze({
  absoluteLockTimeThreshold: 500_000_000,
  bip68SequenceMask: 0x0000ffff,
  bip68TypeFlag: 1 << 22,
  bip68DisableFlag: 0x80000000,
  maximumBareMultisigKeys: 3,
  maximumCheckMultisigKeys: 20,
  maximumCheckSigAddKeys: 999,
  maximumScriptElementBytes: 520,
  maximumScriptBytes: 10_000,
  maximumTaprootTreeDepth: 128,
  maximumBip32Depth: 255,
  maximumBitcoinMoney: 21_000_000n * 100_000_000n,
  maximumDashMoney: 21_000_000n * 100_000_000n,
});

/** Seconds of one unit of a time-based BIP68 relative lock. */
const BIP68_SECONDS_PER_UNIT = 512;

/**
 * The facts that BIP68 and BIP112 encode in a relative sequence or a CSV operand: the disable flag,
 * whether the lock counts time or blocks, and its units. What the facts allow is each context's
 * own rule: a raw CSV operand with the disable flag imposes no delay (BIP112), a descriptor's
 * older() refuses it, and a transaction's sequence is a lock only from version 2 on (BIP68).
 */
export class RelativeSequence {
  readonly #value: number;

  constructor(value: number) {
    this.#value = value;
  }

  static get secondsPerUnit(): number {
    return BIP68_SECONDS_PER_UNIT;
  }

  /** Round a requested duration up so the encoded delay is never shorter (BIP68). */
  static fromSeconds(seconds: number): RelativeSequence {
    if (!Number.isSafeInteger(seconds) || seconds < 0)
      throw new Error("Relative time delay must be a non-negative safe integer.");
    const units = Math.ceil(seconds / BIP68_SECONDS_PER_UNIT);
    if (units > CONSENSUS_LIMITS.bip68SequenceMask)
      throw new Error("Relative time delay is too large.");
    return new RelativeSequence(CONSENSUS_LIMITS.bip68TypeFlag | units);
  }

  get value(): number {
    return this.#value;
  }

  get disabled(): boolean {
    return (this.#value & CONSENSUS_LIMITS.bip68DisableFlag) !== 0;
  }

  get timeBased(): boolean {
    return (this.#value & CONSENSUS_LIMITS.bip68TypeFlag) !== 0;
  }

  /** The lock's units: blocks, or 512-second intervals for a time-based lock. */
  get units(): number {
    return this.#value & CONSENSUS_LIMITS.bip68SequenceMask;
  }

  /** The delay of a time-based lock in seconds. */
  get seconds(): number {
    return this.units * BIP68_SECONDS_PER_UNIT;
  }

  /** "144 blocks", "1 block" or "3584 seconds" (a time lock counts 512-second units). */
  get delay(): string {
    if (this.timeBased) return `${this.seconds} seconds`;
    return `${this.units} ${this.units === 1 ? "block" : "blocks"}`;
  }
}

export type ScriptPolicyContext = "bare" | "p2sh" | "p2wsh" | "tapscript";

const splitTopLevel = (text: string): string[] =>
  splitTopLevelArguments(text, { context: "Miniscript expression" });

export function validateMultisigConsensusLimits(
  source: string,
  context: ScriptPolicyContext,
): void {
  for (const name of DESCRIPTOR_FRAGMENTS.names("multisig")) {
    for (const body of fragmentBodies(source, name, "Miniscript expression")) {
      const argumentsList = splitTopLevel(body);
      const threshold = Number(argumentsList[0]);
      const keyCount = Math.max(0, argumentsList.length - 1);
      if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > keyCount) {
        throw new Error(`${name}() threshold must satisfy 1 <= threshold <= ${keyCount}.`);
      }
      const tapscriptMultisig = name.endsWith("_a");
      if (tapscriptMultisig && context !== "tapscript") {
        throw new Error(`${name}() is permitted only inside a Taproot script tree.`);
      }
      if (!tapscriptMultisig && context === "tapscript") {
        throw new Error(
          `${name}() is not permitted in Tapscript; use multi_a() or sortedmulti_a().`,
        );
      }
      const maximum = tapscriptMultisig
        ? CONSENSUS_LIMITS.maximumCheckSigAddKeys
        : context === "bare"
          ? CONSENSUS_LIMITS.maximumBareMultisigKeys
          : CONSENSUS_LIMITS.maximumCheckMultisigKeys;
      if (keyCount > maximum) {
        throw new Error(`${name}() contains ${keyCount} keys; the ${context} limit is ${maximum}.`);
      }
    }
  }
}

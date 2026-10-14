import { CONSENSUS_LIMITS } from "./consensus-limits.js";
import { littleU32, pair, type PsbtPair } from "./psbt-binary.js";

export interface TransactionLocktime {
  readonly value: number;
  readonly fromRequirements: boolean;
}

type RequiredLocktime =
  | { readonly kind: "none" | "incompatible" }
  | { readonly kind: "height" | "time"; readonly value: number };

/** BIP370 input requirements, shared by schema validation and the signing summary. */
export class PsbtV2Locktime {
  readonly #required: RequiredLocktime;

  constructor(inputs: readonly (readonly PsbtPair[])[]) {
    this.#required = PsbtV2Locktime.#requirements(inputs);
  }

  get compatible(): boolean {
    return this.#required.kind !== "incompatible";
  }

  /** The fallback applies only without requirements; incompatible units have no solution. */
  resolve(fallback: number): TransactionLocktime | null {
    switch (this.#required.kind) {
      case "none":
        return { value: fallback, fromRequirements: false };
      case "incompatible":
        return null;
      default:
        return { value: this.#required.value, fromRequirements: true };
    }
  }

  static #requirements(inputs: readonly (readonly PsbtPair[])[]): RequiredLocktime {
    let anyRequirement = false;
    let heightPossible = true;
    let timePossible = true;
    let maximumHeight = 0;
    let maximumTime = 0;
    for (const input of inputs) {
      const time = pair(input, 0x11)?.value;
      const height = pair(input, 0x12)?.value;
      // An input without requirements permits either unit; two fields are alternatives.
      if (time === undefined && height === undefined) continue;
      anyRequirement = true;
      if (time === undefined) timePossible = false;
      else {
        const value = littleU32(time, "time lock");
        if (value < CONSENSUS_LIMITS.absoluteLockTimeThreshold)
          throw new Error("Required time lock is below 500000000.");
        maximumTime = Math.max(maximumTime, value);
      }
      if (height === undefined) heightPossible = false;
      else {
        const value = littleU32(height, "height lock");
        if (value === 0 || value >= CONSENSUS_LIMITS.absoluteLockTimeThreshold)
          throw new Error("Required height lock is outside 1..499999999.");
        maximumHeight = Math.max(maximumHeight, value);
      }
    }
    if (!anyRequirement) return { kind: "none" };
    // BIP370 requires height to win when both units are possible, even with a time fallback.
    if (heightPossible) return { kind: "height", value: maximumHeight };
    if (timePossible) return { kind: "time", value: maximumTime };
    return { kind: "incompatible" };
  }
}

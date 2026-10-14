export interface SskrGroupSpec {
  readonly threshold: number;
  readonly count: number;
}

interface SskrGroupValidationOptions {
  readonly label: "SSKR" | "Envelope SSKR";
  readonly allowEmpty: boolean;
}

// BCR-2020-011 stores each group/member index in a four-bit field.
const SSKR_INDEX_BITS = 4;
const GROUP_PARAMETERS = Object.freeze({
  minimum: 1,
  maximumGroups: 1 << SSKR_INDEX_BITS,
  maximumMembers: 1 << SSKR_INDEX_BITS,
});

/** An admitted two-level policy and the protocol limits that every editor uses. */
export class SskrGroupPolicy {
  readonly #groupThreshold: number;
  readonly #packed: Uint8Array;

  static parameters(): typeof GROUP_PARAMETERS {
    return GROUP_PARAMETERS;
  }

  constructor(
    groupThreshold: number | undefined,
    groups: readonly SskrGroupSpec[],
    options: SskrGroupValidationOptions = { label: "SSKR", allowEmpty: false },
  ) {
    const { minimum, maximumGroups, maximumMembers } = GROUP_PARAMETERS;
    if (
      groups.length === 0 &&
      options.allowEmpty &&
      (groupThreshold === undefined || groupThreshold === 0)
    ) {
      this.#groupThreshold = 0;
      this.#packed = new Uint8Array();
      return;
    }
    if (
      !Number.isSafeInteger(groupThreshold) ||
      groupThreshold === undefined ||
      groupThreshold < minimum ||
      groupThreshold > groups.length
    ) {
      throw new Error(
        `${options.label} groups required must be an integer from ${minimum} through the number of groups.`,
      );
    }
    if (groups.length < minimum || groups.length > maximumGroups) {
      throw new Error(
        options.label === "SSKR"
          ? `SSKR requires from ${minimum} to ${maximumGroups} groups.`
          : `Envelope SSKR supports at most ${maximumGroups} groups.`,
      );
    }
    for (const [index, group] of groups.entries()) {
      if (
        !Number.isSafeInteger(group.threshold) ||
        !Number.isSafeInteger(group.count) ||
        group.threshold < minimum ||
        group.count < minimum ||
        group.threshold > group.count ||
        group.count > maximumMembers
      ) {
        throw new Error(
          `${options.label} group ${index + 1} must use an integer threshold/count from ${minimum} to ${maximumMembers}.`,
        );
      }
    }
    this.#groupThreshold = groupThreshold;
    this.#packed = Uint8Array.from(groups.flatMap((group) => [group.threshold, group.count]));
  }

  get groupThreshold(): number {
    return this.#groupThreshold;
  }

  /** A caller-owned WASM input; mutating it cannot change the admitted policy. */
  pack(): Uint8Array {
    return this.#packed.slice();
  }
}

/** Compatibility entry for Envelope and existing library callers. */
export function validateSskrGroups(
  groupThreshold: number | undefined,
  groups: readonly SskrGroupSpec[],
  options: SskrGroupValidationOptions,
): Uint8Array {
  return new SskrGroupPolicy(groupThreshold, groups, options).pack();
}

import { CheckedSskrBridge } from "../../recovery-mnemocode/source/sskr/bridge.js";
import { ErrorCatalog } from "../../recovery-mnemocode/source/core/error-catalog.js";
import { errorCode } from "../../recovery-mnemocode/source/core/refusal.js";
import {
  MAX_GROUPS,
  MAX_GROUP_MEMBERS,
  MIN_RECORDED_THRESHOLD,
} from "../../recovery-mnemocode/source/sskr/share-layout.js";

/** A member quorum, captured once before any narrowing to WASM bytes. */
export interface SskrGroupSpec {
  readonly threshold: number;
  readonly count: number;
}

interface SskrGroupValidationOptions {
  readonly label: "SSKR" | "Envelope SSKR";
  readonly allowEmpty: boolean;
}

const GROUP_PARAMETERS = Object.freeze({
  minimum: MIN_RECORDED_THRESHOLD,
  maximumGroups: MAX_GROUPS,
  maximumMembers: MAX_GROUP_MEMBERS,
});
const ERRORS = new ErrorCatalog("sskr.groups", {
  "group-threshold": (label: string) =>
    `${label} groups required must be an integer from ${GROUP_PARAMETERS.minimum} through the number of groups.`,
  "group-count": (label: string) =>
    label === "SSKR"
      ? `SSKR requires from ${GROUP_PARAMETERS.minimum} to ${GROUP_PARAMETERS.maximumGroups} groups.`
      : `Envelope SSKR supports at most ${GROUP_PARAMETERS.maximumGroups} groups.`,
  "member-quorum": (label: string, index: number) =>
    `${label} group ${index + 1} must use an integer threshold/count from ${GROUP_PARAMETERS.minimum} to ${GROUP_PARAMETERS.maximumMembers}.`,
});

/** An admitted two-level policy and the protocol limits that every editor uses. */
export class SskrGroupPolicy {
  readonly #groupThreshold: number;
  readonly #packed: Uint8Array;

  /** Protocol limits shared by every group editor. */
  static parameters(): typeof GROUP_PARAMETERS {
    return GROUP_PARAMETERS;
  }

  constructor(
    groupThreshold: number | undefined,
    groups: readonly SskrGroupSpec[],
    options: SskrGroupValidationOptions = { label: "SSKR", allowEmpty: false },
  ) {
    const { minimum, maximumGroups } = GROUP_PARAMETERS;
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
      throw ERRORS.create("group-threshold", [options.label]);
    }
    if (groups.length < minimum || groups.length > maximumGroups) {
      throw ERRORS.create("group-count", [options.label]);
    }
    const specifications = groups.map((group, index) => {
      const { threshold, count } = group;
      try {
        return CheckedSskrBridge.groupSpecifications(threshold, count);
      } catch (cause) {
        if (errorCode(cause) !== "sskr.bridge.member-quorum") throw cause;
        throw ERRORS.create("member-quorum", [options.label, index], { cause });
      }
    });
    this.#groupThreshold = groupThreshold;
    this.#packed = Uint8Array.from(specifications.flatMap((group) => [...group]));
  }

  /** The admitted number of groups needed to restore the secret. */
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

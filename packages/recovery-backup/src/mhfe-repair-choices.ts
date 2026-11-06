import type { MhfeParameters } from "@ckd/recovery-mhfe-wasm/core/client.js";

/** A repair count from the producer's public parameter contract. */
export type MhfeRepairWordCount = MhfeParameters["repairWordCounts"][number];
const NO_REPAIR_WORDS = 0;
const CHOICE_REFUSAL = "Select one of the offered repair-word choices.";

/** Stable refusal of an absent or unsupported repair-word choice. */
export class MhfeRepairChoiceError extends Error {
  readonly code = "mhfe.repair.choice";
  constructor() {
    super(CHOICE_REFUSAL);
    this.name = "MhfeRepairChoiceError";
  }
}

/** Reads the producer's choices without maintaining a second list of permitted counts. */
export class MhfeRepairChoices {
  readonly #counts: readonly MhfeRepairWordCount[];
  constructor(parameters: Pick<MhfeParameters, "repairWordCounts">) {
    this.#counts = [...parameters.repairWordCounts];
  }

  /** An explicit positive count, from a raw radio value or a numeric library caller. */
  required(value: unknown): MhfeRepairWordCount {
    const count = this.#counts.find((count) => value === count || value === String(count));
    if (count === undefined) throw new MhfeRepairChoiceError();
    return count;
  }

  /** A permitted count or the explicit no-repair choice; absence never becomes zero. */
  optional(value: unknown): typeof NO_REPAIR_WORDS | MhfeRepairWordCount {
    return value === NO_REPAIR_WORDS || value === String(NO_REPAIR_WORDS)
      ? NO_REPAIR_WORDS
      : this.required(value);
  }
}

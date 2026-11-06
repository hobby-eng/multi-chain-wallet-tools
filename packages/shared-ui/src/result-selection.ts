/** Explicit choices offered by both the original and BIP85 child result workspaces. */
export type ResultSelectionChoice = "all" | "none" | "invert";

/** The common selection rule over known result indexes; unknown selected indexes never leak in. */
export class ResultSelection {
  /** Return a fresh selection without mutating the borrowed indexes or previous selection. */
  static choose(
    choice: ResultSelectionChoice,
    indexes: readonly number[],
    selected: ReadonlySet<number> = new Set(),
  ): Set<number> {
    return new Set(
      indexes.filter((index) => choice === "all" || (choice === "invert" && !selected.has(index))),
    );
  }
}

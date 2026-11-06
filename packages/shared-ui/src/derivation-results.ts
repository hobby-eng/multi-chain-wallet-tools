import type { DerivationResult, DisplayMode } from "@ckd/core/types.js";
import { clearDerivationResult, DerivationSecrets } from "@ckd/core/secrets.js";
import type { ResultBranch } from "@ckd/coins/derivation-branches.js";
import { ResultSelection, type ResultSelectionChoice } from "./result-selection.js";

/** Read-only branch state borrowed by a renderer; private text views belong to result byte owners. */
export interface BranchResultState {
  readonly result: DerivationResult;
  readonly selected: ReadonlySet<number>;
  readonly windowStart: number;
}

interface StoredBranch {
  result: DerivationResult;
  selected: Set<number>;
  windowStart: number;
}

const BRANCH_MISSING = "derivation.results.branch-missing";
const MUTATING = "derivation.results.mutating";

/** A missing branch or reentrant transfer cannot acquire this workspace's result ownership. */
export class DerivationResultsError extends Error {
  /** Stable invariant/refusal identity without wallet material. */
  readonly code: typeof BRANCH_MISSING | typeof MUTATING;

  /** Refuse an unavailable branch or a transfer attempted during a synchronous mutation. */
  constructor(code: typeof BRANCH_MISSING | typeof MUTATING = BRANCH_MISSING) {
    super(code);
    this.code = code;
    this.name = "DerivationResultsError";
  }
}

/** Owns result branches, independent selection/paging and retirement of their private text owners. */
export class DerivationResults {
  readonly #branches = new Map<ResultBranch, StoredBranch>();
  readonly #emptySelection = new Set<number>();
  #active: ResultBranch = "receive";
  #coinJoin: "coinjoin-external" | "coinjoin-internal" = "coinjoin-external";
  #mode: DisplayMode = "basic";
  #mutating = false;

  /** Borrow the displayed branch's result until the next wipe/replacement. */
  get current(): DerivationResult | null {
    return this.#branches.get(this.#active)?.result ?? null;
  }

  /** Display identity of the active branch. */
  get active(): ResultBranch {
    return this.#active;
  }

  /** Display mode survives changes to the selected wallet. */
  get mode(): DisplayMode {
    return this.#mode;
  }

  /** Borrow the current selection; mutations go through this owner's methods. */
  get selected(): ReadonlySet<number> {
    return this.#branches.get(this.#active)?.selected ?? this.#emptySelection;
  }

  /** Zero-based first displayed row offset of the current branch. */
  get windowStart(): number {
    return this.#branches.get(this.#active)?.windowStart ?? 0;
  }

  /** Branch-state projections for rendering; assigning a projected property cannot change the owner. */
  get states(): ReadonlyMap<ResultBranch, BranchResultState> {
    return new Map([...this.#branches].map(([branch, state]) => [branch, { ...state }]));
  }

  /** Number of branches currently retained. */
  get size(): number {
    return this.#branches.size;
  }

  /** Number of derived rows retained across all branches. */
  get generated(): number {
    return [...this.#branches.values()].reduce((sum, state) => sum + state.result.rows.length, 0);
  }

  /** Last viewed available CoinJoin branch, falling back to whichever branch was derived. */
  get coinJoinBranch(): ResultBranch {
    return this.#branches.has(this.#coinJoin)
      ? this.#coinJoin
      : this.#branches.has("coinjoin-external")
        ? "coinjoin-external"
        : "coinjoin-internal";
  }

  /** Transfer a result into this workspace; its rows start selected with the first page open. */
  accept(branch: ResultBranch, result: DerivationResult): void {
    if (this.#mutating) {
      // Refuse the new transfer only after closing its incoming private lifetime.
      try {
        DerivationSecrets.take(result);
      } finally {
        clearDerivationResult(result);
      }
      throw new DerivationResultsError(MUTATING);
    }
    this.#mutating = true;
    try {
      DerivationSecrets.take(result);
      const previous = this.#branches.get(branch);
      if (previous !== undefined && previous.result !== result) {
        this.#branches.delete(branch);
        previous.selected.clear();
        try {
          clearDerivationResult(previous.result);
        } catch (cause) {
          clearDerivationResult(result);
          throw cause;
        }
      }
      this.#branches.set(branch, {
        result,
        selected: new Set(result.rows.map((row) => row.index)),
        windowStart: 0,
      });
    } finally {
      this.#mutating = false;
    }
  }

  /** Select an existing branch, retaining the previous branch's selection and page. */
  activate(branch: ResultBranch): boolean {
    if (!this.#branches.has(branch)) return false;
    this.#active = branch;
    if (branch === "coinjoin-external" || branch === "coinjoin-internal") this.#coinJoin = branch;
    return true;
  }

  /** Add already appended streaming rows to their branch's selection; missing branches fail. */
  appendSelection(branch: ResultBranch, rows: readonly { readonly index: number }[]): void {
    const state = this.#branches.get(branch);
    if (state === undefined) throw new DerivationResultsError();
    for (const row of rows) state.selected.add(row.index);
  }

  /** Select or deselect a row in the current branch. */
  select(index: number, checked: boolean): void {
    const state = this.#branches.get(this.#active);
    if (state === undefined) return;
    if (checked) state.selected.add(index);
    else state.selected.delete(index);
  }

  /** Replace the current branch's selection by all, none, or the inverse of its known rows. */
  selectRows(choice: ResultSelectionChoice): void {
    const state = this.#branches.get(this.#active);
    if (state === undefined) return;
    state.selected = ResultSelection.choose(
      choice,
      state.result.rows.map((row) => row.index),
      state.selected,
    );
  }

  /** Record navigation for the active branch; the renderer owns clamping to a valid page. */
  moveWindow(start: number): void {
    const state = this.#branches.get(this.#active);
    if (state !== undefined) state.windowStart = start;
  }

  /** Change display mode and return the active branch to its first page. */
  setMode(mode: DisplayMode): void {
    this.#mode = mode;
    this.moveWindow(0);
  }

  /** Forget CoinJoin tab preference on a protocol change or Clear all. */
  resetCoinJoin(): void {
    this.#coinJoin = "coinjoin-external";
  }

  /** Wipe owned private bytes and mutable containers; native immutable views cannot be recalled. */
  wipe(): void {
    if (this.#mutating) throw new DerivationResultsError(MUTATING);
    this.#mutating = true;
    const states = [...this.#branches.values()];
    this.#branches.clear();
    this.#active = "receive";
    for (const state of states) state.selected.clear();
    try {
      DerivationSecrets.clearAll(states.map((state) => state.result));
    } finally {
      this.#mutating = false;
    }
  }

  /** Release retained result data at the end of the workspace lifetime. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}

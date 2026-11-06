import { isTabKey, tabIndexAfter } from "@ckd/ui/tabs.js";
import type { ResultBranch } from "./result-branches.js";

/** Parent result tabs; CoinJoin retains its own external/internal sub-selection. */
export type TopLevelResultTab = "receive" | "change" | "coinjoin";

interface ResultTabNavigationOptions {
  topLevel: ReadonlyArray<readonly [HTMLButtonElement, TopLevelResultTab]>;
  coinJoinBranches: ReadonlyArray<
    readonly [HTMLButtonElement, Extract<ResultBranch, `coinjoin-${string}`>]
  >;
  activateTopLevel(tab: TopLevelResultTab): void;
  activateBranch(branch: ResultBranch): void;
  branchEnabled(branch: ResultBranch): boolean;
  focusBranch(branch: ResultBranch): void;
}

/** Owns pointer/keyboard bindings and calls each supplied method with its owning options object. */
export class ResultTabNavigation {
  readonly #options: ResultTabNavigationOptions;
  constructor(options: ResultTabNavigationOptions) {
    this.#options = options;
    for (const [button, tab] of options.topLevel) {
      button.addEventListener("click", () => options.activateTopLevel(tab));
      button.addEventListener("keydown", (event) => this.#moveTop(button, event));
    }
    for (const [button, branch] of options.coinJoinBranches) {
      button.addEventListener("click", () => options.activateBranch(branch));
      button.addEventListener("keydown", (event) => this.#moveBranch(event));
    }
  }
  #moveTop(button: HTMLButtonElement, event: KeyboardEvent): void {
    if (!isTabKey(event.key)) return;
    event.preventDefault();
    const visible = this.#options.topLevel.filter(([candidate]) => !candidate.hidden);
    if (visible.length === 0) return;
    const current = visible.findIndex(([candidate]) => candidate === button);
    const index = tabIndexAfter(event.key, current, visible.length);
    const next = index === undefined ? undefined : visible[index];
    if (next === undefined || next[0].disabled) return;
    this.#options.activateTopLevel(next[1]);
    next[0].focus();
  }
  #moveBranch(event: KeyboardEvent): void {
    if (!isTabKey(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "ArrowLeft" || event.key === "Home" ? "coinjoin-external" : "coinjoin-internal";
    if (!this.#options.branchEnabled(next)) return;
    this.#options.activateBranch(next);
    this.#options.focusBranch(next);
  }
}

/** Compatibility installer; the class retains its own bindings through native listeners. */
export function installResultTabNavigation(options: ResultTabNavigationOptions): void {
  new ResultTabNavigation(options);
}

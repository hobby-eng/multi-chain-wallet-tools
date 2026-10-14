import { isTabKey, tabIndexAfter } from "@ckd/ui/tabs.js";
import type { ResultBranch } from "./result-branches.js";

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

/** Keyboard and pointer navigation shared by all result-tab layouts. */
export function installResultTabNavigation(options: ResultTabNavigationOptions): void {
  const {
    topLevel,
    coinJoinBranches,
    activateTopLevel,
    activateBranch,
    branchEnabled,
    focusBranch,
  } = options;
  for (const [button, tab] of topLevel) {
    button.addEventListener("click", () => activateTopLevel(tab));
    button.addEventListener("keydown", (event) => {
      if (!isTabKey(event.key)) return;
      event.preventDefault();
      const visible = topLevel.filter(([candidate]) => !candidate.hidden);
      if (visible.length === 0) return;
      const currentIndex = visible.findIndex(([candidate]) => candidate === button);
      const next = visible[tabIndexAfter(event.key, currentIndex, visible.length)!];
      if (next === undefined || next[0].disabled) return;
      activateTopLevel(next[1]);
      next[0].focus();
    });
  }

  for (const [button, branch] of coinJoinBranches) {
    button.addEventListener("click", () => activateBranch(branch));
    button.addEventListener("keydown", (event) => {
      if (!isTabKey(event.key)) return;
      event.preventDefault();
      const next =
        event.key === "ArrowLeft" || event.key === "Home"
          ? "coinjoin-external"
          : "coinjoin-internal";
      if (!branchEnabled(next)) return;
      activateBranch(next);
      focusBranch(next);
    });
  }
}

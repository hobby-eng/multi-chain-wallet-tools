import type { ResultBranch } from "@ckd/coins/derivation-branches.js";

export type { ResultBranch, ResultBranchPlan } from "@ckd/coins/derivation-branches.js";

/** Top-level result tab a branch belongs to. CoinJoin's two branches share one tab. */
type ResultBranchGroup = "receive" | "change" | "coinjoin";

export type { BranchResultState } from "@ckd/ui/derivation-results.js";

export function resultBranchGroup(branch: ResultBranch): ResultBranchGroup {
  return branch === "coinjoin-external" || branch === "coinjoin-internal" ? "coinjoin" : branch;
}

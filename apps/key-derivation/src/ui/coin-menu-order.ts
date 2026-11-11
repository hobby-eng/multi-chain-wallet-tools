// The Deriver's coin lists that MHFE and MnemoCode name, in the order of the Coin menu: by the names
// they show, with this build's rule (compareCoinNames of its registry). A Multi-Chain build puts
// Bitcoin first, then the rest alphabetically (coin-order.ts), coins outside the build too; the
// Dash Community Edition, whose lists hold Dash alone, keeps them as they are and names no other coin.
import { compareCoinNames } from "@ckd/coins/registry.js";

/** `items` in the Coin menu's order, by the names they show. */
export function inCoinMenuOrder<Item>(
  items: readonly Item[],
  name: (item: Item) => string,
): Item[] {
  return [...items].sort((first, second) => compareCoinNames(name(first), name(second)));
}

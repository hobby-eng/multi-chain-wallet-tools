// The order of every coin list of the tools (owner, 2026-11-11): Bitcoin first, then the other
// coins alphabetically by the names the list shows. One rule for the Deriver's coin menus, the
// Scanner's coin menu and picker, the Viewer's coin menu and the protocol lines that name coins, so
// that a new coin takes its place by itself.

/** The coin every list names first. */
const FIRST_COIN = "Bitcoin";

/**
 * Compares two coin names as the lists order them: Bitcoin first, then English alphabetical order
 * without regard to case or accents. The name of a group of coins, such as "EVM networks", takes
 * its place among the names in the same way.
 */
export function compareCoinNames(first: string, second: string): number {
  if (first === second) return 0;
  if (first === FIRST_COIN) return -1;
  if (second === FIRST_COIN) return 1;
  return first.localeCompare(second, "en", { sensitivity: "base" });
}

/**
 * `coins` in list order. A coin with a group stands in it: the groups and the coins without one
 * are ordered by their names, the group that holds Bitcoin first, and the coins of a group follow
 * one another, ordered by their own names. Coins of equal name keep their given order.
 */
export function orderCoins<Coin>(
  coins: readonly Coin[],
  name: (coin: Coin) => string,
  group: (coin: Coin) => string | undefined = () => undefined,
): Coin[] {
  const place = (coin: Coin): string => group(coin) ?? name(coin);
  const firstPlaces = new Set(
    coins.filter((coin) => name(coin) === FIRST_COIN).map((coin) => place(coin)),
  );
  const comparePlaces = (first: string, second: string): number =>
    firstPlaces.has(first) === firstPlaces.has(second)
      ? compareCoinNames(first, second)
      : firstPlaces.has(first)
        ? -1
        : 1;
  return [...coins].sort(
    (first, second) =>
      comparePlaces(place(first), place(second)) || compareCoinNames(name(first), name(second)),
  );
}

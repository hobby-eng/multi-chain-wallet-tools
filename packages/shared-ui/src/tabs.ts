// The tabs of a tab list (WAI-ARIA tabs pattern): the selected one is marked and is the only one
// Tab reaches; the arrows move to the neighbour, wrapping round, Home and End to the first and the
// last.

/** The keys a tab list answers. */
const TAB_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

/** Whether `key` moves between tabs. */
export function isTabKey(key: string): boolean {
  return TAB_KEYS.has(key);
}

/**
 * The index of the tab that `key` moves to from the tab at `current` among `count`; undefined for a
 * key that does not move between tabs.
 */
export function tabIndexAfter(key: string, current: number, count: number): number | undefined {
  if (!isTabKey(key) || count === 0) return undefined;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return (current + (key === "ArrowRight" ? 1 : -1) + count) % count;
}

/** Marks a tab selected or not: its look, its ARIA state, and whether Tab reaches it. */
export function markTab(tab: HTMLElement, active: boolean): void {
  tab.classList.toggle("active", active);
  tab.setAttribute("aria-selected", String(active));
  tab.tabIndex = active ? 0 : -1;
}

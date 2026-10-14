export const DASH_WATCH_ONLY_PREFIX_COINS: Readonly<Record<string, string>> = {
  "dash-core-xpub": "dash",
  "dash-descriptor": "dash",
  "dash-legacy-xpub": "dash",
  "dash-coinjoin-xpub": "dash",
  "dash-platform-xpub": "dash",
  identity: "dash",
  "orchard-fvk": "dash",
  "orchard-ivk": "dash",
  "orchard-ovk": "dash",
};

const XPUB_DEPTHS = [3, 4, 5] as const;

/** Accepted xpub levels for the default watch-only profile. */
export class WatchOnlyDepthPolicy {
  static supported(): readonly number[] {
    return XPUB_DEPTHS;
  }

  static through(maximum: number): readonly number[] {
    return XPUB_DEPTHS.filter((depth) => depth <= maximum);
  }
}

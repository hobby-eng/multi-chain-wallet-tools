// Helpers of the selective-build composition tests (selective-composition*.test.mjs and
// coin-module-composition.test.mjs): a build's selected coins and features as the composition
// reads them, and the source a composition plugin generates for a module.

/** The selection of `coins` and `features`, as parseToolFeatureOptions returns it. */
export const options = (coins, features = []) => ({
  coins,
  hasCoin: (coin) => coins.includes(coin),
  has: (feature) => features.includes(feature),
});

/** The source that a composition plugin (`plugin`) loads for the module `path`. */
export function composedSource(plugin, path) {
  let load;
  plugin.setup({
    onResolve() {},
    onLoad(_filter, callback) {
      load = callback;
    },
  });
  return load({ path }).contents;
}

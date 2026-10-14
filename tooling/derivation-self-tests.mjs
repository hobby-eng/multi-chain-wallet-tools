// The derivation self-test of each coin, as the build composition imports it: the function and the
// module that holds the coin's vectors. One list for every tool that a build composes with fewer
// coins, so that an edition carries exactly the checks of its own coins.

/** coin → [exported function, module from the repository root]. */
export const DERIVATION_SELF_TESTS = Object.freeze({
  bitcoin: [
    "runBitcoinDerivationSelfTest",
    "packages/verification/src/derivation-self-test-bitcoin.ts",
  ],
  dash: ["runDashDerivationSelfTest", "packages/verification/src/derivation-self-test-dash.ts"],
  ethereum: [
    "runEthereumDerivationSelfTest",
    "packages/verification/src/derivation-self-test-ethereum.ts",
  ],
});

/** The module that runs several self-tests as one report. */
export const COMBINED_SELF_TEST_MODULE = "packages/verification/src/helpers.ts";

const localSearchModules = [
  "packages/verification/src/local-search-self-test.ts",
  "packages/wallet-recovery/src/local-search-self-test.ts",
];

/** Quick local-search checks; full suites already rerun their startup checks. */
export const LOCAL_SEARCH_SELF_TEST = Object.freeze({
  symbol: "runLocalSearchSelfTest",
  module: localSearchModules[0],
  // Graph inputs may be absolute or repository-relative; omit their leading packages component.
  sourceMarkers: Object.freeze(localSearchModules.map((file) => file.slice(file.indexOf("/")))),
});

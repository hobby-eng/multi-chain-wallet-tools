// Runs the AUD-019 harness tests with the repository's own aliases and settings, so that they
// call the production modules exactly as the repository's tests do.
//
// Usage: pnpm exec vitest run --config docs/audits/AUD-019-harnesses/vitest.config.mjs
import repositoryConfig from "../../../vitest.config.ts";

// A plain spread, not mergeConfig: mergeConfig would append to the repository's include list
// and run every repository test as well.
export default {
  ...repositoryConfig,
  test: {
    ...repositoryConfig.test,
    include: ["docs/audits/AUD-019-harnesses/**/*.audit.test.ts"],
    // The statistical probes draw tens of thousands of phrases.
    testTimeout: 120_000,
  },
};

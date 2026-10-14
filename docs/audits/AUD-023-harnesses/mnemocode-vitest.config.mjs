// AUD-023 (mnemocode reviewer): the repository's Vitest configuration, limited to this reviewer's
// audit tests, one file at a time.
import repositoryConfig from "../../../vitest.config.ts";

export default {
  ...repositoryConfig,
  test: {
    ...repositoryConfig.test,
    include: ["docs/audits/AUD-023-harnesses/mnemocode-*.audit.test.ts"],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 120_000,
  },
};

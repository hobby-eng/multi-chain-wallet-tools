// AUD-023 selftests: the repository's Vitest configuration (aliases, defines), limited to this
// reviewer's harness file, one worker.
import repositoryConfig from "../../../vitest.config.ts";

export default {
  ...repositoryConfig,
  test: {
    ...repositoryConfig.test,
    include: ["docs/audits/AUD-023-harnesses/selftests-mutations.test.ts"],
    maxWorkers: 1,
    fileParallelism: false,
  },
};

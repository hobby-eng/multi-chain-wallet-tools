import repositoryConfig from "../../../vitest.config.ts";

export default {
  ...repositoryConfig,
  test: {
    ...repositoryConfig.test,
    include: ["docs/audits/AUD-022-harnesses/mnemocode-*.audit.test.ts"],
    maxWorkers: 1,
    fileParallelism: false,
  },
};

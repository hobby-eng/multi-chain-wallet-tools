// AUD-026 security reviewer: runs only this reviewer's audit tests, one file at a time, with the
// repository's own aliases and defines (multi-chain edition, as the repository's Vitest runs).
import repositoryConfig from "../../../vitest.config.ts";

export default {
  ...repositoryConfig,
  test: {
    ...repositoryConfig.test,
    include: ["docs/audits/AUD-026-harnesses/security-*.audit.test.ts"],
    maxWorkers: 1,
    fileParallelism: false,
  },
};

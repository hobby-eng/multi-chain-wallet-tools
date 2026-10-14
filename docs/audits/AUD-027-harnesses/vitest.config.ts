import { defineConfig } from "vitest/config";
import base from "../../../vitest.config.js";

// Override the include list rather than combining it with the repository's broad test globs.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["docs/audits/AUD-027-harnesses/*.test.ts"],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 3_000,
  },
});

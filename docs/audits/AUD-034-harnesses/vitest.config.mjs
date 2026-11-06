import { defineConfig } from "vitest/config";
import base from "../../../vitest.config.ts";

export default defineConfig({
  ...base,
  test: { ...base.test, include: ["docs/audits/AUD-034-harnesses/*.test.mjs"], maxWorkers: 1, fileParallelism: false, testTimeout: 3000 },
});

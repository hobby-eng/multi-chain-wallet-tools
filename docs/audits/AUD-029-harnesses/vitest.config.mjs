import { defineConfig, mergeConfig } from "vitest/config";
import baseline from "../../../vitest.config.ts";

// Reuse the original recipient/quorum controls unchanged with production regressions.
export default mergeConfig(
  baseline,
  defineConfig({
    test: {
      include: [...baseline.test.include, "docs/audits/AUD-028-harnesses/envelope-probe.test.ts"],
      maxWorkers: 1,
    },
  }),
);

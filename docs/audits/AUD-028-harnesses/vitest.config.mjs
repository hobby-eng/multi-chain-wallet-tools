import { defineConfig, mergeConfig } from "vitest/config";
import baseline from "../../../vitest.config.ts";

// Reuse product aliases but discover only this audit's bounded probes.
export default mergeConfig(
  baseline,
  defineConfig({
    test: {
      include: ["docs/audits/AUD-028-harnesses/*-probe.test.ts"],
      maxWorkers: 1,
      testTimeout: 5000,
    },
  }),
);

// AUD-026 functional reviewer: runs this folder's functional-*.test.ts harnesses with the
// repository's own aliases, so that they import the production modules exactly as the unit tests do.
import { defineConfig, mergeConfig } from "vitest/config";
import base from "../../../vitest.config.ts";

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["docs/audits/AUD-026-harnesses/functional-*.test.ts"],
      root: new URL("../../../", import.meta.url).pathname,
    },
  }),
  false,
);

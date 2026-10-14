import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import tsconfig from "./tsconfig.json" with { type: "json" };

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  define: {
    __DASH_COMMUNITY__: "false",
  },
  resolve: {
    alias: [
      // This is an explicit test implementation, not a product path alias.
      { find: "btcutil-js-wasm", replacement: `${root}test/support/btcutil-wasm.ts` },
      ...Object.entries(tsconfig.compilerOptions.paths).map(([name, targets]) => {
        const target = targets[0]!;
        const wildcard = name.includes("*");
        if (!wildcard) return { find: name, replacement: `${root}${target.slice(2)}` };
        const source = /\/(?:src|support)\//u.test(target);
        const prefix = name.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
        return {
          find: new RegExp(`^${prefix}(.+)${source ? "\\.js" : ""}$`, "u"),
          replacement: `${root}${target.slice(2).replace("*", source ? "$1.ts" : "$1")}`,
        };
      }),
    ],
  },
  test: {
    environment: "node",
    // Official-vector and large descriptor suites are CPU-heavy under full parallel CI.
    testTimeout: 20_000,
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts", "tooling/**/*.test.mjs"],
    coverage: {
      include: ["packages/crypto-core/src/**/*.ts", "packages/coin-protocols/src/**/*.ts"],
    },
  },
});

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  define: {
    __DASH_COMMUNITY__: 'false',
  },
  resolve: {
    alias: [
      { find: /^@ckd\/core\/(.+)\.js$/u, replacement: `${root}packages/crypto-core/src/$1.ts` },
      { find: /^@ckd\/coins\/(.+)\.js$/u, replacement: `${root}packages/coin-protocols/src/coins/$1.ts` },
      { find: /^@ckd\/export\/(.+)\.js$/u, replacement: `${root}packages/export-core/src/$1.ts` },
      { find: /^@ckd\/dash-network\/(.+)\.js$/u, replacement: `${root}packages/dash-network/src/$1.ts` },
      {
        find: /^@ckd\/public-data-providers\/(.+)\.js$/u,
        replacement: `${root}packages/public-data-providers/src/$1.ts`,
      },
      { find: /^@ckd\/secret-boundary\/(.+)\.js$/u, replacement: `${root}packages/secret-boundary/src/$1.ts` },
      { find: /^@ckd\/network-boundary\/(.+)\.js$/u, replacement: `${root}packages/network-boundary/src/$1.ts` },
      { find: /^@ckd\/ui\/(.+)\.js$/u, replacement: `${root}packages/shared-ui/src/$1.ts` },
      { find: /^@ckd\/secret-vault\/(.+)\.js$/u, replacement: `${root}packages/secret-vault/src/$1.ts` },
      { find: /^@ckd\/recovery\/(.+)\.js$/u, replacement: `${root}packages/wallet-recovery/src/$1.ts` },
      { find: /^@ckd\/dash-wasm\/(.+)$/u, replacement: `${root}packages/dash-shielded-wasm/generated/$1` },
      { find: /^@ckd\/test-support\/(.+)\.js$/u, replacement: `${root}test/support/$1.ts` },
      { find: '@ckd/build-info', replacement: `${root}packages/build-security/src/build-info.ts` },
      { find: '@ckd/self-test', replacement: `${root}packages/verification/src/self-test.ts` },
      { find: '@ckd/self-test-types', replacement: `${root}packages/verification/src/types.ts` },
      { find: '@ckd/bip39-self-test', replacement: `${root}packages/verification/src/bip39-self-test.ts` },
      { find: '@ckd/derivation-self-test', replacement: `${root}packages/verification/src/derivation-self-test.ts` },
      {
        find: '@ckd/dash-derivation-self-test',
        replacement: `${root}packages/verification/src/derivation-self-test-dash.ts`,
      },
      { find: 'btcutil-js-wasm', replacement: `${root}test/support/btcutil-wasm.ts` },
    ],
  },
  test: {
    environment: 'node',
    // Official-vector and large descriptor suites are CPU-heavy under full parallel CI.
    testTimeout: 20_000,
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts', 'tooling/**/*.test.mjs'],
    coverage: {
      include: ['packages/crypto-core/src/**/*.ts', 'packages/coin-protocols/src/**/*.ts'],
    },
  },
});

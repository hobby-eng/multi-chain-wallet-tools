import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@ckd\/core\/(.+)\.js$/u, replacement: `${root}packages/crypto-core/src/$1.ts` },
      { find: /^@ckd\/coins\/(.+)\.js$/u, replacement: `${root}packages/coin-protocols/src/coins/$1.ts` },
      { find: /^@ckd\/export\/(.+)\.js$/u, replacement: `${root}packages/export-core/src/$1.ts` },
      { find: /^@ckd\/dash-network\/(.+)\.js$/u, replacement: `${root}packages/dash-network/src/$1.ts` },
      { find: /^@ckd\/dash-wasm\/(.+)$/u, replacement: `${root}packages/dash-shielded-wasm/generated/$1` },
      { find: /^@ckd\/test-support\/(.+)\.js$/u, replacement: `${root}test/support/$1.ts` },
      { find: '@ckd/build-info', replacement: `${root}packages/build-security/src/build-info.ts` },
      { find: '@ckd/self-test', replacement: `${root}packages/verification/src/self-test.ts` },
      { find: '@ckd/self-test-types', replacement: `${root}packages/verification/src/types.ts` },
      { find: '@ckd/bip39-self-test', replacement: `${root}packages/verification/src/bip39-self-test.ts` },
      { find: '@ckd/derivation-self-test', replacement: `${root}packages/verification/src/derivation-self-test.ts` },
    ],
  },
  test: {
    environment: 'node',
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts', 'tooling/**/*.test.mjs'],
    coverage: {
      include: ['packages/crypto-core/src/**/*.ts', 'packages/coin-protocols/src/**/*.ts'],
    },
  },
});

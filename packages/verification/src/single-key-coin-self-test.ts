// The startup self-test of a single-key coin (tooling/single-key-coins.mjs): each variant's first
// path and its refusal of a range past the last index, then each variant's first address of the
// "abandon … about" seed, and where given its account key, which also checks the master key. Each
// coin's module says where its values come from (CORE-27).
import type { Bip32BatchOptions, DerivationResult } from "@ckd/core/types.js";
import type { CoinAdapter } from "@ckd/coins/registry-base.js";
import { runSingleKeyPathSelfTest } from "@ckd/coins/single-key-path-self-test.js";
import { checkDerivationVectors, firstAddressOf, now, type DerivationVector } from "./helpers.js";
import type { CryptoSelfTestReport } from "./types.js";

/** A variant's known first path and address, and its account key where the coin uses xpub. */
export interface SingleKeyVector {
  readonly adapterId: string;
  readonly path: string;
  readonly address: string;
  readonly accountXpub?: string;
  /** The master extended public key, where the coin serializes it under its own version. */
  readonly masterXpub?: string;
}

interface SingleKeySelfTestSpec {
  /** The coin's name, as its checks are named. */
  readonly group: string;
  readonly adapters: readonly CoinAdapter[];
  derivation(id: string): ((options: Bip32BatchOptions) => DerivationResult) | undefined;
  /** One vector for every adapter, in the adapters' order. */
  readonly vectors: readonly SingleKeyVector[];
}

/** The self-test of one single-key coin, as its derivation self-test module exports it. */
export function singleKeyCoinSelfTest(
  spec: SingleKeySelfTestSpec,
): () => Promise<CryptoSelfTestReport> {
  return async () => {
    const started = now();
    const paths = runSingleKeyPathSelfTest(
      spec.adapters,
      spec.vectors.map(({ adapterId, path }) => [adapterId, path] as const),
    );
    const vectors: DerivationVector[] = spec.vectors.map((vector) => {
      const { adapterId, address, accountXpub, masterXpub } = vector;
      const adapter = spec.adapters.find(({ id }) => id === adapterId);
      const derive = spec.derivation(adapterId);
      if (adapter === undefined || derive === undefined)
        throw new Error(`Cryptographic self-test failed: ${adapterId} is not derived.`);
      return {
        name: adapter.label,
        derive: (seed) => derive(firstAddressOf(seed, "mainnet")),
        address,
        ...(accountXpub === undefined ? {} : { accountXpub }),
        ...(masterXpub === undefined ? {} : { masterXpub }),
      };
    });
    const checks = checkDerivationVectors(
      vectors,
      `${spec.group} master/account extended-key integrity`,
    );
    return { passed: true, checks: [...paths, ...checks], durationMs: Math.round(now() - started) };
  };
}

// The startup self-test of a single-key coin (tooling/single-key-coins.mjs): each variant's first
// path and its refusal of a range past the last index, then each variant's first address of the
// "abandon … about" seed, and where given its account key, which also checks the master key. Each
// coin's module says where its values come from (CORE-27).
import type { Bip32BatchOptions, DerivationResult } from "@ckd/core/types.js";
import type { CoinAddressScheme } from "@ckd/coins/address-scheme.js";
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
  /** What the coin's public addresses look up for this vector where it is not `address`. */
  readonly publicLookup?: string;
}

interface SingleKeySelfTestSpec {
  /** The coin's name, as its checks are named. */
  readonly group: string;
  readonly adapters: readonly CoinAdapter[];
  derivation(id: string): ((options: Bip32BatchOptions) => DerivationResult) | undefined;
  /** One vector for every adapter of a BIP39 seed, in the adapters' order. */
  readonly vectors: readonly SingleKeyVector[];
  /** The first paths of variants whose seed is not BIP39's, checked before the vectors' paths. */
  readonly otherPaths?: readonly (readonly [id: string, path: string])[];
  /** The coin's further checks, after its vectors; each returns its check's name. */
  readonly checks?: readonly (() => string)[];
  /**
   * The coin's public-only addresses (the Discovery Scanner's), each vector's also derived through
   * its layout of the same id, at account 0 and index 0.
   */
  readonly addresses?: CoinAddressScheme;
}

/** The address of `seed` at the first index of the `addresses` layout `id`, opened and wiped. */
function firstPublicAddress(addresses: CoinAddressScheme, id: string, seed: Uint8Array): string {
  const layout = addresses.layouts.find((candidate) => candidate.id === id);
  if (layout === undefined)
    throw new Error(`Cryptographic self-test failed: ${id} has no public address layout.`);
  const opened = addresses.open(seed);
  try {
    return opened.address(layout, 0, 0);
  } finally {
    opened.wipe();
  }
}

/** The self-test of one single-key coin, as its derivation self-test module exports it. */
export function singleKeyCoinSelfTest(
  spec: SingleKeySelfTestSpec,
): () => Promise<CryptoSelfTestReport> {
  return async () => {
    const started = now();
    const paths = runSingleKeyPathSelfTest(spec.adapters, [
      ...(spec.otherPaths ?? []),
      ...spec.vectors.map(({ adapterId, path }) => [adapterId, path] as const),
    ]);
    const { addresses } = spec;
    const vectors: DerivationVector[] = spec.vectors.map((vector) => {
      const { adapterId, address, accountXpub, masterXpub, publicLookup } = vector;
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
        ...(publicLookup === undefined ? {} : { publicLookup }),
        ...(addresses === undefined
          ? {}
          : {
              publicAddress: (seed: Uint8Array) => firstPublicAddress(addresses, adapterId, seed),
            }),
      };
    });
    const checks = checkDerivationVectors(
      vectors,
      `${spec.group} master/account extended-key integrity`,
    );
    const own = (spec.checks ?? []).map((check) => check());
    return {
      passed: true,
      checks: [...paths, ...checks, ...own],
      durationMs: Math.round(now() - started),
    };
  };
}

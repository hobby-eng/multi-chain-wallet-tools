import { hexToBytes } from "@ckd/core/crypto.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import type { Bip32BatchOptions, DerivationResult, ResultField } from "@ckd/core/types.js";
import type { CryptoSelfTestReport } from "./types.js";

/**
 * The seed of the public BIP39 vector "abandon … about" with an empty passphrase. The derivation
 * self-tests start from these bytes, so that a worker needs no second word list.
 */
export const ABANDON_ABOUT_SEED_HEX =
  "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1" +
  "9a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4";

/** The BIP32 master of that seed, the same for every coin (BIP32; checked against BIP86's vector). */
export const ABANDON_ABOUT_MASTER = {
  publicKey: "03d902f35f560e0470c63313c7369168d9d7df2d49bf295fd9fb7cb109ccee0494",
  fingerprint: "73c5da0a",
  xpub: "xpub661MyMwAqRbcFkPHucMnrGNzDwb6teAX1RbKQmqtEF8kK3Z7LZ59qafCjB9eCRLiTVG3uxBxgKvRgbubRhqSKXnGGb1aoaqLrpMBDrVxga8",
} as const;

export function resultValue(result: DerivationResult, key: string): string {
  const fields: ResultField[] = [
    ...result.basicSummary,
    ...result.summary,
    ...(result.rows[0] === undefined ? [] : [...result.rows[0].basic, ...result.rows[0].advanced]),
  ];
  const match = fields.find((field) => field.key === key);
  if (match === undefined) throw new Error(`Self-test result is missing ${key}.`);
  return match.value;
}

export function expectEqual(check: string, actual: string, expected: string): void {
  if (actual !== expected) throw new Error(`Cryptographic self-test failed: ${check}.`);
}

export function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

/** A request for the first address of account 0's receiving branch, on a copy of `seed`. */
export function firstAddressOf(
  seed: Uint8Array,
  network: Bip32BatchOptions["network"],
  start = 0,
): Bip32BatchOptions {
  return { seed: seed.slice(), network, account: 0, branch: 0, start, count: 1 };
}

/** One vector of a coin's derivation: what it derives and the facts its result must hold. */
export interface DerivationVector {
  readonly name: string;
  derive(seed: Uint8Array): DerivationResult;
  readonly address: string;
  /** The account's extended public key, which checks the master and the account path too. */
  readonly accountXpub?: string;
}

/**
 * Derives each vector from the "abandon … about" seed and compares its address, and for a vector
 * with an account key the master key, its fingerprint, the master and the account extended keys. Every result is wiped.
 * Returns the names of the checks passed; `accountCheck` names the check of the account keys.
 */
export function checkDerivationVectors(
  vectors: readonly DerivationVector[],
  accountCheck: string,
): string[] {
  const checks: string[] = [];
  const seed = hexToBytes(ABANDON_ABOUT_SEED_HEX);
  try {
    for (const vector of vectors) {
      const result = vector.derive(seed);
      try {
        expectEqual(vector.name, resultValue(result, "address"), vector.address);
        checks.push(vector.name);
        if (vector.accountXpub === undefined) continue;
        expectEqual(
          `${vector.name} master public key`,
          resultValue(result, "masterPublicKey"),
          ABANDON_ABOUT_MASTER.publicKey,
        );
        expectEqual(
          `${vector.name} master fingerprint`,
          resultValue(result, "masterFingerprint"),
          ABANDON_ABOUT_MASTER.fingerprint,
        );
        expectEqual(
          `${vector.name} master extended key`,
          resultValue(result, "masterXpub"),
          ABANDON_ABOUT_MASTER.xpub,
        );
        expectEqual(
          `${vector.name} account extended key`,
          resultValue(result, "accountXpub"),
          vector.accountXpub,
        );
      } finally {
        clearDerivationResult(result);
      }
    }
  } finally {
    seed.fill(0);
  }
  if (vectors.some((vector) => vector.accountXpub !== undefined)) checks.push(accountCheck);
  return checks;
}

/** Several reports as one; a report that did not pass stops the whole self-test. */
export function combinedReports(reports: readonly CryptoSelfTestReport[]): CryptoSelfTestReport {
  if (reports.some((report) => report.passed !== true))
    throw new Error("A self-test returned an unsuccessful report.");
  return {
    passed: true,
    checks: reports.flatMap((report) => report.checks),
    durationMs: reports.reduce((sum, report) => sum + report.durationMs, 0),
  };
}

/** The report of several self-tests run one after another, as one. */
export async function combinedSelfTest(
  tests: ReadonlyArray<() => CryptoSelfTestReport | Promise<CryptoSelfTestReport>>,
): Promise<CryptoSelfTestReport> {
  const reports: CryptoSelfTestReport[] = [];
  for (const test of tests) reports.push(await test());
  return combinedReports(reports);
}

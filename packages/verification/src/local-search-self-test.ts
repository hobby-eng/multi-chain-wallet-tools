import { runLocalSearchSelfTest as runLocalSearchChecks } from "@ckd/recovery/local-search-self-test.js";
import { now } from "./helpers.js";
import type { CryptoSelfTestReport } from "./types.js";

/** Report adapter for the shared quick checks; included only with a local search feature. */
export async function runLocalSearchSelfTest(): Promise<CryptoSelfTestReport> {
  const started = now();
  const checks = await runLocalSearchChecks();
  return { passed: true, checks, durationMs: Math.round(now() - started) };
}

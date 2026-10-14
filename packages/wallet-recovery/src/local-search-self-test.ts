import { LocalSearchAdmission, MAX_LOCAL_SEARCH_CONCURRENCY } from "./local-search-admission.js";
import { LocalSearchQueue } from "./local-search-queue.js";
import { MAX_BIP32_INDEX } from "@ckd/core/bip32-limits.js";

function requireCheck(passed: boolean, name: string): void {
  if (!passed) throw new Error(`Local search self-test failed: ${name}.`);
}

/** Millisecond checks for startup and full suites; no derivation, network or real seed. */
export async function runLocalSearchSelfTest(): Promise<string[]> {
  const checks: string[] = [];
  for (const concurrency of [NaN, Infinity, -Infinity, 0, -1, 1.5]) {
    let refused = false;
    try {
      LocalSearchAdmission.concurrency(concurrency);
    } catch {
      refused = true;
    }
    requireCheck(refused, "invalid concurrency refusal");
  }
  requireCheck(
    LocalSearchAdmission.concurrency(Number.MAX_SAFE_INTEGER) === MAX_LOCAL_SEARCH_CONCURRENCY,
    "concurrency ceiling",
  );
  checks.push("Local search concurrency admission");
  LocalSearchAdmission.range(MAX_BIP32_INDEX, 1);
  let rangeRefused = false;
  try {
    LocalSearchAdmission.range(MAX_BIP32_INDEX, 2);
  } catch {
    rangeRefused = true;
  }
  requireCheck(rangeRefused, "range boundary refusal");
  checks.push("Local search range admission");
  let calls = 0;
  const results = await LocalSearchQueue.run({
    total: 3,
    concurrency: 2,
    execute: async (index) => {
      calls += 1;
      await Promise.resolve();
      return index * 2;
    },
  });
  // Exact synthetic known answer detects skipped jobs, sparse arrays and reordered slots.
  requireCheck(calls === 3 && results.join(",") === "0,2,4", "complete ordered results");
  checks.push("Local search complete ordered results");
  const controller = new AbortController();
  let cancelled = false;
  try {
    await LocalSearchQueue.run({
      total: 1,
      signal: controller.signal,
      execute: async () => {
        controller.abort();
        return 1;
      },
    });
  } catch {
    cancelled = controller.signal.aborted;
  }
  requireCheck(cancelled, "final job cancellation");
  checks.push("Local search final job cancellation");
  return checks;
}

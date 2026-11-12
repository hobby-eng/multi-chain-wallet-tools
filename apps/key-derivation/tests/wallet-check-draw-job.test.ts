import { mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { describe, expect, it } from "vitest";
import { runDrawJob, type WalletCheckDrawRequest } from "../src/workers/wallet-check-draw-job.js";

// Public test data only: the profile vector that passes the wallet check with TREZOR, and the
// synthetic TON phrase with the public passphrase that makes it pass the check too
// (packages/crypto-core/tests/bip39-wallet-check.test.ts).
const ABOVE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon above proof fatigue";
const BOTH =
  "theme bubble daring setup grass park apart mountain orbit donate mosquito indicate lonely history strategy produce demand rookie demise myth flower length occur carry";
const NO_WISHES = { wordCount: 24, chosen: [], neverUse: [] } as const;

/** Two different probes, as the draw's source check asks, then `misses` zero draws, then `phrase`. */
function source(phrase: string, misses = 0) {
  const entropy = mnemonicToEntropy(phrase, wordlist);
  let calls = 0;
  return (length: number): Uint8Array => {
    calls += 1;
    const bytes = new Uint8Array(length);
    if (calls <= 2) bytes.fill(calls);
    else if (calls > 2 + misses)
      for (let offset = 0; offset < length; offset += 32) bytes.set(entropy, offset);
    return bytes;
  };
}

/** A clock that moves `step` milliseconds every time it is read. */
function clock(step: number) {
  let time = 0;
  return () => (time += step);
}

const request = (fields: Partial<WalletCheckDrawRequest>): WalletCheckDrawRequest => ({
  wishes: NO_WISHES,
  passphrase: "TREZOR",
  ton: false,
  engine: "javascript",
  ...fields,
});

describe("one worker's wallet-check draw", () => {
  it("gives the phrase it finds with its draws, and reports progress a few times a second", async () => {
    const progress: number[] = [];
    const outcome = await runDrawJob(request({}), ({ draws }) => progress.push(draws), {
      randomBytes: source(ABOVE, 6),
      now: clock(90),
    });
    expect(outcome).toEqual({ phrase: ABOVE, draws: 7 });
    // One report every 200 ms or more of a clock moving 90 ms a draw: after draws 3 and 6 of 7.
    expect(progress).toEqual([3, 6]);
  });

  it("tries TON's check first with the worker's engine, and takes the phrase that passes both", async () => {
    for (const engine of ["javascript", "webcrypto"] as const)
      await expect(
        runDrawJob(
          request({ passphrase: "TON wallet check 23613", ton: true, engine }),
          () => undefined,
          {
            randomBytes: source(BOTH, 3),
          },
        ),
      ).resolves.toEqual({ phrase: BOTH, draws: 4 });
  });

  it("keeps no phrase that a measurement finds, and reports no progress", async () => {
    const progress: number[] = [];
    const outcome = await runDrawJob(
      request({ measureMilliseconds: 1000 }),
      ({ draws }) => progress.push(draws),
      { randomBytes: source(ABOVE), now: clock(10) },
    );
    expect(outcome).not.toHaveProperty("phrase");
    expect(outcome).toMatchObject({ measured: { draws: 1 } });
    expect(progress).toEqual([]);
  });

  it("gives a measurement's sample when its time runs out, counted after the warm-up", async () => {
    const started = performance.now();
    const outcome = await runDrawJob(
      request({ passphrase: "public measurement", measureMilliseconds: 100 }),
      () => undefined,
    );
    // The 300 ms warm-up and the 100 ms counted; the count starts at the first draw after it.
    expect(performance.now() - started).toBeGreaterThanOrEqual(390);
    if (!("measured" in outcome)) throw new Error("A measurement gives a sample.");
    expect(outcome.measured.draws).toBeGreaterThan(0);
    expect(outcome.measured.milliseconds).toBeGreaterThan(0);
  });
});

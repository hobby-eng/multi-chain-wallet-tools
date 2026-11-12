import { describe, expect, it } from "vitest";
import {
  bitsOutlook,
  DrawPace,
  drawCountLine,
  drawDoneLine,
  drawStartLine,
  drawStoppedLine,
  expectedDraws,
  timeOutlook,
  type GenerationCondition,
  type GenerationPlan,
} from "../src/ui/generation-plan.js";
import { formatDuration } from "../src/ui/recovery-progress.js";

// The conditions as their features give them (ton-phrase-feature.ts, checked-mnemonic-feature.ts).
const TON: GenerationCondition = {
  goal: "the Telegram wallet accepts",
  name: "TON's check",
  bits: 8,
  words: 24,
  passphraseNote: "The Telegram wallet uses this phrase without the BIP39 passphrase.",
};
const CHECK: GenerationCondition = {
  goal: "passes the MHFE wallet check with your BIP39 passphrase",
  name: "the MHFE wallet check",
  bits: 16,
  words: 24,
};

/** Every state of {wallet check, TON, chosen words}, with its draws on average. */
const MATRIX: readonly { plan: GenerationPlan; draws: number; start: string }[] = [
  {
    plan: { words: 12, wishes: false, conditions: [] },
    draws: 1,
    start: "Drawing a new 12-word phrase.",
  },
  {
    plan: { words: 12, wishes: true, conditions: [] },
    draws: 1,
    start: "Drawing a new 12-word phrase that meets your chosen words.",
  },
  {
    plan: { words: 24, wishes: false, conditions: [TON] },
    draws: 256,
    start: "Drawing a new 24-word phrase that the Telegram wallet accepts: about 256 draws.",
  },
  {
    plan: { words: 24, wishes: true, conditions: [TON] },
    draws: 256,
    start:
      "Drawing a new 24-word phrase that meets your chosen words and that the Telegram wallet accepts: about 256 draws.",
  },
  {
    plan: { words: 24, wishes: false, conditions: [CHECK] },
    draws: 65_536,
    start:
      "Drawing a new 24-word phrase that passes the MHFE wallet check with your BIP39 passphrase: about 65,536 draws.",
  },
  {
    plan: { words: 24, wishes: true, conditions: [CHECK] },
    draws: 65_536,
    start:
      "Drawing a new 24-word phrase that meets your chosen words and that passes the MHFE wallet check with your BIP39 passphrase: about 65,536 draws.",
  },
  {
    plan: { words: 24, wishes: false, conditions: [TON, CHECK] },
    draws: 16_777_216,
    start:
      "Drawing a new 24-word phrase that the Telegram wallet accepts and that passes the MHFE wallet check with your BIP39 passphrase: about 16,777,216 draws.",
  },
  {
    plan: { words: 24, wishes: true, conditions: [TON, CHECK] },
    draws: 16_777_216,
    start:
      "Drawing a new 24-word phrase that meets your chosen words, that the Telegram wallet accepts, and that passes the MHFE wallet check with your BIP39 passphrase: about 16,777,216 draws.",
  },
];

const NO_WISHES = { wordCount: 24, chosen: [], neverUse: [] } as const;

describe("the lines of a draw with the generation options", () => {
  it.each(MATRIX)("starts $start", ({ plan, draws, start }) => {
    expect(expectedDraws(plan)).toBe(draws);
    expect(drawStartLine(plan)).toBe(start);
  });

  it("counts the draws and the time, with the average at the speed so far once it is known", () => {
    // No speed yet: the count and the time alone.
    expect(drawCountLine(192, 350, 256, undefined)).toBe("192 tried · 0.3 s elapsed");
    // 2 draws a millisecond for 256 draws: 0.1 s on average.
    expect(drawCountLine(192, 350, 256, 2)).toBe(
      "192 tried · 0.3 s elapsed · about 0.1 s on average at this speed",
    );
    // 131,072 draws at 1 a millisecond: 2 min 11 s on average.
    expect(drawCountLine(65_536, 66_000, 131_072, 1)).toBe(
      "65,536 tried · 1 min 6 s elapsed · about 2 min 11 s on average at this speed",
    );
    // 16,777,216 draws at 5 a millisecond: 55 min 55 s on average.
    expect(drawCountLine(1_677_722, 320_000, 16_777_216, 5)).toBe(
      "1,677,722 tried · 5 min 20 s elapsed · about 55 min 55 s on average at this speed",
    );
  });

  it("takes the speed from the first report on, over a sliding window, after 2 s", () => {
    const pace = new DrawPace();
    // The first report comes late (the MHFE check, the workers' start) and carries earlier draws.
    expect(pace.add(5_000, 4_000)).toBeUndefined();
    expect(pace.add(6_000, 9_000)).toBeUndefined();
    // 2 s after the first report: (14,000 − 4,000) draws in 2,000 ms.
    expect(pace.add(7_000, 14_000)).toBe(5);
    // A slower stretch: the window keeps the last report at least 10 s old.
    for (let at = 8_000; at <= 20_000; at += 1_000) pace.add(at, 14_000 + (at - 7_000));
    expect(pace.add(21_000, 28_000)).toBeCloseTo(1, 5);
  });

  it("reads hours as hours", () => {
    expect(formatDuration(59_999)).toBe("59 s");
    expect(formatDuration(3_599_999)).toBe("59 min 59 s");
    expect(formatDuration(9_000_000)).toBe("2 h 30 min");
  });

  it("says how a draw stopped, and what the new phrase is", () => {
    expect(drawStoppedLine(0, 10)).toBe("Stopped before the first draw. No phrase was taken.");
    expect(drawStoppedLine(4_373, 830)).toBe(
      "Stopped after 4,373 draws in 0.8 s. No phrase was taken.",
    );
    expect(drawStoppedLine(1_234_567, 250_000)).toBe(
      "Stopped after 1,234,567 draws in 4 min 10 s. No phrase was taken.",
    );
    expect(drawDoneLine(MATRIX[0]!.plan, 1, 3, "none")).toBe(
      "Generated a new 12-word BIP39 recovery phrase with crypto.getRandomValues().",
    );
    expect(drawDoneLine(MATRIX[3]!.plan, 300, 450, "emptied")).toBe(
      "Generated a new 24-word BIP39 recovery phrase with crypto.getRandomValues() that meets " +
        "your chosen words and that the Telegram wallet accepts after 300 draws in 0.4 s. " +
        "The BIP39 passphrase field was emptied: a new phrase starts without one; type one now if " +
        "this wallet should use one.",
    );
    // The wallet check keeps the passphrase, which the Telegram wallet does not use.
    expect(drawDoneLine(MATRIX[6]!.plan, 16_000_000, 3_000_000, "kept")).toBe(
      "Generated a new 24-word BIP39 recovery phrase with crypto.getRandomValues() that the " +
        "Telegram wallet accepts and that passes the MHFE wallet check with your BIP39 passphrase " +
        "after 16,000,000 draws in 50 min 0 s. The Telegram wallet uses this phrase without the " +
        "BIP39 passphrase.",
    );
    expect(drawDoneLine(MATRIX[4]!.plan, 65_000, 61_000, "kept")).toMatch(/in 1 min 1 s\.$/u);
  });

  it("states the bits the checks and the wishes take, with only wishes not recommended", () => {
    expect(bitsOutlook(NO_WISHES, [CHECK])).toEqual({
      text: "The phrase keeps about 240 of its 256 random bits (16 for the MHFE wallet check): still far more than enough.",
      alert: false,
    });
    expect(bitsOutlook(NO_WISHES, [TON])).toEqual({
      text: "The phrase keeps about 248 of its 256 random bits (8 for TON's check): still far more than enough.",
      alert: false,
    });
    expect(bitsOutlook(NO_WISHES, [TON, CHECK])).toEqual({
      text: "The phrase keeps about 232 of its 256 random bits (8 for TON's check and 16 for the MHFE wallet check): still far more than enough.",
      alert: false,
    });
    // The owner's case: "happy" as the second word, with both checks.
    expect(
      bitsOutlook({ ...NO_WISHES, chosen: [{ word: "happy", position: 2 }] }, [TON, CHECK]),
    ).toEqual({
      text:
        "Not recommended: the phrase keeps about 221 of its 256 random bits (8 for TON's check, " +
        "16 for the MHFE wallet check, and the rest for your words), fewer than 232. A word " +
        "anywhere in the phrase keeps more than one at a fixed position.",
      alert: true,
    });
    // A word anywhere already keeps more: no such advice.
    expect(
      bitsOutlook({ ...NO_WISHES, chosen: [{ word: "happy", position: "anywhere" }] }, [CHECK])
        .text,
    ).toMatch(/^Not recommended: the phrase keeps about 233 of its 256 .*fewer than 240\.$/u);
    expect(() =>
      bitsOutlook({ ...NO_WISHES, chosen: [{ word: "notaword", position: 1 }] }, [TON]),
    ).toThrow("Chosen word 1 is not an English BIP39 word.");
  });

  it("says how long a phrase takes on this computer, with the tail and the hours it can take", () => {
    const check = MATRIX[4]!.plan;
    const both = MATRIX[6]!.plan;
    expect(timeOutlook({ kind: "measuring", threads: 1 }, check)).toBe(
      "Measuring this computer's speed with 1 thread…",
    );
    expect(timeOutlook({ kind: "measuring", threads: 4 }, both)).toBe(
      "Measuring this computer's speed with 4 threads… It can take hours.",
    );
    expect(timeOutlook({ kind: "failed" }, both)).toBe(
      "This computer's speed could not be measured; the draw shows it once it runs. It can take hours.",
    );
    // 65,536 draws at 1,024 a second: 64 s on average, and ln 20 times that for 1 search in 20.
    expect(timeOutlook({ kind: "measured", threads: 4, drawsPerSecond: 1024 }, check)).toBe(
      "On this computer with 4 threads, a phrase takes about 1 min 4 s on average. The time " +
        "varies, with no fixed end: 1 search in 20 takes more than 3 min 11 s.",
    );
    // 16,777,216 draws at 5,000 a second: 55 min 55 s on average, 2 h 47 min for 1 in 20.
    expect(timeOutlook({ kind: "measured", threads: 4, drawsPerSecond: 5000 }, both)).toBe(
      "On this computer with 4 threads, a phrase takes about 55 min 55 s on average. The time " +
        "varies, with no fixed end: 1 search in 20 takes more than 2 h 47 min. It can take " +
        "hours; Stop works at any time.",
    );
  });
});

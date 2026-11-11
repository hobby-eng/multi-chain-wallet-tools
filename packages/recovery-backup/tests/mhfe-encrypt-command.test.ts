import { describe, expect, it } from "vitest";
import {
  MhfeEncryptCommand,
  mhfeMemoryText,
  type MhfeEncryptChoices,
  type MhfeNewPasswordKind,
} from "../src/mhfe-encrypt-command.js";

// The package's own parameters (MHFE 0.8.0 core parameters()): PIM 0 to 1023, memory levels 0 to
// 21, and level 0 alone in a browser.
const LIMITS = { maxPim: 1023, maxMemoryLevel: 21, highestBrowserMemoryLevel: 0 } as const;
const COMMAND = new MhfeEncryptCommand(LIMITS);

/** The defaults of the Encode form: PIM 0, level 0, 24 words, one's own password, 4 repair words. */
const DEFAULTS: MhfeEncryptChoices = {
  pim: 0,
  memoryLevel: 0,
  sameLength: false,
  newPassword: "own",
  repairWords: 4,
};

describe("the memory of each MHFE memory level, as mhfe writes it", () => {
  it("is mhfe's README table at levels 0 to 6 and 21", () => {
    // mhfe 0.8.0 README, "Settings: PIM and memory level".
    const readme = ["2 GiB", "3 GiB", "4 GiB", "6 GiB", "8 GiB", "12 GiB", "16 GiB"];
    expect(readme.map((_, level) => mhfeMemoryText(level))).toEqual(readme);
    expect(mhfeMemoryText(21)).toBe("3 TiB");
  });

  it("doubles every two levels and is written in tebibytes only where whole", () => {
    // Worked out by hand from "doubling every two levels" of mhfe's --mem help; 1536 GiB at level 19
    // is mhfe's own test value (src/suite.rs).
    expect(COMMAND.levels().map(({ memory }) => memory)).toEqual([
      "2 GiB",
      "3 GiB",
      "4 GiB",
      "6 GiB",
      "8 GiB",
      "12 GiB",
      "16 GiB",
      "24 GiB",
      "32 GiB",
      "48 GiB",
      "64 GiB",
      "96 GiB",
      "128 GiB",
      "192 GiB",
      "256 GiB",
      "384 GiB",
      "512 GiB",
      "768 GiB",
      "1 TiB",
      "1536 GiB",
      "2 TiB",
      "3 TiB",
    ]);
  });

  it("offers every level the package takes and runs only level 0 in a browser", () => {
    const levels = COMMAND.levels();
    expect(levels.map(({ level }) => level)).toEqual([...Array(22).keys()]);
    expect(levels.filter(({ runsInBrowser }) => runsInBrowser).map(({ level }) => level)).toEqual([
      0,
    ]);
    expect(COMMAND.runsInBrowser(0)).toBe(true);
    expect(COMMAND.runsInBrowser(1)).toBe(false);
    expect(new MhfeEncryptCommand({ ...LIMITS, maxMemoryLevel: 3 }).levels()).toHaveLength(4);
  });
});

describe("the mhfe encrypt command for the Encode form's settings", () => {
  it("writes the owner's example exactly", () => {
    expect(
      COMMAND.line({
        pim: 3,
        memoryLevel: 2,
        sameLength: true,
        newPassword: "checkWord",
        repairWords: 4,
      }),
    ).toBe("mhfe encrypt --pim 3 --mem 2 --same-length --new-password check-word --repair-words 4");
  });

  it.each([
    // mhfe 0.8.0 docs/CLI.md, "1. Encrypt", with the settings these examples state.
    [
      { pim: 0, memoryLevel: 0, sameLength: false, newPassword: "own", repairWords: 4 },
      "mhfe encrypt --pim 0 --mem 0 --new-password own --repair-words 4",
    ],
    [
      { pim: 0, memoryLevel: 0, sameLength: false, newPassword: "words", repairWords: 0 },
      "mhfe encrypt --pim 0 --mem 0 --new-password words --repair-words 0",
    ],
    [
      { pim: 1, memoryLevel: 0, sameLength: false, newPassword: "checkWord", repairWords: 6 },
      "mhfe encrypt --pim 1 --mem 0 --new-password check-word --repair-words 6",
    ],
    [
      { pim: 0, memoryLevel: 2, sameLength: false, newPassword: "characters", repairWords: 4 },
      "mhfe encrypt --pim 0 --mem 2 --new-password chars --repair-words 4",
    ],
    [
      { pim: 3, memoryLevel: 2, sameLength: true, newPassword: "checkWord", repairWords: 8 },
      "mhfe encrypt --pim 3 --mem 2 --same-length --new-password check-word --repair-words 8",
    ],
  ] as const)("writes mhfe's own example %#", (choices, line) => {
    expect(COMMAND.line(choices)).toBe(line);
  });

  it("maps every combination of settings to its options and back", () => {
    // An independent reading of the command: every option once, in mhfe's order, and the value
    // read back gives the setting it came from.
    const kinds: Record<string, MhfeNewPasswordKind> = {
      own: "own",
      words: "words",
      "check-word": "checkWord",
      chars: "characters",
    };
    const read = (line: string): MhfeEncryptChoices => {
      const match =
        /^mhfe encrypt --pim (\d+) --mem (\d+)( --same-length)? --new-password (own|words|check-word|chars) --repair-words ([02468])$/u.exec(
          line,
        );
      if (match === null) throw new Error(`unexpected command: ${line}`);
      return {
        pim: Number(match[1]),
        memoryLevel: Number(match[2]),
        sameLength: match[3] !== undefined,
        newPassword: kinds[match[4]!]!,
        repairWords: Number(match[5]) as MhfeEncryptChoices["repairWords"],
      };
    };
    let combinations = 0;
    for (const pim of [0, 1, 9, 1023])
      for (const memoryLevel of [0, 1, 2, 18, 21])
        for (const sameLength of [false, true])
          for (const newPassword of ["own", "words", "checkWord", "characters"] as const)
            for (const repairWords of [0, 2, 4, 6, 8] as const) {
              const choices = { pim, memoryLevel, sameLength, newPassword, repairWords };
              expect(read(COMMAND.line(choices))).toEqual(choices);
              combinations += 1;
            }
    expect(combinations).toBe(4 * 5 * 2 * 4 * 5);
  });

  it("states 24 words by leaving --same-length out, since mhfe has no option for it", () => {
    expect(COMMAND.line({ ...DEFAULTS, memoryLevel: 1 })).not.toContain("length");
    expect(COMMAND.line({ ...DEFAULTS, memoryLevel: 1, sameLength: true })).toContain(
      " --same-length ",
    );
  });

  it("is offered for a PIM or a memory level other than 0, and only then", () => {
    expect(COMMAND.offered({ pim: 0, memoryLevel: 0 })).toBe(false);
    expect(COMMAND.offered({ pim: 1, memoryLevel: 0 })).toBe(true);
    expect(COMMAND.offered({ pim: 0, memoryLevel: 1 })).toBe(true);
    expect(COMMAND.offered({ pim: 1023, memoryLevel: 21 })).toBe(true);
  });

  it.each([-1, 1024, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses a PIM mhfe refuses: %s",
    (pim) => {
      const refusal = (() => {
        try {
          COMMAND.line({ ...DEFAULTS, pim });
        } catch (error) {
          return error;
        }
        return undefined;
      })();
      expect(refusal).toMatchObject({
        code: "mhfe.command.pim",
        message: "The PIM is a whole number from 0 to 1023.",
      });
    },
  );

  it.each([-1, 22, 0.5])("refuses a memory level mhfe refuses: %s", (memoryLevel) => {
    expect(() => COMMAND.line({ ...DEFAULTS, memoryLevel })).toThrow(
      expect.objectContaining({
        code: "mhfe.command.memory-level",
        message: "The memory level is a whole number from 0 to 21.",
      }),
    );
  });

  it("lets a browser encrypt at level 0 only, and refuses before any secret is read", () => {
    expect(() => COMMAND.assertRunsInBrowser({ pim: 0, memoryLevel: 0 })).not.toThrow();
    expect(() => COMMAND.assertRunsInBrowser({ pim: 1023, memoryLevel: 0 })).not.toThrow();
    let refusal: unknown;
    try {
      COMMAND.assertRunsInBrowser({ pim: 3, memoryLevel: 2 });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toMatchObject({
      code: "mhfe.command.browser-level",
      message: "A browser runs memory level 0 only: encrypt at level 2 with the mhfe command.",
    });
    // The library refuses a PIM that is no whole number, as a page's empty field would give it.
    expect(() => COMMAND.assertRunsInBrowser({ pim: Number.NaN, memoryLevel: 0 })).toThrow(
      expect.objectContaining({ code: "mhfe.command.pim" }),
    );
  });
});

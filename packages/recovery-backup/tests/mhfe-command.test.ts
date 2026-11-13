import { describe, expect, it } from "vitest";
import {
  MhfeCommand,
  mhfeMemoryText,
  type MhfeCommandLimits,
  type MhfeEncryptChoices,
  type MhfeNewPasswordKind,
} from "../src/mhfe-command.js";

// The package's own parameters (MHFE 0.8.0 core parameters()): PIM 0 to 1023, memory levels 0 to
// 21, level 0 alone in a browser, and the lengths of a phrase and of a built-in check.
const LIMITS: MhfeCommandLimits = {
  maxPim: 1023,
  maxMemoryLevel: 21,
  highestBrowserMemoryLevel: 0,
  wordCounts: [12, 15, 18, 21, 24],
  builtInCheckWordCounts: [12, 15, 18, 21],
};
const COMMAND = new MhfeCommand(LIMITS);

/** The defaults of the Encode form: PIM 0, level 0, 24 words, one's own password, 4 repair words. */
const DEFAULTS: MhfeEncryptChoices = {
  pim: 0,
  memoryLevel: 0,
  sameLength: false,
  newPassword: "own",
  repairWords: 4,
};

/** What `run` throws, for a look at its code and message. */
function refusal(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

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
    expect(new MhfeCommand({ ...LIMITS, maxMemoryLevel: 3 }).levels()).toHaveLength(4);
  });
});

describe("the mhfe encrypt command for the Encode form's settings", () => {
  it("writes the owner's example exactly", () => {
    expect(
      COMMAND.encrypt({
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
    expect(COMMAND.encrypt(choices)).toBe(line);
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
              expect(read(COMMAND.encrypt(choices))).toEqual(choices);
              combinations += 1;
            }
    expect(combinations).toBe(4 * 5 * 2 * 4 * 5);
  });

  it("states 24 words by leaving --same-length out, since mhfe has no option for it", () => {
    expect(COMMAND.encrypt({ ...DEFAULTS, memoryLevel: 1 })).not.toContain("length");
    expect(COMMAND.encrypt({ ...DEFAULTS, memoryLevel: 1, sameLength: true })).toContain(
      " --same-length ",
    );
  });

  it.each([-1, 1024, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses a PIM mhfe refuses: %s",
    (pim) => {
      expect(refusal(() => COMMAND.encrypt({ ...DEFAULTS, pim }))).toMatchObject({
        code: "mhfe.command.pim",
        message: "The PIM is a whole number from 0 to 1023.",
      });
    },
  );

  it.each([-1, 22, 0.5])("refuses a memory level mhfe refuses: %s", (memoryLevel) => {
    expect(() => COMMAND.encrypt({ ...DEFAULTS, memoryLevel })).toThrow(
      expect.objectContaining({
        code: "mhfe.command.memory-level",
        message: "The memory level is a whole number from 0 to 21.",
      }),
    );
  });
});

describe("the mhfe decrypt command of Decode and of Hidden wallets", () => {
  it("states the settings always and the length only where one is chosen", () => {
    expect(COMMAND.decrypt({ work: { pim: 3, memoryLevel: 2 }, words: 24 })).toBe(
      "mhfe decrypt --pim 3 --mem 2 --words 24",
    );
    // Detection is mhfe decrypt's default and asks nothing.
    expect(COMMAND.decrypt({ work: { pim: 3, memoryLevel: 2 }, words: "auto" })).toBe(
      "mhfe decrypt --pim 3 --mem 2",
    );
    // mhfe 0.8.0 docs/CLI.md, "2. Decrypt": "State a 12-word original length".
    expect(COMMAND.decrypt({ work: { pim: 0, memoryLevel: 0 }, words: 12 })).toBe(
      "mhfe decrypt --pim 0 --mem 0 --words 12",
    );
  });

  it("refuses a length that no phrase has, and a PIM or level mhfe refuses", () => {
    expect(
      refusal(() => COMMAND.decrypt({ work: { pim: 0, memoryLevel: 1 }, words: 13 as never })),
    ).toMatchObject({
      code: "mhfe.command.words",
      message: "The word count is one of 12, 15, 18, 21, 24, or auto.",
    });
    expect(
      refusal(() => COMMAND.decrypt({ work: { pim: 1024, memoryLevel: 0 }, words: "auto" })),
    ).toMatchObject({ code: "mhfe.command.pim" });
    expect(
      refusal(() => COMMAND.decrypt({ work: { pim: 0, memoryLevel: 22 }, words: "auto" })),
    ).toMatchObject({ code: "mhfe.command.memory-level" });
  });
});

describe("the mhfe check command of Check", () => {
  it.each([
    // mhfe 0.8.0 docs/CLI.md, "3. Check", with the settings these examples state.
    [{ kind: "address" }, "mhfe check --pim 0 --mem 0 --address"],
    [
      { kind: "address", coin: "bitcoin", path: "m/84'/0'/0'/0/5" },
      `mhfe check --pim 0 --mem 0 --address --coin bitcoin --path "m/84'/0'/0'/0/5"`,
    ],
    [
      { kind: "address", coin: "bitcoin", path: "m/86'/0'/0'/0/0" },
      `mhfe check --pim 0 --mem 0 --address --coin bitcoin --path "m/86'/0'/0'/0/0"`,
    ],
    [
      { kind: "address", coin: "dash", path: "m/44'/5'/0'/0/0" },
      `mhfe check --pim 0 --mem 0 --address --coin dash --path "m/44'/5'/0'/0/0"`,
    ],
    [
      { kind: "address", coin: "dash", path: "m/9'/5'/17'/0'/0'/0" },
      `mhfe check --pim 0 --mem 0 --address --coin dash --path "m/9'/5'/17'/0'/0'/0"`,
    ],
    [
      { kind: "address", coin: "ethereum", path: "m/44'/60'/0'/0/0" },
      `mhfe check --pim 0 --mem 0 --address --coin ethereum --path "m/44'/60'/0'/0/0"`,
    ],
    [{ kind: "fingerprint" }, "mhfe check --pim 0 --mem 0 --fingerprint"],
    [{ kind: "builtInCheck", words: 12 }, "mhfe check --pim 0 --mem 0 --words 12"],
    [{ kind: "builtInCheck", words: "auto" }, "mhfe check --pim 0 --mem 0 --words auto"],
  ] as const)("writes mhfe's own example %#", (reference, line) => {
    expect(COMMAND.check({ work: { pim: 0, memoryLevel: 0 }, reference })).toBe(line);
  });

  it("leaves the reference to mhfe's list for the phrase + passphrase check and for none", () => {
    for (const reference of [{ kind: "walletCheck" } as const, undefined])
      expect(
        COMMAND.check({
          work: { pim: 3, memoryLevel: 2 },
          ...(reference === undefined ? {} : { reference }),
        }),
      ).toBe("mhfe check --pim 3 --mem 2");
  });

  it("writes a path hardened with h as mhfe parses it, and a lone m", () => {
    expect(
      COMMAND.check({
        work: { pim: 1, memoryLevel: 0 },
        reference: { kind: "address", path: "m/84h/0h/0h/1/2147483647" },
      }),
    ).toBe(`mhfe check --pim 1 --mem 0 --address --path "m/84h/0h/0h/1/2147483647"`);
    expect(
      COMMAND.check({
        work: { pim: 1, memoryLevel: 0 },
        reference: { kind: "address", path: "m" },
      }),
    ).toBe(`mhfe check --pim 1 --mem 0 --address --path "m"`);
  });

  it.each([
    "",
    "m/84'/0'/0'/0/5\"; echo",
    "m/0/$HOME",
    "m/0/`id`",
    "m/0;id",
    "m/0 /1",
    "m/0\n/1",
    "m/0/1H",
    "M/0",
    "m//0",
    "m/0/",
    "m/-1",
    "m/12345678901",
    // mhfe's own limits (src/wallet.rs, DerivationPath::from_str): every step below 2^31, at most
    // 255 steps.
    "m/2147483648",
    "m/2147483648'",
    "m/0/4294967295h",
    `m${"/0".repeat(256)}`,
  ])("refuses a path that mhfe does not parse, or a shell could read otherwise: %j", (path) => {
    expect(
      refusal(() =>
        COMMAND.check({ work: { pim: 0, memoryLevel: 1 }, reference: { kind: "address", path } }),
      ),
    ).toMatchObject({ code: "mhfe.command.path" });
  });

  it.each(["", "Bitcoin", "bitcoin cash", "dash;id", "-dash", "dash-"])(
    "refuses a coin outside the form of mhfe's identifiers: %j",
    (coin) => {
      expect(
        refusal(() =>
          COMMAND.check({
            work: { pim: 0, memoryLevel: 1 },
            reference: { kind: "address", coin: coin as never },
          }),
        ),
      ).toMatchObject({ code: "mhfe.command.coin" });
    },
  );

  it("refuses a built-in check of a length that has none", () => {
    expect(
      refusal(() =>
        COMMAND.check({
          work: { pim: 0, memoryLevel: 1 },
          reference: { kind: "builtInCheck", words: 24 },
        }),
      ),
    ).toMatchObject({
      code: "mhfe.command.words",
      message: "The word count is one of 12, 15, 18, 21, or auto.",
    });
  });
});

describe("the mhfe rekey command of Change password", () => {
  it("states both containers' settings, the password kind and the repair words always", () => {
    expect(
      COMMAND.rekey({
        old: { pim: 1, memoryLevel: 1 },
        new: { pim: 0, memoryLevel: 2 },
        words: 24,
        confirm: "fingerprint",
        newPassword: "checkWord",
        repairWords: 8,
      }),
    ).toBe(
      "mhfe rekey --pim 1 --mem 1 --words 24 --confirm fingerprint --new-pim 0 --new-mem 2 --new-password check-word --repair-words 8",
    );
  });

  it("leaves the length and the confirmation to mhfe's questions while none is chosen", () => {
    expect(
      COMMAND.rekey({
        old: { pim: 0, memoryLevel: 0 },
        new: { pim: 3, memoryLevel: 0 },
        newPassword: "own",
        repairWords: 0,
      }),
    ).toBe(
      "mhfe rekey --pim 0 --mem 0 --new-pim 3 --new-mem 0 --new-password own --repair-words 0",
    );
  });

  it.each([
    // mhfe 0.8.0 docs/CLI.md, "4. Rekey", without --passphrase-used, which the page never writes:
    // mhfe asks it, so that no shell history says whether a wallet has a BIP39 passphrase.
    [
      { words: "auto", confirm: "address", newPim: 1, newPassword: "words", repairWords: 4 },
      "mhfe rekey --pim 0 --mem 0 --words auto --confirm address --new-pim 1 --new-mem 0 --new-password words --repair-words 4",
    ],
    [
      { words: 24, confirm: "show", newPim: 0, newPassword: "characters", repairWords: 0 },
      "mhfe rekey --pim 0 --mem 0 --words 24 --confirm show --new-pim 0 --new-mem 0 --new-password chars --repair-words 0",
    ],
  ] as const)("writes mhfe's own example %#, its passphrase answer left out", (choices, line) => {
    expect(
      COMMAND.rekey({
        old: { pim: 0, memoryLevel: 0 },
        new: { pim: choices.newPim, memoryLevel: 0 },
        words: choices.words,
        confirm: choices.confirm,
        newPassword: choices.newPassword,
        repairWords: choices.repairWords,
      }),
    ).toBe(line);
  });

  it("refuses either container's PIM or level that mhfe refuses", () => {
    const valid = { pim: 0, memoryLevel: 0 };
    for (const [old, next, code] of [
      [{ pim: 1024, memoryLevel: 0 }, valid, "mhfe.command.pim"],
      [valid, { pim: Number.NaN, memoryLevel: 0 }, "mhfe.command.pim"],
      [{ pim: 0, memoryLevel: 22 }, valid, "mhfe.command.memory-level"],
      [valid, { pim: 0, memoryLevel: -1 }, "mhfe.command.memory-level"],
    ] as const)
      expect(
        refusal(() => COMMAND.rekey({ old, new: next, newPassword: "own", repairWords: 0 })),
      ).toMatchObject({ code });
  });
});

/** Paths at mhfe's limits that it parses: a lone m, the highest step, and 255 steps. */
const ACCEPTED_PATHS = [
  "m",
  "m/44'/145'/0'/0/0",
  "m/2147483647'",
  "m/2147483647h/2147483647",
  `m${"/0".repeat(255)}`,
];

describe("what every mhfe command carries", () => {
  /** Every command of a broad set of choices of each operation, all four commands together. */
  function everyCommand(): string[] {
    const lines: string[] = [];
    const works = [0, 1, 1023].flatMap((pim) =>
      [0, 2, 21].map((memoryLevel) => ({ pim, memoryLevel })),
    );
    const lengths = [...LIMITS.wordCounts, "auto"] as const;
    for (const work of works) {
      for (const newPassword of ["own", "words", "checkWord", "characters"] as const)
        for (const sameLength of [false, true])
          lines.push(COMMAND.encrypt({ ...work, sameLength, newPassword, repairWords: 2 }));
      for (const words of lengths) lines.push(COMMAND.decrypt({ work, words }));
      for (const reference of [
        undefined,
        { kind: "address" },
        ...ACCEPTED_PATHS.map((path) => ({
          kind: "address" as const,
          coin: "bitcoin-cash" as const,
          path,
        })),
        { kind: "fingerprint" },
        { kind: "walletCheck" },
        ...[...LIMITS.builtInCheckWordCounts, "auto" as const].map((words) => ({
          kind: "builtInCheck" as const,
          words,
        })),
      ] as const)
        lines.push(COMMAND.check({ work, ...(reference === undefined ? {} : { reference }) }));
      for (const words of [undefined, ...lengths])
        for (const confirm of [undefined, "address", "fingerprint", "show"] as const)
          lines.push(
            COMMAND.rekey({
              old: work,
              new: { pim: work.memoryLevel, memoryLevel: work.pim === 0 ? 0 : 1 },
              ...(words === undefined ? {} : { words }),
              ...(confirm === undefined ? {} : { confirm }),
              newPassword: "own",
              repairWords: 0,
            }),
          );
    }
    return lines;
  }

  it("is a run of options with plain values, and a path only in double quotes", () => {
    const lines = everyCommand();
    expect(lines.length).toBeGreaterThan(400);
    for (const line of lines)
      expect(line).toMatch(
        /^mhfe (?:encrypt|decrypt|check|rekey)(?: --[a-z-]+(?: [a-z0-9-]+| "m(?:\/\d{1,10}['h]?)*")?)+$/u,
      );
  });

  it("carries only a path that mhfe parses: every step below 2^31, at most 255 steps", () => {
    const paths = everyCommand().flatMap((line) => /--path "([^"]*)"/u.exec(line)?.[1] ?? []);
    expect(new Set(paths)).toEqual(new Set(ACCEPTED_PATHS));
    for (const path of paths) {
      const steps = path.split("/").slice(1);
      expect(steps.length).toBeLessThanOrEqual(255);
      for (const step of steps) expect(Number.parseInt(step, 10)).toBeLessThan(2 ** 31);
    }
  });

  it("never names a passphrase answer, a repair of the container, a script or a secret", () => {
    for (const line of everyCommand())
      for (const option of ["--passphrase-used", "--repair ", "--scan-gap", "--stdin"])
        expect(`${line} `).not.toContain(option);
  });

  it("is offered for a PIM or a memory level other than 0 in any work, and only then", () => {
    expect(COMMAND.offered([])).toBe(false);
    expect(COMMAND.offered([{ pim: 0, memoryLevel: 0 }])).toBe(false);
    expect(
      COMMAND.offered([
        { pim: 0, memoryLevel: 0 },
        { pim: 0, memoryLevel: 0 },
      ]),
    ).toBe(false);
    expect(COMMAND.offered([{ pim: 1, memoryLevel: 0 }])).toBe(true);
    expect(COMMAND.offered([{ pim: 0, memoryLevel: 1 }])).toBe(true);
    expect(
      COMMAND.offered([
        { pim: 0, memoryLevel: 0 },
        { pim: 5, memoryLevel: 0 },
      ]),
    ).toBe(true);
    // A ticked, empty PIM field reads as NaN: the page offers the command and says why it cannot.
    expect(COMMAND.offered([{ pim: Number.NaN, memoryLevel: 0 }])).toBe(true);
  });
});

describe("the browser's own runs, at level 0 only", () => {
  it("lets a browser encrypt at level 0 only, and refuses before any secret is read", () => {
    expect(() => COMMAND.assertRunsInBrowser({ pim: 0, memoryLevel: 0 }, "encrypt")).not.toThrow();
    expect(() =>
      COMMAND.assertRunsInBrowser({ pim: 1023, memoryLevel: 0 }, "encrypt"),
    ).not.toThrow();
    expect(
      refusal(() => COMMAND.assertRunsInBrowser({ pim: 3, memoryLevel: 2 }, "encrypt")),
    ).toMatchObject({
      code: "mhfe.command.browser-level",
      message: "A browser runs memory level 0 only: encrypt at level 2 with the mhfe command.",
    });
    // The library refuses a PIM that is no whole number, as a page's empty field would give it.
    expect(() =>
      COMMAND.assertRunsInBrowser({ pim: Number.NaN, memoryLevel: 0 }, "encrypt"),
    ).toThrow(expect.objectContaining({ code: "mhfe.command.pim" }));
  });

  it.each([
    ["decrypt", "A browser runs memory level 0 only: recover at level 1 with the mhfe command."],
    ["check", "A browser runs memory level 0 only: rehearse at level 1 with the mhfe command."],
    [
      "rekey",
      "A browser runs memory level 0 only: change the password at level 1 with the mhfe command.",
    ],
    [
      "wallets",
      "A browser runs memory level 0 only: open hidden wallets at level 1 with the mhfe command.",
    ],
  ] as const)(
    "refuses every level above 0 for %s, and a level mhfe refuses",
    (operation, message) => {
      expect(() => COMMAND.assertLevelRunsInBrowser(0, operation)).not.toThrow();
      for (let level = 1; level <= LIMITS.maxMemoryLevel; level += 1)
        expect(refusal(() => COMMAND.assertLevelRunsInBrowser(level, operation))).toMatchObject({
          code: "mhfe.command.browser-level",
        });
      expect(refusal(() => COMMAND.assertLevelRunsInBrowser(1, operation))).toMatchObject({
        message,
      });
      expect(refusal(() => COMMAND.assertLevelRunsInBrowser(Number.NaN, operation))).toMatchObject({
        code: "mhfe.command.memory-level",
      });
    },
  );

  it("names its refusals for a page, and no other error", () => {
    expect(MhfeCommand.refused(refusal(() => COMMAND.assertLevelRunsInBrowser(2, "check")))).toBe(
      true,
    );
    expect(MhfeCommand.refused(new Error("The PIM is a whole number from 0 to 1023."))).toBe(false);
  });
});

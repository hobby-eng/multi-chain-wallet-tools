import { describe, expect, it } from "vitest";
import { parsePsbt, type ParsedPsbt } from "../src/psbt.js";
import { analyzeInputSigning } from "../src/signing-commitments.js";
import vectors from "./independent-audit/official-vectors.json";

// Synthetic PSBTs: zero-value outputs, distinct dummy outpoints and no signatures.
const PSBT_MAGIC = Buffer.from("70736274ff", "hex");
const OP_TRUE = Buffer.from([0x51]);
const FINAL = 0xffffffff;
const NON_FINAL = 0xfffffffe;
const HEIGHT = 100;
const TIME = 1_700_000_000;
const INACTIVE = " · inactive because every input has a final sequence";
const UNSATISFIABLE = "Unsatisfiable · inputs require both a block height and a Unix time";

interface InputLocks {
  readonly sequence?: number;
  readonly time?: number;
  readonly height?: number;
}

function u32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}
function field(type: number, value: Buffer): Buffer {
  if (value.length >= 0xfd) throw new Error("Test helper only supports one-byte value lengths.");
  return Buffer.concat([Buffer.from([1, type, value.length]), value]);
}
function optionalU32(type: number, value: number | undefined): Buffer[] {
  return value === undefined ? [] : [field(type, u32(value))];
}
function map(fields: readonly Buffer[]): Buffer {
  return Buffer.concat([...fields, Buffer.from([0])]);
}

function v2(inputs: readonly InputLocks[], fallback?: number): ParsedPsbt {
  const psbt = Buffer.concat([
    PSBT_MAGIC,
    map([
      field(0xfb, u32(2)),
      field(0x02, u32(2)),
      ...optionalU32(0x03, fallback),
      field(0x04, Buffer.from([inputs.length])),
      field(0x05, Buffer.from([1])),
    ]),
    ...inputs.map((input, index) =>
      map([
        field(0x0e, Buffer.alloc(32, index + 1)),
        field(0x0f, u32(0)),
        ...optionalU32(0x10, input.sequence),
        ...optionalU32(0x11, input.time),
        ...optionalU32(0x12, input.height),
      ]),
    ),
    map([field(0x03, Buffer.alloc(8)), field(0x04, OP_TRUE)]),
  ]);
  return parsePsbt(psbt.toString("base64"), "bitcoin");
}

function v0(lockTime: number, sequence: number): ParsedPsbt {
  const input = Buffer.concat([Buffer.alloc(32, 1), u32(0), Buffer.from([0]), u32(sequence)]);
  const output = Buffer.concat([Buffer.alloc(8), Buffer.from([OP_TRUE.length]), OP_TRUE]);
  const unsigned = Buffer.concat([u32(2), Buffer.from([1]), input, Buffer.from([1]), output]);
  const psbt = Buffer.concat([
    PSBT_MAGIC,
    map([field(0x00, Buffer.concat([unsigned, u32(lockTime)]))]),
    map([]),
    map([]),
  ]);
  return parsePsbt(psbt.toString("base64"), "bitcoin");
}

function locktimes(parsed: ParsedPsbt): string[] {
  return parsed.inputs.map((_map, index) => analyzeInputSigning(parsed, index).locktime);
}

function requirementStatuses(parsed: ParsedPsbt): (string | undefined)[] {
  return parsed.inputVerification.map(
    (checks) =>
      checks.find(({ relationship }) => relationship === "PSBT v2 locktime requirements")?.status,
  );
}

describe("absolute locktime under BIP370 and the transaction-wide sequence rule", () => {
  it("marks a required height or time inactive when every sequence is final", () => {
    const cases = [
      { locks: { height: HEIGHT }, text: `Effective transaction lock: block height ${HEIGHT}` },
      { locks: { time: TIME }, text: `Effective transaction lock: Unix time ${TIME}` },
    ];
    for (const { locks, text } of cases) {
      expect(locktimes(v2([locks]))).toEqual([`${text}${INACTIVE}`]);
      expect(locktimes(v2([{ ...locks, sequence: FINAL }]))).toEqual([`${text}${INACTIVE}`]);
      expect(locktimes(v2([{ ...locks, sequence: NON_FINAL }]))).toEqual([text]);
    }
  });

  it("applies the same sequence rule to the fallback and the v0 serialized locktime", () => {
    expect(locktimes(v2([{}], HEIGHT))).toEqual([`Block height ${HEIGHT}${INACTIVE}`]);
    expect(locktimes(v2([{ sequence: NON_FINAL }], HEIGHT))).toEqual([`Block height ${HEIGHT}`]);
    expect(locktimes(v2([{ sequence: NON_FINAL }], TIME))).toEqual([`Unix time ${TIME}`]);
    expect(locktimes(v2([{ sequence: NON_FINAL }], 0))).toEqual(["None"]);
    expect(locktimes(v2([{ sequence: NON_FINAL }]))).toEqual(["None"]);
    expect(locktimes(v0(HEIGHT, FINAL))).toEqual([`Block height ${HEIGHT}${INACTIVE}`]);
    expect(locktimes(v0(HEIGHT, NON_FINAL))).toEqual([`Block height ${HEIGHT}`]);
  });

  it("treats the requirements of one input as alternatives and prefers height", () => {
    const timeWins = [{ height: HEIGHT, time: TIME }, { time: TIME + 1 }];
    const text = `Effective transaction lock: Unix time ${TIME + 1}`;
    expect(locktimes(v2(timeWins.map((locks) => ({ ...locks, sequence: NON_FINAL }))))).toEqual([
      text,
      text,
    ]);
    expect(locktimes(v2(timeWins))).toEqual([`${text}${INACTIVE}`, `${text}${INACTIVE}`]);
    const heightWins = v2([
      { height: HEIGHT, time: TIME + 1, sequence: NON_FINAL },
      { height: HEIGHT + 1, time: TIME, sequence: NON_FINAL },
    ]);
    expect(locktimes(heightWins)).toEqual(
      Array(2).fill(`Effective transaction lock: block height ${HEIGHT + 1}`),
    );
  });

  it("keeps the lock active for every input when any one sequence is non-final", () => {
    const parsed = v2([
      { height: HEIGHT, sequence: NON_FINAL },
      { height: HEIGHT, sequence: FINAL },
    ]);
    expect(locktimes(parsed)).toEqual(
      Array(2).fill(`Effective transaction lock: block height ${HEIGHT}`),
    );
  });

  it("never shows the fallback when the input requirements use incompatible units", () => {
    const parsed = v2(
      [
        { time: TIME, sequence: NON_FINAL },
        { height: HEIGHT, sequence: NON_FINAL },
        { sequence: NON_FINAL },
      ],
      5,
    );
    expect(locktimes(parsed)).toEqual(Array(3).fill(UNSATISFIABLE));
    expect(requirementStatuses(parsed)).toEqual(["failed", "failed", "failed"]);
  });

  it("keeps validation and signing in agreement at the required-unit boundaries", () => {
    // Independent BIP370 expectations: the maximum in the common unit, height preferred when
    // both work, unrestricted inputs ignored, and even an opposite-unit fallback overridden.
    const cases = [
      {
        inputs: [{ height: 1 }, { height: 499_999_999 }, {}, { height: 12, time: TIME }],
        fallback: 0xffffffff,
        expected: "Effective transaction lock: block height 499999999",
      },
      {
        inputs: [{ time: 500_000_000 }, { time: 0xffffffff }, {}, { height: 12, time: TIME }],
        fallback: 1,
        expected: "Effective transaction lock: Unix time 4294967295",
      },
      {
        inputs: [{ height: 10, time: TIME }, { height: 20, time: TIME + 1 }, {}],
        fallback: TIME + 100,
        expected: "Effective transaction lock: block height 20",
      },
    ];
    for (const { inputs, fallback, expected } of cases) {
      const parsed = v2(
        inputs.map((input) => ({ ...input, sequence: NON_FINAL })),
        fallback,
      );
      expect(locktimes(parsed)).toEqual(Array(inputs.length).fill(expected));
      expect(requirementStatuses(parsed)).toEqual(
        inputs.map((input) =>
          "height" in input || "time" in input ? "verified" : "not-applicable",
        ),
      );
    }
  });

  it("does not allow an alternative input or a fallback to bridge incompatible units", () => {
    const inputs = [{ height: HEIGHT }, { height: HEIGHT + 1, time: TIME + 1 }, { time: TIME }, {}];
    for (const order of [inputs, [...inputs].reverse()]) {
      const parsed = v2(
        order.map((input) => ({ ...input, sequence: NON_FINAL })),
        TIME + 10,
      );
      expect(locktimes(parsed)).toEqual(Array(4).fill(UNSATISFIABLE));
      expect(requirementStatuses(parsed)).toEqual(Array(4).fill("failed"));
    }
  });

  it("refuses out-of-unit required values on the actual PSBT parse path", () => {
    for (const height of [0, 500_000_000, 0xffffffff]) {
      // A valid time alternative cannot excuse a malformed height requirement.
      expect(() => v2([{ height, time: TIME }])).toThrow(
        "Required height lock is outside 1..499999999.",
      );
    }
    for (const time of [0, 499_999_999]) {
      expect(() => v2([{ height: HEIGHT, time }])).toThrow(
        "Required time lock is below 500000000.",
      );
    }
  });

  it("matches the official BIP370 locktime determination vectors", () => {
    const official = vectors.psbt["0370"];
    const locktimesOf = (name: string): string[][] => {
      const rows = official.filter((row) => row.valid && row.name === name);
      expect(rows.length, name).toBeGreaterThan(0);
      return rows.map((row) => locktimes(parsePsbt(row.base64, "bitcoin")));
    };
    const height = `Effective transaction lock: block height 10000${INACTIVE}`;
    const time = `Effective transaction lock: Unix time 1657048460${INACTIVE}`;
    // These vectors omit PSBT_IN_SEQUENCE, so every computed lock is inactive.
    const expected: Readonly<Record<string, string>> = {
      "No locktimes specified": "None",
      "Fallback locktime of 0": "None",
      "Input 1 has PSBT_IN_REQUIRED_HEIGHT_LOCKTIME of 10000, Input 2 has no locktime fields":
        height,
      "Input 1 has PSBT_IN_REQUIRED_HEIGHT_LOCKTIME of 10000, Input 2 has PSBT_IN_REQUIRED_HEIGHT_LOCKTIME of 9000":
        height,
      "Input 1 has PSBT_IN_REQUIRED_HEIGHT_LOCKTIME of 10000, Input 2 has PSBT_IN_REQUIRED_HEIGHT_LOCKTIME of 9000 and PSBT_IN_REQUIRED_TIME_LOCKTIME of 1657048460":
        height,
      "Input 1 has PSBT_IN_REQUIRED_HEIGHT_LOCKTIME of 10000 and PSBT_IN_REQUIRED_TIME_LOCKTIME of 1657048459, Input 2 has PSBT_IN_REQUIRED_HEIGHT_LOCKTIME of 9000 and PSBT_IN_REQUIRED_TIME_LOCKTIME of 1657048460":
        height,
      "Input 1 has PSBT_IN_REQUIRED_TIME_LOCKTIME of 1657048459, Input 2 has PSBT_IN_REQUIRED_HEIGHT_LOCKTIME of 9000 and PSBT_IN_REQUIRED_TIME_LOCKTIME of 1657048460":
        time,
      "Input 1 has PSBT_IN_REQUIRED_HEIGHT_LOCKTIME of 10000 and PSBT_IN_REQUIRED_TIME_LOCKTIME of 1657048459, Input 2 has PSBT_IN_REQUIRED_TIME_LOCKTIME of 1657048460":
        time,
      "Input 1 has PSBT_IN_REQUIRED_HEIGHT_LOCKTIME of 10000, Input 2 has PSBT_IN_REQUIRED_TIME_LOCKTIME of 1657048460":
        UNSATISFIABLE,
    };
    for (const [name, text] of Object.entries(expected)) {
      for (const rows of locktimesOf(name)) {
        expect(rows, name).toEqual(Array(rows.length).fill(text));
      }
    }
    expect(locktimesOf("1 input, 2 output updated PSBTv2, with all PSBTv2 fields")).toEqual([
      ["Effective transaction lock: block height 10000"],
    ]);
  });
});

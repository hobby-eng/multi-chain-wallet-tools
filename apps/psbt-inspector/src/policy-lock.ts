import { CONSENSUS_LIMITS, RelativeSequence } from "./consensus-limits.js";

const LOCK_KINDS = ["none", "height", "time", "relative-blocks", "relative-time"] as const;
/** The preset lock choices, validated by PolicyLock.kind before use. */
export type LockKind = (typeof LOCK_KINDS)[number];

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
// Builder months are fixed 30-day durations, not calendar months.
const DAYS_PER_MONTH = 30;
const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
const SECONDS_PER_DAY = SECONDS_PER_HOUR * HOURS_PER_DAY;
const SECONDS_BY_UNIT = new Map<string, number>([
  ["seconds", 1],
  ["minutes", SECONDS_PER_MINUTE],
  ["hours", SECONDS_PER_HOUR],
  ["days", SECONDS_PER_DAY],
  ["months", DAYS_PER_MONTH * SECONDS_PER_DAY],
]);
// The preset builder supports positive four-byte CScriptNum values (one bit is the sign).
const MAXIMUM_POLICY_LOCK_VALUE = 0x7fffffff;
const REFUSALS = {
  kind: "Select a supported policy lock type.",
  value: "Lock value is outside the supported script-number range.",
  height: `Absolute block height must be below ${CONSENSUS_LIMITS.absoluteLockTimeThreshold}; larger values are timestamps.`,
  time: `Absolute Unix locktime must be at least ${CONSENSUS_LIMITS.absoluteLockTimeThreshold}.`,
  "relative-blocks": `Relative block delay cannot exceed ${CONSENSUS_LIMITS.bip68SequenceMask}.`,
  unit: "Unsupported relative time unit.",
} as const;

/** A coded policy admission refusal without interpolating caller input. */
export class PolicyLockError extends Error {
  readonly code: `policy.lock.${keyof typeof REFUSALS}`;
  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "PolicyLockError";
    this.code = `policy.lock.${code}`;
  }
}

/** A preset policy's numeric lock, its Miniscript operand and its spending requirement. */
export class PolicyLock {
  readonly #fragment: string;
  readonly #requirement: string;

  constructor(inputKind: unknown, value: number) {
    const kind = PolicyLock.kind(inputKind);
    if (kind === "none") {
      this.#fragment = "";
      this.#requirement = "No timelock";
      return;
    }
    if (!Number.isSafeInteger(value) || value < 0 || value > MAXIMUM_POLICY_LOCK_VALUE)
      throw new PolicyLockError("value");
    let encoded = value;
    let fragmentName: "after" | "older";
    if (kind === "height") {
      if (value >= CONSENSUS_LIMITS.absoluteLockTimeThreshold) throw new PolicyLockError("height");
      fragmentName = "after";
      this.#requirement = `Absolute block height ≥ ${value}; spending input sequence must not be final`;
    } else if (kind === "time") {
      if (value < CONSENSUS_LIMITS.absoluteLockTimeThreshold) throw new PolicyLockError("time");
      fragmentName = "after";
      this.#requirement = `Absolute median-time-past locktime ≥ ${value}; spending input sequence must not be final`;
    } else if (kind === "relative-blocks") {
      if (value > CONSENSUS_LIMITS.bip68SequenceMask) throw new PolicyLockError("relative-blocks");
      fragmentName = "older";
      this.#requirement = `Relative delay of ${value} blocks via BIP68/BIP112 sequence`;
    } else {
      const sequence = RelativeSequence.fromSeconds(value);
      encoded = sequence.value;
      fragmentName = "older";
      this.#requirement = `Relative delay of ${sequence.seconds} seconds (${sequence.units} × ${RelativeSequence.secondsPerUnit}-second units) via BIP68/BIP112 sequence`;
    }
    this.#fragment = `${fragmentName}(${encoded})`;
  }

  /** Refuses unknown runtime kinds instead of silently selecting relative-time behavior. */
  static kind(value: unknown): LockKind {
    const kind = LOCK_KINDS.find((candidate) => candidate === value);
    if (kind === undefined) throw new PolicyLockError("kind");
    return kind;
  }

  /** Convert either builder field to the library's units; only relative time uses a selector. */
  static normalizeInputValue(inputKind: unknown, value: number, timeUnit: string): number {
    const kind = PolicyLock.kind(inputKind);
    if (kind !== "relative-time") return value;
    const multiplier = SECONDS_BY_UNIT.get(timeUnit);
    if (multiplier === undefined) throw new PolicyLockError("unit");
    return value * multiplier;
  }

  /** The admitted Miniscript lock fragment; empty only for the explicit none choice. */
  get fragment(): string {
    return this.#fragment;
  }

  /** The corresponding spending constraint, using the same encoded units as the fragment. */
  get requirement(): string {
    return this.#requirement;
  }
}

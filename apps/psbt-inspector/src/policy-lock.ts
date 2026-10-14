import { CONSENSUS_LIMITS, RelativeSequence } from "./consensus-limits.js";

export type LockKind = "none" | "height" | "time" | "relative-blocks" | "relative-time";

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

/** A preset policy's numeric lock, its Miniscript operand and its spending requirement. */
export class PolicyLock {
  readonly #fragment: string;
  readonly #requirement: string;

  constructor(kind: LockKind, value: number) {
    if (kind === "none") {
      this.#fragment = "";
      this.#requirement = "No timelock";
      return;
    }
    if (!Number.isSafeInteger(value) || value < 0 || value > MAXIMUM_POLICY_LOCK_VALUE)
      throw new Error("Lock value is outside the supported script-number range.");
    let encoded = value;
    let fragmentName: "after" | "older";
    if (kind === "height") {
      if (value >= CONSENSUS_LIMITS.absoluteLockTimeThreshold)
        throw new Error(
          "Absolute block height must be below 500000000; larger values are timestamps.",
        );
      fragmentName = "after";
      this.#requirement = `Absolute block height ≥ ${value}; spending input sequence must not be final`;
    } else if (kind === "time") {
      if (value < CONSENSUS_LIMITS.absoluteLockTimeThreshold)
        throw new Error("Absolute Unix locktime must be at least 500000000.");
      fragmentName = "after";
      this.#requirement = `Absolute median-time-past locktime ≥ ${value}; spending input sequence must not be final`;
    } else if (kind === "relative-blocks") {
      if (value > CONSENSUS_LIMITS.bip68SequenceMask)
        throw new Error("Relative block delay cannot exceed 65535.");
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

  /** Convert either builder field to the library's units; only relative time uses a selector. */
  static normalizeInputValue(kind: LockKind, value: number, timeUnit: string): number {
    if (kind !== "relative-time") return value;
    const multiplier = SECONDS_BY_UNIT.get(timeUnit);
    if (multiplier === undefined) throw new Error("Unsupported relative time unit.");
    return value * multiplier;
  }

  get fragment(): string {
    return this.#fragment;
  }

  get requirement(): string {
    return this.#requirement;
  }
}

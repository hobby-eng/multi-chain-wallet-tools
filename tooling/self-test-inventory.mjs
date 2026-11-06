const MESSAGES = Object.freeze({
  incomplete: (label) => `${label} returned an incomplete report.`,
  inventory: (label, missing, unexpected) =>
    `${label} vector set changed: missing ${missing.join(", ") || "none"}; unexpected ${unexpected.join(", ") || "none"}. ` +
    "Add a new vector to the expected list deliberately.",
});

class SelfTestReportError extends Error {
  #code;

  constructor(code, label, missing = [], unexpected = []) {
    super(MESSAGES[code](label, missing, unexpected));
    this.name = "SelfTestReportError";
    this.#code = `self-test.report.${code}`;
  }

  get code() {
    return this.#code;
  }
}

/** Admits public self-test reports against an independent inventory without losing duplicates. */
export class SelfTestInventory {
  #definition;

  /** The caller supplies a reviewed public label and independent expected check inventory. */
  constructor({ label, expectedChecks }) {
    this.#definition = Object.freeze({
      label,
      expectedChecks: Object.freeze([...expectedChecks]),
    });
  }

  /** Refuses incomplete reports or a different multiset of checks, including substituted repeats. */
  check(report) {
    const { expectedChecks, label } = this.#definition;
    const suppliedChecks = report?.checks;
    const checks = Array.isArray(suppliedChecks) ? Array.from(suppliedChecks) : null;
    const durationMs = report?.durationMs;
    if (
      report?.passed !== true ||
      checks === null ||
      checks.some((check) => typeof check !== "string") ||
      !Number.isFinite(durationMs) ||
      durationMs < 0
    )
      throw new SelfTestReportError("incomplete", label);
    const remaining = new Map();
    for (const check of checks) remaining.set(check, (remaining.get(check) ?? 0) + 1);
    const missing = [];
    for (const check of expectedChecks) {
      const count = remaining.get(check) ?? 0;
      if (count === 0) missing.push(check);
      else remaining.set(check, count - 1);
    }
    const unexpected = [...remaining].flatMap(([check, count]) => Array(count).fill(check));
    if (missing.length > 0 || unexpected.length > 0)
      throw new SelfTestReportError("inventory", label, missing, unexpected);
    return Object.freeze({ passed: true, checks: Object.freeze(checks), durationMs });
  }
}

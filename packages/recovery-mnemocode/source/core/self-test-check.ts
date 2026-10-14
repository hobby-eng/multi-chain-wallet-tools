// What every self-test check is made of: its row in the report, the checks of one feature (quick
// known answers for every start, and its row in the full self-test), and the comparisons they make.
// Each feature keeps its checks in a module beside it, so that a build without the feature carries
// none of them; core/self-test.ts composes those of the library, and a host adds those of the
// features it builds in.
//
// Host-neutral: it takes only refusal messages and the shared error catalog.

import { describeError } from "./refusal.js";
import { ErrorCatalog } from "./error-catalog.js";

const ERRORS = new ErrorCatalog("core.self-test-check", {
  mismatch: (value0: string) => `${value0} mismatch.`,
  "was-accepted": (value0: string) => `${value0} was accepted.`,
  "was-refused-another-reason": (value0: string) => `${value0} was refused for another reason.`,
});

/** One check of a self-test: its name and what it covers, as the report shows them. */
export interface SelfTestCheck {
  readonly name: string;
  readonly detail: string;
  run(): void | Promise<void>;
}

/**
 * The checks of one feature that a host builds in: known answers quick enough for every start,
 * and the feature's row in the full self-test, which runs them too, with the slower checks.
 */
export interface SelfTestFeature {
  /** Synchronous known answers that need nothing from the host: milliseconds. */
  readonly startup: () => void;
  readonly check: SelfTestCheck;
}

/**
 * A feature's checks as a host builds them in: `startup`, its known answers for every start, and
 * its row of the full self-test, `name` with `detail`, which runs `run`.
 */
export function selfTestFeature(parts: {
  readonly name: string;
  readonly detail: string;
  readonly startup: () => void;
  readonly run: () => void | Promise<void>;
}): SelfTestFeature {
  const { name, detail, startup, run } = parts;
  return Object.freeze({ startup, check: Object.freeze({ name, detail, run }) });
}

/**
 * `features` as one row of the full self-test, named `name` with `detail`: their startup checks
 * in turn at every start, and all their checks in turn when the row runs.
 */
export function combinedFeature(
  name: string,
  detail: string,
  features: readonly SelfTestFeature[],
): SelfTestFeature {
  const parts = Object.freeze([...features]);
  return selfTestFeature({
    name,
    detail,
    startup: () => {
      for (const part of parts) part.startup();
    },
    run: async () => {
      for (const part of parts) await part.check.run();
    },
  });
}

/** Throws, naming what was compared, unless `actual` is exactly `expected`. */
export function expectSame(actual: unknown, expected: unknown, name: string): void {
  if (actual !== expected) throw ERRORS.create("mismatch", [`${name}`]);
}

/** The message of what `run` throws, or undefined when it throws nothing. */
function refusalOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return describeError(error);
  }
  return undefined;
}

/**
 * Throws, naming the case, unless `message`, what the case threw, is a refusal that `because`
 * matches; undefined means that the case was accepted.
 */
function assertRefusedFor(message: string | undefined, because: RegExp, name: string): void {
  if (message === undefined) throw ERRORS.create("was-accepted", [`${name}`]);
  if (!because.test(message)) throw ERRORS.create("was-refused-another-reason", [`${name}`]);
}

/**
 * Throws, naming the case, unless `run` refuses it with a message that `because` matches: a case
 * the feature must refuse, for the reason it must refuse it.
 */
export function expectRefused(run: () => unknown, because: RegExp, name: string): void {
  assertRefusedFor(refusalOf(run), because, name);
}

/** The same as expectRefused, for an operation that answers later. */
export async function expectRefusedLater(
  run: () => Promise<unknown>,
  because: RegExp,
  name: string,
): Promise<void> {
  let message: string | undefined;
  try {
    await run();
  } catch (error) {
    message = describeError(error);
  }
  assertRefusedFor(message, because, name);
}

// Bytes as hexadecimal text and back (core/bits.ts), here too for the checks that use them.
export { bytesOfHex, hexOfBytes } from "./bits.js";

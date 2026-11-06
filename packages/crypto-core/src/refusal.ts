// From MnemoCode TS 0.1.0 (MIT), core/refusal.ts: wallet-tools keeps its own copy since
// MnemoCode moved to Rust and its pages use its WebAssembly.
// What a thrown value says. A refusal of input is an Error whose message is shown to the person,
// and anything else that is thrown is a fault that passes through (refusalMessage); a report that
// must not throw again says what any thrown value is (describeError). The two are different rules:
// do not merge them. Work whose cleanup fails after the work failed keeps both failures, the
// work's first (afterFailure).
//
// Imports nothing, so that every module can take it, the self-tests and the scripts included,
// which load it as TypeScript without a build.

/**
 * The message of a refusal: the Error's message; anything thrown that is no Error passes through.
 */
export function refusalMessage(error: unknown): string {
  if (!(error instanceof Error)) throw error;
  return error.message;
}

/** What any thrown value says, for a report: an Error's message, or the value as text. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** An Error's string code, read once; undefined for other thrown values or a non-string code. */
export function errorCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("code" in error)) return undefined;
  const code: unknown = error.code;
  return typeof code === "string" ? code : undefined;
}

/** A failure as the inside of a sentence: its description without the full stop. */
export function failureClause(failure: unknown): string {
  return describeError(failure).replace(/\.$/u, "");
}

/** The code of work that failed and whose cleanup failed too (CleanupAfterFailureError). */
type CleanupAfterFailureCode = "core.refusal.cleanup-failed-after-failure";

/**
 * Work that failed, after which its cleanup failed too, such as the removal of its temporary
 * folder: the message names the work's failure first, `cause` is that failure and `cleanup` the
 * cleanup's error, so that neither takes the other's place (CORE-22).
 */
class CleanupAfterFailureError extends Error {
  /** Stable code of work whose cleanup failed after it failed. */
  readonly code: CleanupAfterFailureCode = "core.refusal.cleanup-failed-after-failure";
  /** Why the cleanup failed: the error it gave. */
  readonly cleanup: unknown;

  constructor(failure: unknown, cleanup: unknown) {
    super(
      `${failureClause(failure)}; the cleanup afterwards failed too: ${failureClause(cleanup)}.`,
      { cause: failure },
    );
    this.name = "CleanupAfterFailureError";
    this.cleanup = cleanup;
  }
}

/**
 * Runs `cleanup`, such as the removal of a temporary folder, after work failed with `failure`, and
 * gives what the caller throws: the failure itself, or, where the cleanup fails too, what `kept`
 * makes of the failure and the cleanup's error, which keeps both. By default that is an error with
 * the code core.refusal.cleanup-failed-after-failure, whose `cause` is the failure and whose
 * `cleanup` is the cleanup's error. A cleanup error never takes the failure's place (CORE-22). A
 * cleanup after work that succeeded is called on its own, and its error is the one thrown.
 */
export async function afterFailure(
  failure: unknown,
  cleanup: () => void | Promise<void>,
  kept: (failure: unknown, cleanupError: unknown) => Error = (work, error) =>
    new CleanupAfterFailureError(work, error),
): Promise<unknown> {
  try {
    await cleanup();
    return failure;
  } catch (error) {
    return kept(failure, error);
  }
}

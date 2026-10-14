// What a thrown value says. A refusal of input is an Error whose message is shown to the person,
// and anything else that is thrown is a fault that passes through (refusalMessage); a report that
// must not throw again says what any thrown value is (describeError). The two are different rules:
// do not merge them.
//
// Imports nothing, so that every module can take it, the self-tests included.

/** The message of a refusal: the Error's message; anything thrown that is no Error passes through. */
export function refusalMessage(error: unknown): string {
  if (!(error instanceof Error)) throw error;
  return error.message;
}

/** What any thrown value says, for a report: an Error's message, or the value as text. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

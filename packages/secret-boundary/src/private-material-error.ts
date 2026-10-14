// The refusal of private key material at a public input, apart from the guard that detects it: a
// page tells the refusal by its name without loading the guard and its word lists.

export class PrivateMaterialError extends Error {
  constructor(
    message = "Private key-like material was detected and erased. No network request was made.",
  ) {
    super(message);
    this.name = "PrivateMaterialError";
  }
}

/**
 * Whether `cause` is that refusal. By its name, not by its class: a refusal raised in another
 * bundle or passed on from a worker is no instance of this page's class.
 */
export function isPrivateMaterialError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === "PrivateMaterialError";
}

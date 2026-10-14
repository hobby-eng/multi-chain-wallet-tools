// Why a candidate file was refused, shared by the plain format and its encryption without either
// importing the other.

import { inWholeRange, wholeNumbersFrom } from "./typed-number.js";

/**
 * Why a candidate file was refused, by the step it failed at: its size or header is not that of a
 * list (`unsupported`), the key given does not open it (`key`), or its contents were changed or cut
 * (`damaged`).
 */
export type CandidateFileProblem = "unsupported" | "key" | "damaged";

/**
 * Thrown when a candidate file cannot be opened, with why (`problem`), so that a host can add its
 * own words where it knows more, such as which page a key belongs to. age's own error, where it
 * failed, is the `cause`.
 */
export class CandidateFileRefused extends Error {
  readonly problem: CandidateFileProblem;

  constructor(problem: CandidateFileProblem, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.problem = problem;
  }
}

/** A byte count checked before reading, allocating, or copying a candidate file. */
export function assertCandidateFileSize(size: number, maximum: number, what: string): void {
  if (!inWholeRange(size, wholeNumbersFrom(0)))
    throw new CandidateFileRefused(
      "unsupported",
      "The candidate file size must be a non-negative safe integer.",
    );
  if (size > maximum)
    throw new CandidateFileRefused(
      "unsupported",
      `The ${what} exceeds the supported limit of ${maximum} bytes.`,
    );
}

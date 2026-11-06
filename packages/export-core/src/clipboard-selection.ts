/** A refused clipboard selection, without any selected field values. */
export class ClipboardSelectionError extends Error {
  readonly code: "export.clipboard.limit" | "export.clipboard.count";
  readonly valueCount: number;
  constructor(code: ClipboardSelectionError["code"], valueCount: number) {
    super(code);
    this.name = "ClipboardSelectionError";
    this.code = code;
    this.valueCount = valueCount;
  }
}

/** Admission for in-memory clipboard assembly; downloads have a separate streaming lifetime. */
export class ClipboardSelection {
  static readonly #maximumValues = 200_000;
  /** Maximum number of selected field values assembled as one clipboard string. */
  static get maximumValues(): number {
    return ClipboardSelection.#maximumValues;
  }
  /** Refuses invalid counts or values above the assembly bound before formatting any field. */
  static admit(valueCount: number): void {
    if (!Number.isSafeInteger(valueCount) || valueCount < 0)
      throw new ClipboardSelectionError("export.clipboard.count", valueCount);
    if (valueCount > ClipboardSelection.#maximumValues)
      throw new ClipboardSelectionError("export.clipboard.limit", valueCount);
  }
}

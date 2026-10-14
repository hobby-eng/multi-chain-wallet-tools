import {
  isEncodedFormat,
  isMaskingMode,
  type EncodedFormat,
  type MaskingMode,
} from "./core/types.js";

export const MNEMOCODE_RECORD_VERSION = 1 as const;
/** @deprecated Use MaskingMode; kept because index.ts exports it and hosts import it. */
export type RecordMode = MaskingMode;
/** @deprecated Use EncodedFormat; kept because index.ts exports it and hosts import it. */
export type RecordFormat = EncodedFormat;

export interface MnemoCodeRecord {
  readonly version: typeof MNEMOCODE_RECORD_VERSION;
  readonly mode: MaskingMode;
  readonly format: EncodedFormat;
  readonly payload: string;
}

// The version is a number without leading zeros, so "MNC01:" is malformed rather than read as 1.
// A header whose mode is none of the modes is malformed too, before its version is read.
/** What every record starts with, before its version. */
const RECORD_PREFIX = "MNC";
const recordPattern = new RegExp(
  `^${RECORD_PREFIX}([1-9][0-9]*):([a-z-]+):([a-z-]+):([\\s\\S]+)$`,
  "u",
);

/** Wraps a raw representation with enough public metadata to select its decoder later. */
export function serializeRecord(mode: MaskingMode, format: EncodedFormat, payload: string): string {
  if (!isMaskingMode(mode)) throw new Error(`Unsupported MnemoCode record mode: ${String(mode)}.`);
  if (!isEncodedFormat(format))
    throw new Error(`Unsupported MnemoCode record format: ${String(format)}.`);
  const normalized = payload.trim();
  if (normalized.length === 0) throw new Error("A MnemoCode record payload must not be empty.");
  return `${RECORD_PREFIX}${MNEMOCODE_RECORD_VERSION}:${mode}:${format}:${normalized}`;
}

/** Reads a versioned record, or returns undefined for legacy raw representations. */
export function parseRecord(value: string): MnemoCodeRecord | undefined {
  const normalized = value.trim();
  if (!normalized.startsWith(RECORD_PREFIX)) return undefined;
  const match = recordPattern.exec(normalized);
  if (match === null || !isMaskingMode(match[2]))
    throw new Error("Malformed MnemoCode record header.");
  const version = Number(match[1]);
  // The pattern admits only versions from 1 up, so any other than this one is newer.
  if (version !== MNEMOCODE_RECORD_VERSION)
    throw new Error(
      `Unsupported MnemoCode record version: ${version}. A newer MnemoCode reads it.`,
    );
  const format = match[3];
  if (!isEncodedFormat(format))
    throw new Error(`Unsupported MnemoCode record format: ${match[3]}.`);
  return {
    version: MNEMOCODE_RECORD_VERSION,
    mode: match[2],
    format,
    payload: match[4]!,
  };
}

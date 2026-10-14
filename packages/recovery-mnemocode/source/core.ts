/** Stable public API. Implementations are grouped by responsibility in core/. */
export {
  BIP39_WORD_COUNTS,
  ENCODED_FORMATS,
  MASKING_MODES,
  type Bip39WordCount,
  type EncodedFormat,
  type MaskingMode,
  type OutputFormat,
  type DateShiftDate,
  type EncodedResult,
  type DecodedResult,
  type MappingRow,
  type MissingWordCandidate,
  type DatePattern,
} from "./core/types.js";
export {
  unicodeHex,
  mappingRow,
  allMappingRows,
  wordTableRow,
  wordTableText,
  UNICODE_CODE_HINT,
  type WordTableLookup,
  recoverLegacyValidLastWords,
} from "./core/words.js";
export {
  maximumDates,
  isLeapYear,
  daysInMonth,
  parseDate,
  formatDate,
  sortDates,
  deriveShifts,
  parseDatePattern,
  datePatternCandidates,
  datePatternCandidateCount,
  datePatternCombinationCount,
  datePatternCombinations,
  expandDatePattern,
} from "./core/dates.js";
export {
  indexesToColors,
  parseColors,
  colorsToIndexes,
  colorsToUnicode,
  unicodeToColors,
} from "./core/colors.js";
export { parseInput, detectInputFormats, formatEncoded } from "./core/representations.js";
export {
  dateRecoveryCandidates,
  type DateCandidate,
  type SeedshiftMode,
} from "./core/date-recovery.js";
// The arithmetic of each mode, one function per mode: compatibility exports kept for existing
// callers. New code encodes and decodes through Masking.of(mode) (index level) or EncodedBackup
// (codes as text), which dispatch over every mode.
export {
  encodeMnemonic,
  encodeMnemonicLegacy,
  legacyChecksumValidResult,
  representMnemonic,
  decodeIndexesLegacy,
  decodeInputLegacy,
  decodeInputDirect,
} from "./core/seedshift.js";
export { decodeIndexes, decodeIndexesLegacyValid, decodeInput } from "./core/masking.js";

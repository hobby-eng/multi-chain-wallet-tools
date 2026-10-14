// MnemoCode's word table as its command line shows it (mnemocode table): each BIP39 word with its
// number, 1 to 2048, and the Unicode code of the character that MnemoCode's Unicode form writes for
// it. The rows, the look-ups and their refusals are MnemoCode's own (core/words.ts).
export {
  UNICODE_CODE_HINT,
  wordTableRow,
  wordTableText,
  type WordTableLookup,
} from "../../recovery-mnemocode/source/core/words.js";
export type { MappingRow } from "../../recovery-mnemocode/source/core/types.js";

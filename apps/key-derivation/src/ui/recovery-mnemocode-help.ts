import type { MnemoCodeFormat, MnemoCodeMode } from '@ckd/recovery-backup/mnemocode.js';

/** Text of one "How it works" popover. Steps are shown as a numbered list. */
export interface MnemoCodeHelp {
  readonly title: string;
  readonly introduction: string;
  readonly steps?: readonly string[];
  readonly notes?: readonly string[];
}

export const MNEMOCODE_MODE_HELP: Readonly<Record<MnemoCodeMode, MnemoCodeHelp>> = {
  direct: {
    title: 'Direct',
    introduction:
      'The phrase is not changed. It is only written in the selected representation, and no dates are needed.',
    notes: [
      'Anyone who knows the representation can read the phrase back, so this hides the phrase only from a casual look.',
    ],
  },
  seedshift: {
    title: 'Seedshift · checksum-valid',
    introduction: 'Dates that you choose shift the phrase before it is written.',
    steps: [
      'The dates are sorted from the oldest to the newest.',
      'Their year, month and day numbers form a repeating list of shifts, one shift per word.',
      'Every word moves forward in the BIP39 list of 2048 words by its shift. In the last word only the part that carries phrase data moves.',
      'The checksum part of the last word is calculated again, so the result is a valid BIP39 phrase.',
    ],
    notes: [
      'Decoding with the same dates moves every word back and returns the original phrase.',
      'Wrong dates do not give an error. They give a different valid phrase, so keep the dates exactly. One date is allowed for every three words.',
    ],
  },
  'seedshift-legacy': {
    title: 'Legacy Seedshift',
    introduction: 'The original Seedshift method, kept for records that were made with it.',
    steps: [
      'The dates are sorted and turned into a list of shifts, as in Seedshift.',
      'Every whole word, including the last one, moves forward in the BIP39 list by its shift.',
    ],
    notes: [
      'The checksum is not calculated again, so the result is usually not a valid BIP39 phrase and a wallet rejects it.',
    ],
  },
  'seedshift-legacy-valid': {
    title: 'Legacy Seedshift · valid final word',
    introduction: 'Legacy Seedshift with a final word that makes the result a valid BIP39 phrase.',
    steps: [
      'The phrase is shifted with the legacy method.',
      'The checksum part at the end of the final word is calculated again, which usually changes that word.',
    ],
    notes: [
      'The original final word is lost. Decoding restores every other word exactly and lists all final words with a valid checksum: 128 for 12 words, 64 for 15, 32 for 18, 16 for 21 and 8 for 24.',
      'Choose the right phrase with a known address, public key or fingerprint.',
    ],
  },
};

export const MNEMOCODE_FORMAT_HELP: Readonly<Record<MnemoCodeFormat, MnemoCodeHelp>> = {
  english: {
    title: '1 · English BIP39 words',
    introduction: 'The result is written with ordinary English BIP39 words.',
    notes: [
      'In Direct mode these are the words of your phrase. In a Seedshift mode they are other words, because the dates have shifted them.',
      'The result of checksum-valid Seedshift looks like a normal wallet phrase, but it opens a different wallet until it is decoded with the dates.',
    ],
  },
  indexes: {
    title: '2 · BIP39 word numbers',
    introduction: 'Every BIP39 word has a fixed place in the list of 2048 words. The result shows these places.',
    steps: [
      'Each word is replaced by its place in the list, a number from 1 to 2048.',
      'The numbers are written in the order of the words, separated by spaces.',
    ],
    notes: ['Example: abandon is 1 and about is 4. Decoding takes the word at each place.'],
  },
  unicode: {
    title: '3 · Mapped Unicode code points',
    introduction: 'Each word becomes a four-digit code, and all codes are joined into one line.',
    steps: [
      'Each word is replaced by its place in the English BIP39 list.',
      'That place selects the character at the same place in the Traditional Chinese BIP39 list, which also has 2048 entries.',
      'The character is written as its Unicode code of four hexadecimal digits.',
      'All codes are joined without spaces. The characters themselves are never shown.',
    ],
    notes: [
      'Example: abandon is at place 1, the character at place 1 has the code 7684, so abandon becomes 7684.',
      'Decoding cuts the line into groups of four digits, finds each character in the Chinese list and takes the English word at the same place.',
    ],
  },
  colors: {
    title: '5 · #RRGGBB colors',
    introduction: 'The phrase becomes a short list of colors written as #RRGGBB codes.',
    steps: [
      'Each word is replaced by its place in the BIP39 list.',
      'The numbers are packed into colors: 8 colors for 12 words, 10 for 15, 12 for 18, 14 for 21 and 16 for 24.',
    ],
    notes: [
      'The codes are the recovery data, and every one of them is needed. A shade that only looks similar is not enough.',
      'For 12 and 24 words the packing is compatible with BIP39Colors. This representation can be printed as cards.',
    ],
  },
  'colors-unicode': {
    title: '6 · Color Unicode code points',
    introduction: 'The same colors as in representation 5, written as plain text instead of color codes.',
    steps: [
      'The phrase is turned into colors as in representation 5.',
      'Each color is split into two codes of four hexadecimal digits from the Unicode Private Use Area.',
      'The codes are written one after another, so 8 colors become 16 codes.',
    ],
    notes: ['Decoding joins each pair of codes back into a color and then reads the colors as in representation 5.'],
  },
};

/** Shown on the Decode tab while the representation is detected automatically. */
export const MNEMOCODE_AUTO_FORMAT_HELP: MnemoCodeHelp = {
  title: 'Auto-detect',
  introduction: 'MnemoCode works out the representation from the input itself.',
  steps: [
    'An MNC1 record names its own mode and representation, so both are read from the record.',
    'Any other input is tried as every representation in turn.',
    'The input is accepted only when exactly one representation gives a complete phrase of 12, 15, 18, 21 or 24 words.',
  ],
  notes: ['When several representations fit, select the right one here. MnemoCode never guesses.'],
};

/** How decoding reverses each transformation mode. */
export const MNEMOCODE_DECODE_MODE_HELP: Readonly<Record<MnemoCodeMode, MnemoCodeHelp>> = {
  direct: {
    title: 'Direct',
    introduction: 'The input is read back into words. Nothing was shifted, so no dates are needed.',
  },
  seedshift: {
    title: 'Seedshift · checksum-valid',
    introduction: 'The same dates that were used for encoding move every word back.',
    steps: [
      'The input is read as a valid BIP39 phrase and its checksum is checked.',
      'The dates are sorted and turned into the same list of shifts as during encoding.',
      'Every word moves back in the BIP39 list by its shift, and the checksum of the original phrase is calculated.',
    ],
    notes: [
      'Wrong dates give a different valid phrase without any error. Compare the result with a known address or fingerprint.',
    ],
  },
  'seedshift-legacy': {
    title: 'Legacy Seedshift',
    introduction: 'Reverses the original Seedshift method for records that were made with it.',
    steps: [
      'The dates are sorted and turned into a list of shifts.',
      'Every whole word, including the last one, moves back by its shift.',
    ],
    notes: ['The input itself is usually not a valid BIP39 phrase. The recovered phrase is checked instead.'],
  },
  'seedshift-legacy-valid': {
    title: 'Legacy valid-word recovery',
    introduction: 'For a legacy record whose final word was replaced to make the phrase valid.',
    steps: [
      'Every word except the last moves back by its shift and is restored exactly.',
      'The original final word is unknown, so every final word with a valid checksum is listed.',
    ],
    notes: [
      'The list has 128 phrases for 12 words, 64 for 15, 32 for 18, 16 for 21 and 8 for 24.',
      'Choose the right phrase with a known address, public key or fingerprint.',
    ],
  },
};

/** The two ways to recover a final or forgotten word. */
export const MNEMOCODE_WORD_HELP: Readonly<Record<'missing' | 'legacy', MnemoCodeHelp>> = {
  missing: {
    title: 'Forgotten word',
    introduction: 'Finds every word that can stand in the place of one forgotten word.',
    steps: [
      'Write the phrase with a question mark in place of the forgotten word.',
      'Each of the 2048 BIP39 words is tried in that place.',
      'Only the words that give a valid checksum are listed, with their number in the BIP39 list.',
    ],
    notes: [
      'A valid checksum does not prove that a phrase is yours. Check the candidates against a known address or fingerprint.',
    ],
  },
  legacy: {
    title: 'Final word of a legacy phrase',
    introduction: 'Finds valid final words for an old Legacy Seedshift phrase whose checksum is wrong.',
    steps: [
      'Enter the complete old phrase without a question mark.',
      'Every final word that gives a valid checksum is listed.',
      'One row is marked as preserved. It keeps the data part of the old final word and changes only its checksum part.',
    ],
    notes: ['The results are replacement phrases for storage, not proof of the original wallet.'],
  },
};

/** Builds the popover content with text nodes only. */
export function renderMnemoCodeHelp(container: HTMLElement, help: MnemoCodeHelp): void {
  const heading = document.createElement('h3');
  heading.textContent = help.title;
  const introduction = document.createElement('p');
  introduction.textContent = help.introduction;
  container.replaceChildren(heading, introduction);
  if (help.steps !== undefined) {
    const list = document.createElement('ol');
    for (const step of help.steps) {
      const item = document.createElement('li');
      item.textContent = step;
      list.append(item);
    }
    container.append(list);
  }
  for (const note of help.notes ?? []) {
    const paragraph = document.createElement('p');
    paragraph.textContent = note;
    container.append(paragraph);
  }
}

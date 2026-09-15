import { describe, expect, it } from 'vitest';
import { parseMnemonicEntries } from '../src/mnemonic-entries.js';

const FIRST = 'forum undo fragile fade shy sign arrest garment culture tube off merit';
const SECOND = 'good battle boil exact add seed angle hurry success glad carbon whisper';

describe('numbered mnemonic entries', () => {
  it('joins line breaks inserted inside one checksum-valid phrase', () => {
    expect(parseMnemonicEntries('forum undo fragile fade shy sign arrest\ngarment culture tube off merit')).toEqual([
      FIRST,
    ]);
  });

  it('keeps separate checksum-valid phrases as separate numbered entries', () => {
    expect(parseMnemonicEntries(`${FIRST}\n${SECOND}`)).toEqual([FIRST, SECOND]);
  });

  it('finds multiple phrase boundaries in whitespace-wrapped pasted text', () => {
    expect(
      parseMnemonicEntries(
        `${FIRST.split(' ').slice(0, 5).join(' ')}\n${FIRST.split(' ').slice(5).join(' ')} ${SECOND}`,
      ),
    ).toEqual([FIRST, SECOND]);
  });
});

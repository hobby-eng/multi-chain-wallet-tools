import { englishMnemonicToEntropy } from '@ckd/core/bip39.js';

const BIP39_ENTRY_WORD_COUNTS = [24, 21, 18, 15, 12] as const;

function isValidMnemonic(value: string): boolean {
  let entropy: Uint8Array | null = null;
  try {
    entropy = englishMnemonicToEntropy(value);
    return true;
  } catch {
    return false;
  } finally {
    entropy?.fill(0);
  }
}

/**
 * Keep explicit one-phrase-per-line input when it is valid. If copied text
 * contains line breaks inside a phrase, infer boundaries only where a valid
 * BIP39 length and checksum prove them.
 */
export function parseMnemonicEntries(value: string): string[] {
  const explicit = value
    .replaceAll('\r', '')
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (explicit.length === 0 || explicit.every(isValidMnemonic)) return explicit;

  const words = value.trim().split(/\s+/u).filter(Boolean);
  const memo = new Map<number, string[] | null>();
  const splitAt = (offset: number): string[] | null => {
    if (offset === words.length) return [];
    if (memo.has(offset)) return memo.get(offset) ?? null;
    for (const count of BIP39_ENTRY_WORD_COUNTS) {
      if (offset + count > words.length) continue;
      const candidate = words.slice(offset, offset + count).join(' ');
      if (!isValidMnemonic(candidate)) continue;
      const remaining = splitAt(offset + count);
      if (remaining !== null) {
        const result = [candidate, ...remaining];
        memo.set(offset, result);
        return result;
      }
    }
    memo.set(offset, null);
    return null;
  };
  return splitAt(0) ?? explicit;
}

import { MAX_BIP32_INDEX } from '@ckd/core/bip32.js';

const MAX_CUSTOM_PATH_DEPTH = 10;

export interface ParsedCustomPath {
  readonly template: string;
  path(index: number): string;
}

export function parseCustomPathTemplate(value: string): ParsedCustomPath {
  const template = value.trim();
  const segments = template.split('/');
  if (segments[0] !== 'm' || segments.length < 2 || segments.length > MAX_CUSTOM_PATH_DEPTH + 1) {
    throw new Error(`Custom path must be an absolute BIP32 path with at most ${MAX_CUSTOM_PATH_DEPTH} levels.`);
  }
  let placeholders = 0;
  for (const segment of segments.slice(1)) {
    if (segment === '{index}' || segment === "{index}'") {
      placeholders += 1;
      continue;
    }
    const match = /^(0|[1-9][0-9]*)'?$/u.exec(segment);
    if (match?.[1] === undefined || BigInt(match[1]) > BigInt(MAX_BIP32_INDEX)) {
      throw new Error('Custom path contains an invalid BIP32 child segment.');
    }
  }
  if (placeholders !== 1) {
    throw new Error('Custom path must contain exactly one {index} segment.');
  }
  return {
    template,
    path(index: number): string {
      if (!Number.isSafeInteger(index) || index < 0 || index > MAX_BIP32_INDEX) {
        throw new Error(`Custom path index must be within 0–${MAX_BIP32_INDEX}.`);
      }
      return template.replace('{index}', String(index));
    },
  };
}

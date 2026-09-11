import { ADDRESS_DISCOVERY_GAP } from './dash/util.js';
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

/** Account ranges use BIP44-style account position; arbitrary paths remain valid in single-path mode. */
export function parseCustomAccountRange(startValue: string, finishValue: string) {
  const start = parseCustomPathTemplate(startValue).template.split('/');
  const finish = parseCustomPathTemplate(finishValue).template.split('/');
  if (start.length < 5 || !["44'", "49'", "84'", "86'"].includes(start[1]!) || !start.slice(1, 4).every(part => /^(0|[1-9][0-9]*)'$/u.test(part))) {
    throw new Error("Scan range requires a BIP44-style m/purpose'/coin'/account'/…/{index} path. Turn it off to use another custom structure.");
  }
  if (start.length !== finish.length || start.some((part, i) => i !== 3 && part !== finish[i]) || !/^(0|[1-9][0-9]*)'$/u.test(finish[3]!)) {
    throw new Error('Start and Finish must differ only in the hardened account number (the third number after m).');
  }
  const first = Number(start[3]!.slice(0, -1));
  const last = Number(finish[3]!.slice(0, -1));
  if (last < first) throw new Error('Finish account must be greater than or equal to Start account.');
  return { first, last, template(account: number): string {
    const parts = [...start]; parts[3] = `${account}'`; return parts.join('/');
  } };
}

export interface CustomScanPath extends ParsedCustomPath {
  readonly id: string;
  readonly label: string;
  readonly minimum: number;
}

export function customScanPaths(config: {
  scanCustomPath?: boolean;
  customPathTemplate?: string;
  customPathRangeEnd?: string;
  customPathCount?: number;
}): Iterable<CustomScanPath> & { readonly length: number } {
  if (config.scanCustomPath !== true) return { length: 0, *[Symbol.iterator]() {} };
  const parsed = parseCustomPathTemplate(config.customPathTemplate ?? '');
  const range = config.customPathRangeEnd === undefined ? undefined : parseCustomAccountRange(parsed.template, config.customPathRangeEnd);
  const minimum = (config.customPathCount ?? 0) + (range === undefined ? 0 : ADDRESS_DISCOVERY_GAP);
  if (!Number.isSafeInteger(config.customPathCount) || (config.customPathCount ?? 0) < 1 || minimum > MAX_BIP32_INDEX + 1) {
    throw new Error('Custom path address minimum, including the 20-address range margin, exceeds the supported index range.');
  }
  return {
    length: range === undefined ? 1 : range.last - range.first + 1,
    *[Symbol.iterator]() {
      if (range === undefined) { yield { ...parsed, id: 'custom', label: 'Custom path', minimum }; return; }
      for (let account = range.first; account <= range.last; account++) {
        yield { ...parseCustomPathTemplate(range.template(account)), id: `custom:${account}`, label: `Custom path · account ${account}`, minimum };
      }
    },
  };
}

export function appendCustomPaths<T>(standard: T[], paths: ReturnType<typeof customScanPaths>, make: (path: CustomScanPath) => T): Iterable<T> & { readonly length: number } {
  return { length: standard.length + paths.length, *[Symbol.iterator]() {
    yield* standard;
    for (const path of paths) yield make(path);
  } };
}

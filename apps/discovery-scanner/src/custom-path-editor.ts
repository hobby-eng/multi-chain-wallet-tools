import { MAX_BIP32_INDEX } from '@ckd/core/bip32.js';
import { parseCustomAccountRange } from './coins/custom-path.js';

/** A visual helper only. Unsupported structures remain editable as full paths. */
export function describeCustomPath(template: string): { purpose: number; coin: number; account: number; branch: number } | null {
  try {
    parseCustomAccountRange(template, template);
    const parts = template.trim().split('/');
    if (parts.length !== 6 || parts[5] !== '{index}' || !/^(0|[1-9][0-9]*)$/u.test(parts[4]!)) return null;
    return { purpose: Number(parts[1]!.slice(0, -1)), coin: Number(parts[2]!.slice(0, -1)), account: Number(parts[3]!.slice(0, -1)), branch: Number(parts[4]) };
  } catch { return null; }
}

export function editCustomPath(template: string, field: 'account' | 'branch', value: string): string {
  if (describeCustomPath(template) === null || !/^(0|[1-9][0-9]*)$/u.test(value) || Number(value) > MAX_BIP32_INDEX) return template;
  const parts = template.trim().split('/');
  parts[field === 'account' ? 3 : 4] = field === 'account' ? `${value}'` : value;
  return parts.join('/');
}

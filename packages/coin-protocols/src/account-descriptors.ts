import { addDescriptorChecksum } from '@ckd/export/descriptor.js';
import type { AccountDescriptorExport } from '@ckd/core/types.js';

/** Account-level keys only; origin metadata is descriptive, not a second derivation. */
export function accountDescriptorExport(options: {
  script: 'pkh' | 'sh-wpkh' | 'wpkh' | 'tr';
  fingerprint: string;
  accountPath: string;
  publicKey: string;
  privateKey: string;
  fileStem: string;
  scannerPrefix?: 'dash-core-xpub' | 'dash-legacy-xpub' | 'dash-coinjoin-xpub';
}): AccountDescriptorExport {
  const origin = `[${options.fingerprint}${options.accountPath.slice(1).replaceAll("'", 'h')}]`;
  const descriptors = (extendedKey: string): string => [0, 1].map(branch => {
    const key = `${origin}${extendedKey}/${branch}/*`;
    const body = options.script === 'sh-wpkh' ? `sh(wpkh(${key}))` : `${options.script}(${key})`;
    return addDescriptorChecksum(body);
  }).join('\n');
  const publicText = descriptors(options.publicKey);
  return {
    accountPath: options.accountPath,
    publicText,
    privateText: descriptors(options.privateKey),
    scannerText: options.scannerPrefix === undefined ? publicText : `${options.scannerPrefix}:${options.publicKey}`,
    fileStem: options.fileStem,
  };
}

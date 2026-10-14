import { addDescriptorChecksum } from "@ckd/core/descriptor-checksum.js";
import type { AccountDescriptorExport } from "@ckd/core/types.js";

/** The labels the Discovery Scanner reads in front of a Dash account's public key. */
export type DashScannerPrefix = "dash-core-xpub" | "dash-legacy-xpub" | "dash-coinjoin-xpub";

/** The key origin of a descriptor, [fingerprint/path] with h for hardened steps (BIP380). */
export function descriptorOrigin(fingerprint: string, accountPath: string): string {
  return `[${fingerprint}${accountPath.slice(1).replaceAll("'", "h")}]`;
}

/** Account-level keys only; origin metadata is descriptive, not a second derivation. */
export function accountDescriptorExport(options: {
  script: "pkh" | "sh-wpkh" | "wpkh" | "tr";
  fingerprint: string;
  accountPath: string;
  publicKey: string;
  privateKey: string;
  fileStem: string;
  scannerPrefix?: DashScannerPrefix;
}): AccountDescriptorExport {
  const origin = descriptorOrigin(options.fingerprint, options.accountPath);
  const descriptors = (extendedKey: string): string =>
    [0, 1]
      .map((branch) => {
        const key = `${origin}${extendedKey}/${branch}/*`;
        const body =
          options.script === "sh-wpkh" ? `sh(wpkh(${key}))` : `${options.script}(${key})`;
        return addDescriptorChecksum(body);
      })
      .join("\n");
  const publicText = descriptors(options.publicKey);
  return {
    accountPath: options.accountPath,
    publicText,
    privateText: descriptors(options.privateKey),
    scannerText:
      options.scannerPrefix === undefined
        ? publicText
        : `${options.scannerPrefix}:${options.publicKey}`,
    fileStem: options.fileStem,
  };
}

import type { HDKey } from "@scure/bip32";
import { requirePrivate, requirePublic } from "@ckd/core/bip32.js";
import { bytesToHex, hash160, wipe } from "@ckd/core/crypto.js";
import { field, type ResultField } from "@ckd/core/types.js";

export interface Bip32SummaryLabels {
  accountPath: string;
  accountXprv: string;
  accountXpub: string;
}

const DEFAULT_LABELS: Bip32SummaryLabels = {
  accountPath: "Account derivation path",
  accountXprv: "Account xprv",
  accountXpub: "Account xpub",
};

/**
 * Builds the shared BIP32 root/account disclosure block before wiping only the
 * temporary key copies. Keeping this ordering in one function makes the
 * extended-key integrity self-test protect Bitcoin, Dash and Ethereum alike.
 */
export function bip32SummaryFields(
  root: HDKey,
  account: HDKey,
  accountPath: string,
  labels: Partial<Bip32SummaryLabels> = {},
): { fields: ResultField[]; masterFingerprint: string } {
  const resolved = { ...DEFAULT_LABELS, ...labels };
  let rootPrivate: Uint8Array | null = null;
  let rootPublic: Uint8Array | null = null;
  let fingerprintBytes: Uint8Array | null = null;
  try {
    rootPrivate = requirePrivate(root, "m");
    rootPublic = requirePublic(root, "m");
    fingerprintBytes = hash160(rootPublic).slice(0, 4);
    const masterFingerprint = bytesToHex(fingerprintBytes);
    return {
      masterFingerprint,
      fields: [
        field("masterXprv", "Master xprv", root.privateExtendedKey, true),
        field("masterXpub", "Master xpub", root.publicExtendedKey),
        field("masterPrivateKey", "Master private key (hex)", bytesToHex(rootPrivate), true),
        field("masterPublicKey", "Master compressed public key", bytesToHex(rootPublic)),
        field("accountPath", resolved.accountPath, accountPath),
        field("accountXprv", resolved.accountXprv, account.privateExtendedKey, true),
        field("accountXpub", resolved.accountXpub, account.publicExtendedKey),
        field("masterFingerprint", "Master key fingerprint", masterFingerprint),
      ],
    };
  } finally {
    wipe(rootPrivate, rootPublic, fingerprintBytes);
  }
}

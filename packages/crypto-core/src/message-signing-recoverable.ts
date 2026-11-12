// A recoverable secp256k1 signature as Ethereum's and Tron's wallets write it: r (32 bytes),
// s (32 bytes) and v = 27 + recovery id, in hex after 0x, as eth-account, viem and TronWeb print
// it. The signer writes low S with RFC 6979 nonces; the verifier also reads v as 0 or 1, as
// eth-account does, and accepts high S, as ecrecover does for messages, unless the caller asks for
// low S, as TronWeb's verifyMessageV2 (ethers v6 Signature.from) does.
import { bytesToHex, hexToBytes, secp256k1 } from "./crypto.js";

/** r, s and v. */
const SIGNATURE_BYTES = 65;
/** v = 27 + recovery id; eth-account also reads the bare recovery id. */
const V_OFFSET = 27;
const HEX_SIGNATURE = /^(?:0x)?([0-9a-f]{130})$/iu;

const REFUSALS = {
  INVALID_HEX: "The signature is not 65 bytes of hex.",
  INVALID_V: "The signature's v is not 27, 28, 0 or 1.",
  HIGH_S: "The signature's s is in the upper half of the curve order, which this format refuses.",
  RECOVERY_FAILED: "No public key can be recovered from this signature.",
} as const;

/** Input-free refusals of a recoverable signature's text and of its recovery. */
export class RecoverableSignatureError extends Error {
  readonly code: keyof typeof REFUSALS;

  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "RecoverableSignatureError";
    this.code = code;
  }
}

/** Signs `digest` with `privateKey`: 0x, r, s and v in lower-case hex. */
export function signRecoverable(privateKey: Uint8Array, digest: Uint8Array): string {
  const recovered = secp256k1.sign(digest, privateKey, { prehash: false, format: "recovered" });
  try {
    const recovery = recovered[0] ?? 0;
    return `0x${bytesToHex(recovered.slice(1))}${(V_OFFSET + recovery).toString(16)}`;
  } finally {
    recovered.fill(0);
  }
}

/**
 * The uncompressed public key (65 bytes) that signed `digest`, read from the signature's text; with
 * `lowS`, a signature whose s is in the upper half is refused as HIGH_S.
 */
export function recoverRecoverable(
  signature: string,
  digest: Uint8Array,
  lowS = false,
): Uint8Array {
  const hex = HEX_SIGNATURE.exec(signature.trim())?.[1];
  if (hex === undefined) throw new RecoverableSignatureError("INVALID_HEX");
  const bytes = hexToBytes(hex.toLowerCase());
  const v = bytes[SIGNATURE_BYTES - 1] ?? 0;
  const recovery = v >= V_OFFSET ? v - V_OFFSET : v;
  if (recovery > 1) throw new RecoverableSignatureError("INVALID_V");
  let parsed: ReturnType<typeof secp256k1.Signature.fromBytes>;
  try {
    parsed = secp256k1.Signature.fromBytes(bytes.slice(0, SIGNATURE_BYTES - 1), "compact");
  } catch {
    // Pasted bytes can name no signature at all (r or s of 0, or not below the order).
    throw new RecoverableSignatureError("RECOVERY_FAILED");
  }
  if (lowS && parsed.hasHighS()) throw new RecoverableSignatureError("HIGH_S");
  try {
    return parsed.addRecoveryBit(recovery).recoverPublicKey(digest).toBytes(false);
  } catch {
    // Pasted bytes can name no point at all (r = 0, or r off the curve): noble then refuses them.
    throw new RecoverableSignatureError("RECOVERY_FAILED");
  } finally {
    bytes.fill(0);
  }
}

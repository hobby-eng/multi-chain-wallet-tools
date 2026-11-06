import { verifyBip322Message as verifyWithLibrary } from "@ckd/core/bip322-verifier.js";
import { Bip322Signing, type Bip322SigningMode } from "@ckd/core/bip322-signing.js";
import type { NetworkName } from "@ckd/core/types.js";
import type { CompactMessageSignature } from "@ckd/core/compact-message.js";

/** Returns a script mismatch while preserving failures of the verification backend. */
export async function verifyBip322Message(
  message: string,
  address: string,
  signature: string,
  network: NetworkName,
): Promise<boolean> {
  return (await verifyWithLibrary(message, address, signature, network)).valid;
}

/** Adapts worker fields to the library owner and releases its mutable key bytes. */
export async function signBip322Message(
  privateKeyHex: string,
  address: string,
  message: string,
  network: NetworkName,
  mode: Bip322SigningMode,
  scriptPubKeyHex: string,
  redeemScriptHex?: string,
  internalPublicKeyHex?: string,
): Promise<CompactMessageSignature> {
  using signer = new Bip322Signing(privateKeyHex);
  return await signer.sign({
    address,
    message,
    network,
    mode,
    scriptPubKeyHex,
    redeemScriptHex,
    internalPublicKeyHex,
  });
}

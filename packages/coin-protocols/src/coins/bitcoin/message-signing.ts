// Bitcoin's message signing: BIP-322 for every single-key address type, and the compact BIP137
// signature for P2PKH, which older software verifies.
import { bytesToHex } from "@ckd/core/crypto.js";
import { Bip322Signing } from "@ckd/core/bip322-signing.js";
import { verifyBip322Message } from "@ckd/core/bip322-verifier.js";
import { signCompactP2pkhMessage, verifyCompactP2pkhMessage } from "@ckd/core/compact-message.js";
import type { ResultField } from "@ckd/core/types.js";
import type { CoinMessageSigning, MessageSigningRequest } from "../message-signing.js";
import { BitcoinPurposeProfile, type BitcoinMode } from "./profiles.js";

const COMPACT = "bitcoin-compact";

/** The rows of one address type, which only that type's formats sign. */
const rowsOf = (mode: BitcoinMode) =>
  Object.freeze([BitcoinPurposeProfile.forMode(mode).adapterId]);

/** The public script field `key` of the row, or undefined. */
function fieldValue(fields: readonly ResultField[], key: string): string | undefined {
  return fields.find((field) => field.key === key)?.value;
}

/** Signs one BIP-322 request; Bip322Signing owns its copy of the key and wipes it. */
async function signBip322(
  privateKey: Uint8Array,
  request: MessageSigningRequest,
  fields: readonly ResultField[],
) {
  using signer = new Bip322Signing(bytesToHex(privateKey));
  return await signer.sign({
    address: request.address,
    message: request.message,
    network: request.network,
    mode: Bip322Signing.mode(request.format),
    scriptPubKeyHex: fieldValue(fields, "scriptPubKey") ?? "",
    redeemScriptHex: fieldValue(fields, "redeemScript"),
    internalPublicKeyHex: fieldValue(fields, "internalPublicKey"),
  });
}

/** Bitcoin's formats: its four BIP-322 address modes and the compact P2PKH signature. */
export const BITCOIN_MESSAGE_SIGNING: CoinMessageSigning = Object.freeze({
  formats: Object.freeze({
    [COMPACT]: rowsOf("legacy"),
    "bitcoin-bip322-legacy": rowsOf("legacy"),
    "bitcoin-bip322-nested": rowsOf("nested-segwit"),
    "bitcoin-bip322-native": rowsOf("native-segwit"),
    "bitcoin-bip322-taproot": rowsOf("taproot"),
  }),
  sign: (privateKey: Uint8Array, request: MessageSigningRequest, fields: readonly ResultField[]) =>
    request.format === COMPACT
      ? signCompactP2pkhMessage(
          privateKey,
          request.address,
          request.message,
          "bitcoin",
          request.network,
        )
      : signBip322(privateKey, request, fields),
  verify: async (request: MessageSigningRequest, signature: string) =>
    request.format === COMPACT
      ? verifyCompactP2pkhMessage(
          request.address,
          request.message,
          signature,
          "bitcoin",
          request.network,
        )
      : (await verifyBip322Message(request.message, request.address, signature, request.network))
          .valid,
});

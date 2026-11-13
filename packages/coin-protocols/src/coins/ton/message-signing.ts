// TON's message signing: TON Connect's signData for text and binary payloads, as Tonkeeper and the
// other TON Connect wallets sign it, for any of the row's wallet addresses (W5, v4R2, v3R2): the
// signature binds the address it was made for. A TON address is a contract's, so verification
// takes the row's public key and accepts it only when the address is one of that key's wallets.
import { base64, hex } from "@scure/base";
import { bytesToHex, hexToBytes, wipe } from "@ckd/core/crypto.js";
import { DerivationSecretsError } from "@ckd/core/secrets.js";
import { ed25519CoinSigning, type Ed25519Format } from "../message-signing-ed25519.js";
import { responseSignature } from "../message-signing-response.js";
import { MessageSigningFormatError, type MessageSigningRequest } from "../message-signing.js";
import { tonAccountId } from "./address.js";
import { tonWalletAccountId, type TonWalletVersion } from "./contracts.js";
import {
  TON_SIGN_DATA_INPUTS,
  tonSignDataPayload,
  tonSignDataSignedBytes,
  tonSignDataTimestamp,
  type TonSignDataKind,
} from "./message-signing-sign-data.js";
import { TON_BIP39_PROFILES, TON_STANDARD_ADAPTER } from "./profiles.js";

/** The wallet contracts whose addresses the rows show. */
const VERSIONS: readonly TonWalletVersion[] = Object.freeze(["w5", "v4r2", "v3r2"]);
/** TON's secret key: the Ed25519 seed and its public key, 64 bytes in hex. */
const SECRET_KEY_BYTES = 64;
const SEED_BYTES = 32;

/** The account id of the request's address, which the binding has already found to be a wallet's. */
function accountIdOf(request: MessageSigningRequest): Uint8Array {
  const accountId = tonAccountId(request.address);
  if (accountId === null) throw new MessageSigningFormatError("NOT_FOR_ROW");
  return accountId;
}

/** The format of `kind`, whose response is TON Connect's signData result. */
function format(kind: TonSignDataKind): Ed25519Format {
  return {
    name: `TON Connect signData (${kind})`,
    signedBytes: (request) =>
      tonSignDataSignedBytes(accountIdOf(request), request.message, kind, request.inputs),
    // The members of SignDataResponseSuccess.result, in the spec's order; the address is raw.
    write: (signature, request) => {
      const payload = tonSignDataPayload(request.message, kind);
      try {
        return JSON.stringify({
          signature: base64.encode(signature),
          address: `0:${bytesToHex(accountIdOf(request))}`,
          timestamp: tonSignDataTimestamp(request.inputs?.[TON_SIGN_DATA_INPUTS.timestamp]),
          domain: request.inputs?.[TON_SIGN_DATA_INPUTS.domain],
          payload:
            kind === "text"
              ? { type: "text", text: request.message }
              : { type: "binary", bytes: base64.encode(payload) },
        });
      } finally {
        payload.fill(0);
      }
    },
    read: responseSignature,
  };
}

/** TON's two formats, for each of its variants and each wallet address of a row. */
export const TON_MESSAGE_SIGNING = ed25519CoinSigning({
  key: Object.freeze({
    field: "privateKey",
    read: (text: string) => {
      const secretKey = /^[0-9a-f]{128}$/u.test(text) ? hexToBytes(text) : undefined;
      if (secretKey?.length !== SECRET_KEY_BYTES)
        throw new DerivationSecretsError("derivation.key.material");
      try {
        return secretKey.slice(0, SEED_BYTES);
      } finally {
        wipe(secretKey);
      }
    },
  }),
  adapters: [TON_STANDARD_ADAPTER, ...TON_BIP39_PROFILES.map((profile) => profile.adapterId)],
  formats: { "ton-sign-data-text": format("text"), "ton-sign-data-binary": format("binary") },
  publicKeyOf: (request) => {
    const publicKey = request.inputs?.[TON_SIGN_DATA_INPUTS.publicKey];
    return publicKey !== undefined && /^[0-9a-f]{64}$/u.test(publicKey)
      ? hex.decode(publicKey)
      : undefined;
  },
  owns: (publicKey, address) => {
    const accountId = tonAccountId(address);
    return (
      accountId !== null &&
      VERSIONS.some((version) =>
        tonWalletAccountId(version, publicKey).every((byte, at) => byte === accountId[at]),
      )
    );
  },
});

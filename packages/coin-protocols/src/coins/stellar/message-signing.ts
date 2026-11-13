// Stellar's message signing: SEP-53, for the account ID (G…) that is the key itself. The key is
// read from the row's secret seed (S…), the one form the row keeps.
import { base64 } from "@scure/base";
import { DerivationSecretsError } from "@ckd/core/secrets.js";
import { STRKEY_PUBLIC_KEY, STRKEY_SECRET_SEED } from "@ckd/core/strkey.js";
import { base64Signature, ed25519CoinSigning } from "../message-signing-ed25519.js";
import { sep53SignedBytes } from "./message-signing-sep53.js";
import { STELLAR_PROFILES } from "./profiles.js";
import { stellarAccountId, strKeyPayload } from "./strkey.js";

/** Stellar's one format, SEP-53. */
export const STELLAR_MESSAGE_SIGNING = ed25519CoinSigning({
  key: Object.freeze({
    field: "privateKey",
    read: (text: string) => {
      const seed = strKeyPayload(STRKEY_SECRET_SEED, text);
      if (seed === undefined) throw new DerivationSecretsError("derivation.key.material");
      return seed;
    },
  }),
  adapters: STELLAR_PROFILES.map((profile) => profile.adapterId),
  formats: {
    "stellar-sep53": {
      name: "Stellar SEP-53",
      signedBytes: (request) => sep53SignedBytes(new TextEncoder().encode(request.message)),
      write: (signature) => base64.encode(signature),
      read: base64Signature,
    },
  },
  publicKeyOf: (request) => strKeyPayload(STRKEY_PUBLIC_KEY, request.address),
  owns: (publicKey, address) => stellarAccountId(publicKey) === address,
});

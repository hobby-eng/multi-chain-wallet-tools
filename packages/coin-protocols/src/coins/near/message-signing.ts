// NEAR's message signing: NEP-413, for the key's implicit account, which is the key itself. The
// response names that account and its key, as NEP-413's SignedMessage does; a named account that
// holds the key (name.near) is a binding only the network knows.
import { base64, hex } from "@scure/base";
import { ed25519HexSeed } from "@ckd/core/derived-private-key.js";
import { ed25519CoinSigning, responseSignature } from "../message-signing-ed25519.js";
import { canonicalNearImplicitAccount, nearImplicitAccount, nearKeyText } from "./account.js";
import { nep413SignedBytes } from "./message-signing-nep413.js";
import { NEAR_PROFILES } from "./profiles.js";

/** NEAR's one format, NEP-413's signMessage. */
export const NEAR_MESSAGE_SIGNING = ed25519CoinSigning({
  key: ed25519HexSeed("privateKeyHex"),
  adapters: NEAR_PROFILES.map((profile) => profile.adapterId),
  formats: {
    "near-nep413": {
      name: "NEAR NEP-413 signMessage",
      signedBytes: (request) => {
        const message = new TextEncoder().encode(request.message);
        try {
          return nep413SignedBytes(message, request.inputs);
        } finally {
          message.fill(0);
        }
      },
      // NEP-413's SignedMessage, its members in the NEP's order.
      write: (signature, _request, publicKey) =>
        JSON.stringify({
          accountId: nearImplicitAccount(publicKey),
          publicKey: nearKeyText(publicKey),
          signature: base64.encode(signature),
        }),
      read: responseSignature,
    },
  },
  publicKeyOf: (request) => {
    const account = canonicalNearImplicitAccount(request.address);
    return account === null ? undefined : hex.decode(account);
  },
  owns: (publicKey, address) => nearImplicitAccount(publicKey) === address,
});

// ADR-036's arbitrary-message sign document (Cosmos SDK docs/architecture/adr-036, a Draft), as
// Keplr's signArbitrary writes it (@keplr-wallet/cosmos 0.13.41 build/adr-36/amino.js
// makeADR36AminoSignDoc, signed by build/signing/encode.js serializeSignDoc): an amino StdSignDoc
// with an empty chain id, account number and sequence "0", no fee, no memo and one sign/MsgSignData
// whose data is the message in Base64 and whose signer is the address, as JSON with sorted keys and
// no whitespace. Keplr also escapes <, > and &, which Base64 and bech32 never hold. A chain signs
// SHA-256 of these bytes, an Ethermint chain such as Injective Keccak-256; the response is Keplr's
// StdSignature, whose pub_key Keplr types as tendermint/PubKeySecp256k1 on every chain.
import { base64 } from "@scure/base";
import type { MessageSigningRequest } from "./message-signing.js";
import type { PublicKeyFormat } from "./message-signing-public-key.js";
import { responseSignature } from "./message-signing-response.js";

/** Keplr's type of a secp256k1 public key in a StdSignature, Injective's included. */
const PUBLIC_KEY_TYPE = "tendermint/PubKeySecp256k1";

const REFUSALS = {
  EMPTY_MESSAGE: "ADR-036 signs no empty message.",
} as const;

/** The refusal of a message that ADR-036 cannot sign. */
export class Adr036Error extends Error {
  readonly code: keyof typeof REFUSALS;

  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "Adr036Error";
    this.code = code;
  }
}

/** Refuses a message that Keplr's signArbitrary refuses; the page checks it early. */
export function admitAdr036Message(message: string): void {
  if (message === "") throw new Adr036Error("EMPTY_MESSAGE");
}

/**
 * The sign document of `message` (UTF-8) for `signer`: each object's keys are written in sorted
 * order, which is the order JSON.stringify keeps.
 */
export function adr036Document(signer: string, message: string): Uint8Array {
  admitAdr036Message(message);
  const data = base64.encode(new TextEncoder().encode(message));
  const document = {
    account_number: "0",
    chain_id: "",
    fee: { amount: [], gas: "0" },
    memo: "",
    msgs: [{ type: "sign/MsgSignData", value: { data, signer } }],
    sequence: "0",
  };
  return new TextEncoder().encode(JSON.stringify(document));
}

/**
 * An ADR-036 format whose digest is `hash` of the sign document of the request's message for its
 * address, and whose response is Keplr's StdSignature.
 */
export function adr036Format(
  name: string,
  hash: (bytes: Uint8Array) => Uint8Array,
): PublicKeyFormat {
  return {
    name,
    signedBytes: (request: MessageSigningRequest) => {
      const document = adr036Document(request.address, request.message);
      try {
        return hash(document);
      } finally {
        document.fill(0);
      }
    },
    write: (signature, _request, publicKey) =>
      JSON.stringify({
        pub_key: { type: PUBLIC_KEY_TYPE, value: base64.encode(publicKey) },
        signature: base64.encode(signature),
      }),
    read: responseSignature,
  };
}

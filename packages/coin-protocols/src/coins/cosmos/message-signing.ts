// The Cosmos Hub's message signing: ADR-036 as Keplr's signArbitrary writes it, SHA-256 of the
// sign document for the row's cosmos1 address, verified against the row's compressed key.
import { bech32 } from "@scure/base";
import { hash160, sha256 } from "@ckd/core/crypto.js";
import { secp256k1HexKey } from "@ckd/core/derived-private-key.js";
import { adr036Format } from "../message-signing-adr036.js";
import { secp256k1CoinSigning } from "../message-signing-secp256k1.js";
import { COSMOS_HRP, COSMOS_PROFILES } from "./profiles.js";

/** The Cosmos Hub's one format, Keplr's ADR-036. */
export const COSMOS_MESSAGE_SIGNING = secp256k1CoinSigning({
  key: secp256k1HexKey("privateKey"),
  adapters: COSMOS_PROFILES.map((profile) => profile.adapterId),
  formats: { "cosmos-adr036": adr036Format("ADR-036 signArbitrary (Keplr)", sha256) },
  owns: (publicKey, address) =>
    bech32.encode(COSMOS_HRP, bech32.toWords(hash160(publicKey))) === address,
});

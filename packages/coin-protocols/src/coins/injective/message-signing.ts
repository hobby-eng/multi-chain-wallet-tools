// Injective's message signing, in two parts that share the row's key: ADR-036 as Keplr's
// signArbitrary writes it for an Ethermint chain, Keccak-256 of the sign document for the row's
// inj1 address (decision D6's default); and EIP-191 personal_sign, as MetaMask and injective-ts's
// EVM wallets sign, which is Ethereum's signature for the 0x form of the same account.
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bech32 } from "@scure/base";
import { secp256k1HexKey } from "@ckd/core/derived-private-key.js";
import { keccakAccount } from "../keccak-account.js";
import { adr036Format } from "../message-signing-adr036.js";
import { envelopeCoinSigning } from "../message-signing-envelope.js";
import { secp256k1CoinSigning } from "../message-signing-secp256k1.js";
import { INJECTIVE_HRP, INJECTIVE_PROFILES } from "./profiles.js";

const key = secp256k1HexKey("privateKey");
const adapters = INJECTIVE_PROFILES.map((profile) => profile.adapterId);
/** The inj1 address of a public key in either SEC1 form, as the rows write it. */
const addressOf = (publicKey: Uint8Array) =>
  bech32.encode(INJECTIVE_HRP, bech32.toWords(keccakAccount(publicKey)));

/** Injective's two formats: Keplr's ADR-036 by default, and EIP-191 for EVM wallets. */
export const INJECTIVE_MESSAGE_SIGNING = Object.freeze([
  secp256k1CoinSigning({
    key,
    adapters,
    formats: {
      "injective-adr036": adr036Format("ADR-036 signArbitrary (Keplr, Keccak-256)", keccak_256),
    },
    owns: (publicKey, address) => addressOf(publicKey) === address,
  }),
  envelopeCoinSigning({
    envelope: "Ethereum",
    key,
    adapters,
    formats: { "injective-eip191": { name: "EIP-191 personal_sign" } },
    addressOf,
    addressesEqual: (derived, expected) => derived === expected,
  }),
]);

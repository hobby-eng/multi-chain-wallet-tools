// Ethereum Classic's message signing: EIP-191 personal_sign, byte for byte Ethereum's, so a
// signature is valid for the same 0x address on both chains (Core-Geth's accounts.TextAndHash).
import { hexAddressesEqual } from "../registry-base.js";
import { evmAddressOfKey } from "../keccak-account.js";
import { envelopeCoinSigning } from "../message-signing-envelope.js";
import { ETHEREUM_CLASSIC_PROFILES } from "./profiles.js";

/** Ethereum Classic's one format, for its rows at coin type 61. */
export const ETHEREUM_CLASSIC_MESSAGE_SIGNING = envelopeCoinSigning({
  envelope: "Ethereum",
  keyField: "privateKey",
  adapters: ETHEREUM_CLASSIC_PROFILES.map((profile) => profile.adapterId),
  formats: { "ethereum-classic-eip191": { name: "EIP-191 personal_sign" } },
  addressOf: evmAddressOfKey,
  addressesEqual: hexAddressesEqual,
});

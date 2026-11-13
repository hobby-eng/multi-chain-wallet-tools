// Ethereum's message signing: EIP-191 personal_sign, which every EVM network shares, since the
// signed bytes carry no chain ID (EIP-155 covers transactions only).
import { hexAddressesEqual } from "../registry-base.js";
import { evmAddressOfKey } from "../keccak-account.js";
import { secp256k1HexKey } from "@ckd/core/derived-private-key.js";
import { envelopeCoinSigning } from "../message-signing-envelope.js";
import { ETHEREUM_COIN_ADAPTERS } from "../adapters/ethereum.js";

/** Ethereum's one format, for its EOA row on every EVM network. */
export const ETHEREUM_MESSAGE_SIGNING = envelopeCoinSigning({
  envelope: "Ethereum",
  key: secp256k1HexKey("privateKey"),
  adapters: ETHEREUM_COIN_ADAPTERS.map((adapter) => adapter.id),
  formats: { "ethereum-eip191": { name: "EIP-191 personal_sign" } },
  addressOf: evmAddressOfKey,
  addressesEqual: hexAddressesEqual,
});

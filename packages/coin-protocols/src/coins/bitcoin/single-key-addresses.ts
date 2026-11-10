import { p2pkhAddress, p2shP2wpkhAddress, p2wpkhAddress } from "../../utxo-address.js";

/**
 * The address encodings of Bitcoin's single-key modes other than Taproot, by mode; each takes a
 * compressed public key and the network's facts and returns the address with its script facts.
 */
export const BITCOIN_SINGLE_KEY_ENCODINGS = Object.freeze({
  legacy: p2pkhAddress,
  "nested-segwit": p2shP2wpkhAddress,
  "native-segwit": p2wpkhAddress,
});

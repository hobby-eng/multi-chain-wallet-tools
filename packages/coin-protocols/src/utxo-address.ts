// The single-key addresses of Bitcoin's script family, for any coin that took them over: pay to a
// key hash (P2PKH), a SegWit key hash nested in a script hash (P2SH-P2WPKH) and a native SegWit key
// hash (P2WPKH). A coin brings only its version bytes and its bech32 prefix, so a build with one of
// these coins carries no other coin's code.
import { bech32 } from "@scure/base";
import {
  bytesToHex,
  concatBytes,
  encodeP2pkh,
  encodeP2sh,
  hash160,
  p2pkhScriptHex,
} from "@ckd/core/crypto.js";
import { field, type ResultField } from "@ckd/core/types.js";

/** A coin's base58 address version bytes. */
export interface UtxoAddressFacts {
  readonly p2pkh: number;
  readonly p2sh: number;
}

/** The facts of a coin with native SegWit: its version bytes and its bech32 prefix. */
export interface SegwitAddressFacts extends UtxoAddressFacts {
  readonly bech32Hrp: string;
}

/** The script facts of a P2PKH output for a public-key hash, whatever version encodes it. */
export function p2pkhScript(publicKeyHash: Uint8Array) {
  return {
    publicKeyHashHex: bytesToHex(publicKeyHash),
    scriptPubKeyHex: p2pkhScriptHex(publicKeyHash),
  };
}

/** P2PKH: the base58check of the version byte and HASH160 of the compressed public key. */
export function p2pkhAddress(publicKey: Uint8Array, facts: UtxoAddressFacts) {
  const publicKeyHash = hash160(publicKey);
  return { address: encodeP2pkh(publicKeyHash, facts.p2pkh), ...p2pkhScript(publicKeyHash) };
}

/** P2SH-P2WPKH (BIP49): the script hash of the version 0 witness program of the key hash. */
export function p2shP2wpkhAddress(publicKey: Uint8Array, facts: UtxoAddressFacts) {
  const publicKeyHash = hash160(publicKey);
  const redeemScript = concatBytes(Uint8Array.of(0x00, 0x14), publicKeyHash);
  const scriptHash = hash160(redeemScript);
  return {
    address: encodeP2sh(scriptHash, facts.p2sh),
    publicKeyHashHex: bytesToHex(publicKeyHash),
    redeemScriptHex: bytesToHex(redeemScript),
    scriptHashHex: bytesToHex(scriptHash),
    scriptPubKeyHex: `a914${bytesToHex(scriptHash)}87`,
  };
}

/** P2WPKH (BIP84): the bech32 version 0 witness program of the key hash. */
export function p2wpkhAddress(publicKey: Uint8Array, facts: SegwitAddressFacts) {
  const publicKeyHash = hash160(publicKey);
  return {
    address: bech32.encode(facts.bech32Hrp, [0, ...bech32.toWords(publicKeyHash)]),
    publicKeyHashHex: bytesToHex(publicKeyHash),
    witnessProgramHex: bytesToHex(publicKeyHash),
    scriptPubKeyHex: `0014${bytesToHex(publicKeyHash)}`,
  };
}

const DETAIL_LABELS = Object.freeze({
  publicKeyHashHex: ["publicKeyHash", "HASH160(public key)"],
  redeemScriptHex: ["redeemScript", "P2WPKH redeem script"],
  scriptHashHex: ["scriptHash", "HASH160(redeem script)"],
  witnessProgramHex: ["witnessProgram", "Witness program"],
  scriptPubKeyHex: ["scriptPubKey", "scriptPubKey"],
} as const);

/** The script facts of an encoded address as result fields, in the order Bitcoin shows them. */
export function utxoAddressDetails(details: Readonly<Record<string, string>>): ResultField[] {
  return Object.entries(DETAIL_LABELS).flatMap(([name, [key, label]]) => {
    const value = details[name];
    return value === undefined ? [] : [field(key, label, value)];
  });
}

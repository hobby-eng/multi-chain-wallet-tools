// What a single-key coin brings to the Wallet Matcher (matcher-targets.ts): its recognizer, built
// from the decoders below, which accept an address only with a valid checksum and the coin's
// version. These coins are mainnet only, so a testnet search recognizes none of their addresses.
import { base58, bech32 } from "@scure/base";
import { decodeBase58Check } from "@ckd/core/crypto.js";
import type { MatcherCoin } from "./matcher-targets.js";

/** How a coin read an address: the value compared and the adapters that may derive it. */
export interface SingleKeyRecognition {
  readonly normalized: string;
  readonly adapterIds: readonly string[];
}

/** A coin's matcher part from its recognizer and its address adapters. */
export function singleKeyMatcher(
  addressAdapters: readonly string[],
  recognize: (value: string) => SingleKeyRecognition | null,
): MatcherCoin {
  return {
    recognize: (value, network) => {
      if (network !== "mainnet") return null;
      const recognized = recognize(value);
      return recognized === null ? null : { input: value, network, ...recognized };
    },
    addressAdapters,
  };
}

/** The payload after `version` of a base58check `value` whose payload is version + 20 bytes. */
export function base58Hash(value: string, version: readonly number[]): Uint8Array | null {
  const payload = decodeBase58Check(value);
  if (payload === null) return null;
  return payload.length === version.length + 20 && version.every((byte, at) => payload[at] === byte)
    ? payload.slice(version.length)
    : null;
}

/** The 20 data bytes of a bech32 `value` under `prefix`; with `witness`, a version 0 program. */
export function bech32Hash(value: string, prefix: string, witness = false): Uint8Array | null {
  // bech32.decode's template type needs the separator; the prefix test below proves it is there.
  if (!value.toLowerCase().startsWith(`${prefix}1`)) return null;
  let decoded: ReturnType<typeof bech32.decode>;
  try {
    decoded = bech32.decode(value as `${string}1${string}`);
  } catch {
    return null;
  }
  const { prefix: decodedPrefix, words } = decoded;
  if (decodedPrefix !== prefix || (witness && words[0] !== 0)) return null;
  let bytes: Uint8Array;
  try {
    bytes = bech32.fromWords(witness ? words.slice(1) : words);
  } catch {
    return null;
  }
  return bytes.length === 20 ? bytes : null;
}

/** The 32 bytes of a base58 Ed25519 public key, as Solana writes an address. */
export function base58Key(value: string): Uint8Array | null {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(value)) return null;
  try {
    const bytes = base58.decode(value);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

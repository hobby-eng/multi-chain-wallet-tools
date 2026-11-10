// What a single-key coin brings to the Wallet Matcher (matcher-targets.ts): its recognizer, built
// from the bech32 decoder below or the coin's own address decoder (base58Hash of crypto-core, the
// coins' own modules), which accept an address only with a valid checksum and the coin's version.
// These coins are mainnet only, so a testnet search recognizes none of their addresses.
import { bech32 } from "@scure/base";
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

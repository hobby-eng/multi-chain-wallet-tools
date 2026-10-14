import { bech32, bech32m, createBase58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { EthereumAddress } from "@ckd/core/eip55.js";
import { BITCOIN_ADDRESS_FACTS, getBitcoinAddressFacts } from "@ckd/core/bitcoin-address-facts.js";
import { HASH_ADDRESS_PAYLOAD_BYTES } from "@ckd/core/address-parameters.js";
import type { NetworkName } from "@ckd/core/types.js";

const base58check = createBase58check(sha256);

export function normalizeBitcoinAddress(value: unknown, network: NetworkName): string {
  const invalid = () => new Error(`Invalid Bitcoin ${network} address or checksum.`);
  if (typeof value !== "string") throw invalid();
  try {
    const facts = getBitcoinAddressFacts(network);
    if (
      Object.values(BITCOIN_ADDRESS_FACTS).some(({ bech32Hrp }) =>
        value.toLowerCase().startsWith(`${bech32Hrp}1`),
      )
    ) {
      const lower = value.toLowerCase();
      let decoded: ReturnType<typeof bech32.decode>;
      try {
        decoded = bech32.decode(value as `${string}1${string}`);
      } catch {
        decoded = bech32m.decode(value as `${string}1${string}`);
      }
      const version = decoded.words[0];
      if (version === undefined || version > 16 || decoded.prefix !== facts.bech32Hrp)
        throw invalid();
      const encoding = version === 0 ? bech32 : bech32m;
      const checked = encoding.decode(value as `${string}1${string}`);
      const program = encoding.fromWords(checked.words.slice(1));
      if (
        program.length < 2 ||
        program.length > 40 ||
        (version === 0 && program.length !== 20 && program.length !== 32)
      )
        throw invalid();
      return lower;
    }
    const payload = base58check.decode(value);
    if (
      payload.length !== HASH_ADDRESS_PAYLOAD_BYTES ||
      (payload[0] !== facts.p2pkh && payload[0] !== facts.p2sh)
    )
      throw invalid();
    return value;
  } catch {
    throw invalid();
  }
}

export function normalizeEthereumAddress(value: unknown): string {
  return EthereumAddress.parse(value).checksummed;
}

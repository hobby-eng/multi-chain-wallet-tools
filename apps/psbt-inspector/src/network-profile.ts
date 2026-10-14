import { bech32, bech32m, createBase58check } from "@scure/base";
import type { BTC_NETWORK } from "@scure/btc-signer/utils.js";
import { ADDRESS_HASH_BYTES, HASH_ADDRESS_PAYLOAD_BYTES } from "@ckd/core/address-parameters.js";
import { BITCOIN_ADDRESS_FACTS } from "@ckd/core/bitcoin-address-facts.js";
import { encodeP2pkh, encodeP2sh, sha256 } from "@ckd/core/crypto.js";
import {
  getBitcoinNetwork,
  getDashNetwork,
  type BitcoinNetwork,
  type DashNetwork,
  type Bip32Versions,
} from "@ckd/core/networks.js";
import type { PsbtChain, PsbtNetwork } from "./psbt-types.js";

const base58check = createBase58check(sha256);
const REGTEST_WITNESS_HRP = "bcrt";
// BIP173/BIP350: address length, witness versions and program widths.
const MAX_WITNESS_ADDRESS_LENGTH = 90;
const MAX_WITNESS_VERSION = 16;
const MIN_WITNESS_PROGRAM_BYTES = 2;
const MAX_WITNESS_PROGRAM_BYTES = 40;
const WITNESS_SCRIPT_HASH_BYTES = sha256.outputLen;
const OP_1_MINUS_ONE = 0x50;

/** Encoding facts and address validation for every Inspector front end. */
export class InspectorNetworkProfile {
  private readonly facts: Readonly<BitcoinNetwork | DashNetwork>;

  constructor(
    chain: PsbtChain,
    private readonly network: PsbtNetwork,
  ) {
    if (network !== "mainnet" && network !== "testnet" && network !== "regtest")
      throw new Error(`Unsupported address network: ${String(network)}.`);
    // Both chains share testnet's Base58 and BIP32 versions with regtest. Only
    // witness address encoding needs a distinct regtest HRP.
    const name = network === "mainnet" ? "mainnet" : "testnet";
    this.facts = chain === "dash" ? getDashNetwork(name) : getBitcoinNetwork(name);
  }

  get versions(): Bip32Versions {
    return { ...this.facts.versions };
  }

  private get witnessHrp(): string {
    if (!("bech32Hrp" in this.facts))
      throw new Error("Witness address encoding is unavailable for this chain.");
    return this.network === "regtest" ? REGTEST_WITNESS_HRP : this.facts.bech32Hrp;
  }

  /** Structural adapter; the shared profile imports no signer implementation. */
  get signerNetwork(): BTC_NETWORK {
    return {
      bech32: this.witnessHrp,
      pubKeyHash: this.facts.p2pkh,
      scriptHash: this.facts.p2sh,
      wif: this.facts.wif,
    };
  }

  p2pkhAddress(hash: Uint8Array): string {
    return encodeP2pkh(hash, this.facts.p2pkh);
  }

  p2shAddress(hash: Uint8Array): string {
    return encodeP2sh(hash, this.facts.p2sh);
  }

  private validateWitness(version: number, program: Uint8Array): void {
    if (!Number.isInteger(version) || version < 0 || version > MAX_WITNESS_VERSION)
      throw new Error("Invalid witness address version.");
    if (
      program.length < MIN_WITNESS_PROGRAM_BYTES ||
      program.length > MAX_WITNESS_PROGRAM_BYTES ||
      (version === 0 &&
        program.length !== ADDRESS_HASH_BYTES &&
        program.length !== WITNESS_SCRIPT_HASH_BYTES)
    )
      throw new Error("Invalid witness program length.");
  }

  witnessAddress(version: number, program: Uint8Array): string {
    this.validateWitness(version, program);
    const encoding = version === 0 ? bech32 : bech32m;
    return encoding.encode(this.witnessHrp, [version, ...encoding.toWords(program)]);
  }

  addressScript(address: string): Uint8Array {
    const witnessPrefixes = [
      ...Object.values(BITCOIN_ADDRESS_FACTS).map(({ bech32Hrp }) => bech32Hrp),
      REGTEST_WITNESS_HRP,
    ];
    if (witnessPrefixes.some((prefix) => address.toLowerCase().startsWith(`${prefix}1`))) {
      const expectedPrefix = this.witnessHrp;
      // Decode either family first, then require the family assigned to the
      // witness version. A valid checksum of the wrong family is still invalid.
      const decoded =
        bech32.decodeUnsafe(address, MAX_WITNESS_ADDRESS_LENGTH) ??
        bech32m.decodeUnsafe(address, MAX_WITNESS_ADDRESS_LENGTH);
      if (!decoded) throw new Error("Invalid witness address checksum or encoding.");
      const version = decoded.words[0];
      if (version === undefined || version > MAX_WITNESS_VERSION)
        throw new Error("Invalid witness address version.");
      const encoding = version === 0 ? bech32 : bech32m;
      const checked = encoding.decode(address as `${string}1${string}`, MAX_WITNESS_ADDRESS_LENGTH);
      if (checked.prefix !== expectedPrefix)
        throw new Error(`Address does not belong to ${this.network}.`);
      const program = encoding.fromWords(checked.words.slice(1));
      this.validateWitness(version, program);
      return Uint8Array.of(
        version === 0 ? 0 : OP_1_MINUS_ONE + version,
        program.length,
        ...program,
      );
    }
    const payload = base58check.decode(address);
    if (payload.length !== HASH_ADDRESS_PAYLOAD_BYTES)
      throw new Error("Invalid Base58 address payload.");
    if (payload[0] === this.facts.p2pkh)
      return Uint8Array.of(0x76, 0xa9, ADDRESS_HASH_BYTES, ...payload.slice(1), 0x88, 0xac);
    if (payload[0] === this.facts.p2sh)
      return Uint8Array.of(0xa9, ADDRESS_HASH_BYTES, ...payload.slice(1), 0x87);
    throw new Error(`Address does not belong to ${this.network}.`);
  }
}

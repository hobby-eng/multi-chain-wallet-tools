// The addresses of TON's wallet contracts for an Ed25519 public key: the representation hash of the
// StateInit cell that holds the contract's code and its initial data, in TON's user-friendly form.
// Only what an address needs is built: the code cell enters by its hash and depth, the data cell by
// its bits. Sources (read 2026-11-10): ton-org/ton src/wallets (data layouts and wallet ids),
// ton-org/ton-core (cell hashing, StateInit, user-friendly address), Ledger's app-ton address.c
// (v3R2 and v4R2 code hashes and depths), ton-blockchain/wallet-contract-v5 build (the W5 code
// hash). test/oracles/ton_oracle.py reproduces the code hashes, W5's and v4R2's from wallet-core's
// state inits, which also fix their data layouts, and v3R2's from the code ton-org/ton publishes; no
// v3R2 address of a known key is published, so its data layout rests on ton-org/ton's source.
import { concatBytes, hexToBytes, sha256 } from "@ckd/core/crypto.js";
import { tonFriendlyAddress } from "./address.js";

/** A cell as a reference: its representation hash and its depth. */
interface CellRef {
  readonly hash: Uint8Array;
  readonly depth: number;
}

/** A TON wallet contract this module derives addresses for. */
export type TonWalletVersion = "v3r2" | "v4r2" | "w5";

/** The code cells of the wallet contracts, by their published hashes and depths. */
const CODE: Readonly<Record<TonWalletVersion, CellRef>> = Object.freeze({
  v3r2: {
    hash: hexToBytes("84dafa449f98a6987789ba232358072bc0f76dc4524002a5d0918b9a75d2d599"),
    depth: 0,
  },
  v4r2: {
    hash: hexToBytes("feb5ff6820e2ff0d9483e7e0d62c817d846789fb4ae580c878866d959dabd5c0"),
    depth: 7,
  },
  w5: {
    hash: hexToBytes("20834b7b72b112147e1b2fb457b84e74d1a30f04f737d4f62a668e9552d2b72f"),
    depth: 6,
  },
});

/** The subwallet id of v3 and v4 wallets on the basechain: 698983191 + workchain 0. */
const V3_V4_WALLET_ID = 698983191;
/** W5's wallet id on mainnet's basechain: global id -239 XOR its client context. */
const W5_MAINNET_WALLET_ID = 2147483409;
/** StateInit's bits: no split depth, no special, code present, data present, no libraries. */
const STATE_INIT_BITS = [false, false, true, true, false];

/** Bits written most significant first, as a cell holds them. */
class CellBits {
  readonly #bits: boolean[] = [];

  bit(value: boolean): this {
    this.#bits.push(value);
    return this;
  }

  uint(value: number, width: number): this {
    for (let shift = width - 1; shift >= 0; shift -= 1)
      this.#bits.push(Math.floor(value / 2 ** shift) % 2 === 1);
    return this;
  }

  bytes(value: Uint8Array): this {
    for (const byte of value) this.uint(byte, 8);
    return this;
  }

  /** The cell's representation hash and depth, with `refs` as its references. */
  cell(refs: readonly CellRef[] = []): CellRef {
    const length = this.#bits.length;
    const padded = [...this.#bits];
    // An incomplete last byte is closed by a 1 bit and zeros (the completion tag).
    if (length % 8 !== 0) padded.push(true, ...Array<boolean>(7 - (length % 8)).fill(false));
    const data = Uint8Array.from({ length: padded.length / 8 }, (_, at) =>
      padded.slice(at * 8, at * 8 + 8).reduce((byte, bit) => byte * 2 + (bit ? 1 : 0), 0),
    );
    const descriptors = Uint8Array.of(refs.length, Math.ceil(length / 8) + Math.floor(length / 8));
    const depths = refs.map(({ depth }) => Uint8Array.of(depth >> 8, depth & 0xff));
    const hash = sha256(concatBytes(descriptors, data, ...depths, ...refs.map((ref) => ref.hash)));
    const depth = refs.length === 0 ? 0 : 1 + Math.max(...refs.map((ref) => ref.depth));
    return { hash, depth };
  }
}

/** The initial data cell of `version` for a 32-byte Ed25519 public key. */
function dataCell(version: TonWalletVersion, publicKey: Uint8Array): CellRef {
  if (version === "w5")
    return new CellBits()
      .bit(true) // signature authentication allowed
      .uint(0, 32) // seqno
      .uint(W5_MAINNET_WALLET_ID, 32)
      .bytes(publicKey)
      .bit(false) // no extensions
      .cell();
  const data = new CellBits().uint(0, 32).uint(V3_V4_WALLET_ID, 32).bytes(publicKey);
  return (version === "v4r2" ? data.bit(false) : data).cell(); // v4: no plugins
}

/** The 32-byte account id of `version` for `publicKey`: its StateInit's representation hash. */
export function tonWalletAccountId(version: TonWalletVersion, publicKey: Uint8Array): Uint8Array {
  const stateInit = new CellBits();
  for (const bit of STATE_INIT_BITS) stateInit.bit(bit);
  return stateInit.cell([CODE[version], dataCell(version, publicKey)]).hash;
}

/** The user-friendly mainnet address of `version` for `publicKey`. */
export function tonWalletAddress(
  version: TonWalletVersion,
  publicKey: Uint8Array,
  bounceable = false,
): string {
  return tonFriendlyAddress(tonWalletAccountId(version, publicKey), bounceable);
}

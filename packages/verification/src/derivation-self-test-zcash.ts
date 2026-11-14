import { bytesToHex, hexToBytes, wipe } from "@ckd/core/crypto.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import type { DerivationResult } from "@ckd/core/types.js";
import { ZCASH_COIN_ADAPTERS } from "@ckd/coins/adapters/zcash.js";
import { zcashDerivation } from "@ckd/coins/zcash/index.js";
import { decodeUnified } from "@ckd/coins/zcash/unified.js";
import {
  SaplingExpandedSpendingKey,
  SaplingExtendedSpendingKey,
} from "../../coin-protocols/src/zip32-sapling.js";
import { expectEqual, resultValue } from "./helpers.js";
import { singleKeyCoinSelfTest } from "./single-key-coin-self-test.js";

// The transparent tab's first address of the public phrase, which MnemoCode's own Rust derivation
// finds at the same path, and its account key, which test/oracles/bip32_oracle.py recomputes
// independently (packages/coin-protocols/tests/bip44-coins.test.ts). The Sapling tab's first
// address of the same phrase is an own value of test/oracles/zcash_sapling_oracle.py, which first
// reproduces every published value below. Sapling's published known answers, from
// zcash/zcash-test-vectors @78321be test-vectors/json/ (test/fixtures/zcash-test-vectors):
// sapling_generators.json (skb and pkb, ak and nk of ask = nsk = 1), sapling_zip32_hard.json (the
// master key m of bytes(range(32)), its ivk and diversifiers d0 and d2, and m/1'), and
// unified_address.json (account 0, j = 0, P2PKH and Sapling). The refused unified address is the
// "unordered" fixture of test/oracles/zcash_unified_oracle.py (Sapling, then P2PKH).

/** Check names of Sapling's published known answers. */
const CHECKS = Object.freeze({
  keys: "Zcash Sapling generators and ZIP-32 master and child keys · zcash-test-vectors",
  unified: "Zcash unified address of a Sapling row · ZIP-316 vectors",
  refusal: "Zcash unified address refusal of unordered typecodes",
});

/** sapling_generators.json: skb (G) and pkb (H), ak and nk of ask = nsk = 1. */
const GENERATORS =
  "30b5f2aaad325630bcdddbce4d67656d05fd1cc2d037bb5375b6e96d9e01a1d7" +
  "e7e85de0f7f97a46d249a1f5ea51df50cc48490f8401c9de7a2adf1807d1b6d4";
/** sapling_zip32_hard.json rows m and m/1' of bytes(range(32)). */
const MASTER = Object.freeze({
  xsk: "000000000000000000d0947c4b03bf72a37ab44f72276d1cf3fdcd7ebf3e73348b7e550d752018668eb6c00c93d36032b9a268e99e86a860776560bf0e83c1a10b51f607c9547425068204ede83b2f1fbd84f9b45d7f996e2ebd0a030ad243b48ed39f748a8821ea06395884890323b9d4933c021db89bcf767df21977b2ff0683848321a4df4afb2177c17cb75b7796afb39f0f3e91c924607da56fa9a20e283509bc8a3ef996a172",
  ivk: "4847a130e799d3dbea36a1c16467d621fb2d80e30b3b1d1a426893415dad6601",
  d0: "d8621b981cf300e9d4cc89",
});
const CHILD = Object.freeze({
  xsk: "0114c2713a010000806fccaa45a8206b063ebb68c610e05927aa94d61be93ec25eb4f82efd68caaedbd5f7e92efb7abe04dc8c148b0b3b0fc23e0429f00208ff93b68d21a6e131bd04372a7c6822cbe603f3465c4b9b6558f3a3512decd434012e67bffcf657e5750a2530761933348c1fcf14355433a8d291167fbb37b2ce37ca97160a47ec331c69f288400fd65f9adfe3a7c3720aceee0dae050d0a819d619f92e9e2cb4434d526",
  xfvk: "0114c2713a010000806fccaa45a8206b063ebb68c610e05927aa94d61be93ec25eb4f82efd68caaedbcfca79d337bc689813e409a54e3e72ad8e2f703ae6f8223c9becbde9a8a35f53513de64085d35a3adf23d89d5a21cdee4db4c625bd6a3c3c624bef4344141deb2530761933348c1fcf14355433a8d291167fbb37b2ce37ca97160a47ec331c69f288400fd65f9adfe3a7c3720aceee0dae050d0a819d619f92e9e2cb4434d526",
});
/** unified_address.json: account 0, j = 0, P2PKH and Sapling receivers. */
const UNIFIED_ADDRESS =
  "u1l8xunezsvhq8fgzfl7404m450nwnd76zshscn6nfys7vyz2ywyh4cc5daaq0c7q2su5lqfh23sp7fkf3kt27ve5948mzpfdvckzaect2jtte308mkwlycj2u0eac077wu70vqcetkxf";
/** The oracle's "unordered" unified address: its Sapling item before its P2PKH item. */
export const ZCASH_UNORDERED_ADDRESS =
  "u1rans3uu7cj0xyc7t7wfwqh65pau3aslpksy8jxpay5jf0q4cak9p4masfgl88tsnkh5nr9ly8cp29kv6q2qsdvxcjkc4x78540my82enpg4xv7zpwqeycwvcru38fq4eeqlv5dsfuz6";

/** The refusal code of a unified encoding whose typecodes are out of order (unified.ts). */
const UNORDERED_REFUSAL = "zcash.unified.order";

/** The seed of zcash-test-vectors' generators: bytes(range(32)). */
export const ZCASH_VECTOR_SEED = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

/** `read` of the Sapling rows of `seed` (hex) from `start`, `count` of them; the result is cleared. */
export function zcashSaplingValue<T>(
  seed: string,
  input: { readonly account: number; readonly start: number; readonly count: number },
  read: (result: DerivationResult) => T,
): T {
  const derive = zcashDerivation("zcash-sapling");
  if (derive === undefined)
    throw new Error("Cryptographic self-test failed: zcash-sapling is not derived.");
  const result = derive({ seed: hexToBytes(seed), network: "mainnet", branch: 0, ...input });
  try {
    return read(result);
  } finally {
    clearDerivationResult(result);
  }
}

/** `bytes` as hex, compared with `expected` under `check` and wiped. */
function expectBytes(check: string, bytes: Uint8Array, expected: string): void {
  try {
    expectEqual(check, bytesToHex(bytes), expected);
  } finally {
    wipe(bytes);
  }
}

/** G and H, and ZIP-32's master key m and child m/1' of bytes(range(32)). */
function checkKeys(): string {
  const unit = new Uint8Array(96);
  unit[0] = 1;
  unit[32] = 1;
  const generators = SaplingExpandedSpendingKey.fromBytes(unit);
  try {
    expectBytes(CHECKS.keys, generators.fullViewingKey().subarray(0, 64), GENERATORS);
  } finally {
    generators.wipe();
  }
  const master = SaplingExtendedSpendingKey.fromSeed(hexToBytes(ZCASH_VECTOR_SEED));
  const child = master.deriveHardened([1]);
  try {
    expectBytes(CHECKS.keys, master.bytes(), MASTER.xsk);
    expectBytes(CHECKS.keys, master.incomingViewingKey(), MASTER.ivk);
    expectEqual(
      CHECKS.keys,
      bytesToHex(master.addressAt(0n)?.diversifier ?? new Uint8Array(0)),
      MASTER.d0,
    );
    if (master.addressAt(2n) !== null)
      throw new Error(`Cryptographic self-test failed: ${CHECKS.keys}.`);
    expectBytes(CHECKS.keys, child.bytes(), CHILD.xsk);
    expectBytes(CHECKS.keys, child.extendedFullViewingKey(), CHILD.xfvk);
  } finally {
    child.wipe();
    master.wipe();
  }
  return CHECKS.keys;
}

/** The unified address with the transparent receiver of account 0, j = 0, of bytes(range(32)). */
function checkUnifiedAddress(): string {
  const address = zcashSaplingValue(
    ZCASH_VECTOR_SEED,
    { account: 0, start: 0, count: 1 },
    (result) => resultValue(result, "unifiedTransparentAddress"),
  );
  expectEqual(CHECKS.unified, address, UNIFIED_ADDRESS);
  return CHECKS.unified;
}

/** A unified address whose typecodes are out of order is refused for that reason (ZIP-316). */
function checkRefusal(): string {
  let refusal = "no refusal";
  try {
    decodeUnified("address", ZCASH_UNORDERED_ADDRESS).wipe();
  } catch (cause) {
    // Another refusal, or a failure without a code, fails the comparison.
    refusal = cause instanceof Error && "code" in cause ? String(cause.code) : "an uncoded failure";
  }
  expectEqual(CHECKS.refusal, refusal, UNORDERED_REFUSAL);
  return CHECKS.refusal;
}

/** Zcash's worker vectors, for every edition and selective build that has it. */
export const runZcashDerivationSelfTest = singleKeyCoinSelfTest({
  group: "Zcash",
  adapters: ZCASH_COIN_ADAPTERS,
  derivation: zcashDerivation,
  vectors: [
    {
      adapterId: "zcash",
      path: "m/44'/133'/0'/0/0",
      address: "t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F",
      accountXpub:
        "xpub6CLX6bXDznyoBCRaHYmzfApq4dLc34UydL1gRHQTG55pNwbKSC2GvXjTQ4VS3n6P24fRd14uKz7P92xJQ3MWdRzUxGkqiftZf3riboiJLJs",
    },
    {
      adapterId: "zcash-sapling",
      path: "m/32'/133'/0' · diversifier index 0",
      address: "zs188wzupg00tqs3y5reyjc758c6vhl8qm2kg4k43mcp533ytrdkwpy8xjdk3zqtek0ng0cv7f0nta",
    },
  ],
  checks: [checkKeys, checkUnifiedAddress, checkRefusal],
});

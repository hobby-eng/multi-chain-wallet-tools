// Cardano's startup self-test: each variant's first path, and published vectors only. The roots are
// given as cardano-serialization-lib's entropy (CIP-3's Icarus root), cardano-addresses' root_xsk
// and the BIP39 entropy and seed of Trezor's fixture phrase, so that the worker needs no word list.
// - Emurgo/cardano-serialization-lib @6b42538 rust/src/tests/crypto.rs xprv_128_test: the Icarus root
//   of an entropy; rust/src/tests/address.rs bip32_12_base, bip32_12_enterprise and
//   bip32_12_reward: the mainnet addresses of the root below.
// - IntersectMBO/cardano-addresses @27a2776 test/golden/addresses_5574d91d/golden: the Icarus root
//   (rootXPrv) of the phrase of those addresses, "test walk nut …".
// - trezor-firmware @433075c common/tests/fixtures/cardano/get_public_key.derivations.json: the
//   account keys m/1852'/1815'/0' of one 24-word phrase under Icarus, Icarus-Trezor and Ledger.
// - cardano-foundation/CIPs @7720fed CIP-0003/Icarus.md "Test vectors": the Icarus root of a phrase
//   with the passphrase "foo", given as the phrase's BIP39 entropy.
// One check is of own values (CORE-27): a change address and a receive address past index 0 of the
// "abandon … about" phrase, whose BIP39 entropy is 16 zero bytes. They, and the entropies and the
// seed given below as inputs, come from test/oracles/cardano_oracle.py, a standard-library
// reimplementation that first reproduces every published value above.
// The slower vectors are the worker's full self-test (apps/key-derivation/src/workers/
// cardano-key-self-test.ts).
import { cardanoIcarusRootOf, type CardanoIcarusMaster } from "@ckd/core/cardano-root.js";
import { bytesToHex, hexToBytes, wipe } from "@ckd/core/crypto.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import type { DerivationResult } from "@ckd/core/types.js";
import { CARDANO_COIN_ADAPTERS } from "@ckd/coins/adapters/cardano.js";
import { cardanoDerivation } from "@ckd/coins/cardano/index.js";
import { CARDANO_ROLES } from "@ckd/coins/cardano/profiles.js";
import { bech32 } from "@scure/base";
import { expectEqual, resultValue } from "./helpers.js";
import { singleKeyCoinSelfTest } from "./single-key-coin-self-test.js";

/** Each variant's first path. */
const FIRST_PATH = "m/1852'/1815'/0'/0/0";

/** The BIP39 entropy and seed (no passphrase) of Trezor's 24-word fixture phrase "very improve …". */
export const TREZOR_PHRASE = Object.freeze({
  entropy: "f2ee4361d72b3a72987e3b1219ed7b9b92ef2d51750b2cd5d266b5ef9611b41c",
  seed: "426bd949026f254474036a979a70382ecb17da226cf86e3eb4528f5de603ce52f4d1427ce54fff64c35320fd5643534c6f4ec047b2cecd6322a07f1bea789ee1",
});

/** cardano-addresses' Icarus root of "test walk nut penalty hip pave soap entry language right filter choice". */
export const TEST_WALK_ROOT =
  "root_xsk1vzrzr76vqyqlavclduhawqvtae2pq8lk0424q7t8rzfjyhhp530zxv2fwq5a3pd4vdzqtu6s2zxdjhww8xg4qwcs7y5dqne5k7mz27p6rcaath83rl20nz0v9nwdaga9fkufjuucza8vmny8qpkzwstk5qh7s88m";

const ROOT_CHECK = "Cardano Icarus and Icarus-Trezor roots, without and with a passphrase · CIP-3";
const ADDRESS_CHECK = "Cardano base, enterprise and stake addresses · CIP-19";
const ACCOUNT_CHECK = "Cardano Icarus, Icarus-Trezor and Ledger account keys";
const REFUSAL_CHECK = "Cardano root refusal of a BIP39 seed";
const ROWS_CHECK = "Cardano change address and receive address #5";

/** CIP-3's Icarus root of "eight country switch …" with the passphrase "foo". */
const CIP3_FOO_ROOT =
  "70531039904019351e1afb361cd1b312a4d0565d4ff9f8062d38acf4b15cce41d7b5738d9c893feea55512a3004acb0d222c35d3e3d5cde943a15a9824cbac59443cf67e589614076ba01e354b1a432e0e6db3b59e37fc56b5fb0222970a010e";
/** The BIP39 entropy of CIP-3's Icarus phrase "eight country switch …" (15 words). */
const CIP3_ENTROPY = "46e62370a138a182a498b8e2885bc032379ddf38";
/** The BIP39 entropy of "abandon abandon … about": 16 zero bytes (BIP39's first test vector). */
const ABANDON_ABOUT_ENTROPY = "00".repeat(16);

/** The bytes of a bech32 text of any length, such as a root_xsk or an acct_xvk. */
export function bech32Bytes(text: string): Uint8Array {
  return bech32.decodeToBytes(text, false).bytes;
}

/** The result of variant `id` for its first key of `role` below `seed`, which stays the caller's. */
export function cardanoResult(id: string, seed: Uint8Array, role: number): DerivationResult {
  const derive = cardanoDerivation(id);
  if (derive === undefined)
    throw new Error(`Cryptographic self-test failed: ${id} is not derived.`);
  return derive({
    seed: seed.slice(),
    network: "mainnet",
    account: 0,
    branch: role,
    start: 0,
    count: 1,
  });
}

/** `read` of the first key of `role` of variant `id` below `seed`; the result is cleared. */
export function cardanoValue<T>(
  id: string,
  seed: Uint8Array,
  role: number,
  read: (result: DerivationResult) => T,
): T {
  const result = cardanoResult(id, seed, role);
  try {
    return read(result);
  } finally {
    clearDerivationResult(result);
  }
}

/**
 * The Icarus root of `entropy` (hex) under `master` with the ASCII `passphrase`; the caller wipes
 * it.
 */
export function icarusRoot(
  entropy: string,
  master: CardanoIcarusMaster,
  passphrase = "",
): Uint8Array {
  const bytes = hexToBytes(entropy);
  const password = new TextEncoder().encode(passphrase);
  try {
    return cardanoIcarusRootOf(bytes, password, master);
  } finally {
    wipe(bytes, password);
  }
}

/** `root`'s hex, compared with `expected` and wiped. */
function expectRoot(check: string, root: Uint8Array, expected: string): void {
  try {
    expectEqual(check, bytesToHex(root), expected);
  } finally {
    wipe(root);
  }
}

/**
 * cardano-serialization-lib's Icarus root of the entropy of "art forum …" (xprv_128_test), and
 * CIP-3's with the passphrase "foo", which a root that left the passphrase out would miss.
 */
function checkRoot(): string {
  expectRoot(
    `${ROOT_CHECK}: no passphrase`,
    icarusRoot("0ccb74f36b7da1649a8144675522d4d8097c6412", "icarus"),
    "b8f2bece9bdfe2b0282f5bad705562ac996efb6af96b648f4445ec44f47ad95c10e3d72f26ed075422a36ed8585c745a0e1150bcceba2357d058636991f38a3791e248de509c070d812ab2fda57860ac876bc489192c1ef4ce253c197ee219a4",
  );
  // Icarus-Trezor adds the checksum at 24 words only: at CIP-3's 15 it is Icarus's root.
  for (const master of ["icarus", "icarus-trezor"] as const)
    expectRoot(
      `${ROOT_CHECK}: ${master}, passphrase`,
      icarusRoot(CIP3_ENTROPY, master, "foo"),
      CIP3_FOO_ROOT,
    );
  return ROOT_CHECK;
}

/**
 * Own values (header): the first change address, and receive address #5 as the last row of a batch
 * from #4, so that a change row derived as a receive row, or a row derived at the batch's start,
 * fails.
 */
function checkRows(): string {
  const root = icarusRoot(ABANDON_ABOUT_ENTROPY, "icarus");
  const derive = cardanoDerivation("cardano");
  if (derive === undefined) throw new Error(`Cryptographic self-test failed: ${ROWS_CHECK}.`);
  const input = { seed: root, network: "mainnet", account: 0 } as const;
  try {
    // Each result is cleared as soon as its address is read, whichever check fails.
    const addressOf = (branch: number, start: number, count: number, row: number) => {
      const result = derive({ ...input, branch, start, count });
      try {
        return result.rows[row]?.basic.find(({ key }) => key === "address")?.value ?? "";
      } finally {
        clearDerivationResult(result);
      }
    };
    expectEqual(
      `${ROWS_CHECK}: change`,
      addressOf(CARDANO_ROLES.internal, 0, 1, 0),
      "addr1qykhadtnvjpkxh76xgr0mu4huc9tg800x2sxsqemn9uz8jh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq28kufu",
    );
    expectEqual(
      `${ROWS_CHECK}: receive`,
      addressOf(CARDANO_ROLES.external, 4, 2, 1),
      "addr1q9pydq93mn8yahz7zkzh80tfla330pjruy9r7975uk5nu7l927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq8vtmft",
    );
  } finally {
    wipe(root);
  }
  return ROWS_CHECK;
}

/** cardano-serialization-lib's mainnet addresses of the first keys below cardano-addresses' root. */
function checkAddresses(): string {
  const root = bech32Bytes(TEST_WALK_ROOT);
  try {
    const [base, enterprise] = cardanoValue(
      "cardano",
      root,
      CARDANO_ROLES.external,
      (result) =>
        [resultValue(result, "address"), resultValue(result, "enterpriseAddress")] as const,
    );
    expectEqual(
      `${ADDRESS_CHECK}: base`,
      base,
      "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwqfjkjv7",
    );
    expectEqual(
      `${ADDRESS_CHECK}: enterprise`,
      enterprise,
      "addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl8",
    );
    expectEqual(
      `${ADDRESS_CHECK}: stake`,
      cardanoValue("cardano", root, CARDANO_ROLES.staking, (result) =>
        resultValue(result, "address"),
      ),
      "stake1uyevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqxdekzz",
    );
  } finally {
    wipe(root);
  }
  return ADDRESS_CHECK;
}

/** The account public key (public key ‖ chain code, hex) of variant `id` below `seed`. */
function accountKeyOf(id: string, seed: Uint8Array): string {
  return cardanoValue(id, seed, CARDANO_ROLES.external, (result) =>
    bytesToHex(bech32Bytes(resultValue(result, "accountPublicKey"))),
  );
}

/** Trezor's account keys of one 24-word phrase, which its three master keys make different. */
function checkAccountKeys(): string {
  const icarus = icarusRoot(TREZOR_PHRASE.entropy, "icarus");
  const trezor = icarusRoot(TREZOR_PHRASE.entropy, "icarus-trezor");
  const seed = hexToBytes(TREZOR_PHRASE.seed);
  try {
    expectEqual(
      `${ACCOUNT_CHECK}: Icarus`,
      accountKeyOf("cardano", icarus),
      "8946b80aaa2ab0839276ca373d0b7845803ae39e452ac2469986bf8b360b217f85e096c7789c5aa29012633044750b1a79ab5ac2eb7189c91113e8ffbadd550f",
    );
    expectEqual(
      `${ACCOUNT_CHECK}: Icarus-Trezor`,
      accountKeyOf("cardano-icarus-trezor", trezor),
      "8a97a956fadbc79e09a867ed1e829af4f66a34903c9194de44c87262dfe19111dd97903ff01f4fcb6375c8252b31a59d9b170c1b61f5786304dc676270f44a90",
    );
    expectEqual(
      `${ACCOUNT_CHECK}: Ledger`,
      accountKeyOf("cardano-ledger", seed),
      "09a48c3390586bf1b5141e141fd2045b54f0a100af4254abb9bcf124eb82b078abb4f1731e9bb4151fb8bbe4a63c64b84a6e6193ef2b97edd4176136d55c235f",
    );
  } finally {
    wipe(icarus, trezor, seed);
  }
  return ACCOUNT_CHECK;
}

/** An Icarus variant refuses a BIP39 seed in place of its root, so that no seed is misread. */
function checkRefusal(): string {
  const seed = hexToBytes(TREZOR_PHRASE.seed);
  try {
    let refused = false;
    try {
      clearDerivationResult(cardanoResult("cardano", seed, CARDANO_ROLES.external));
    } catch {
      refused = true;
    }
    if (!refused) throw new Error(`Cryptographic self-test failed: ${REFUSAL_CHECK}.`);
  } finally {
    wipe(seed);
  }
  return REFUSAL_CHECK;
}

/** Cardano's worker vectors, for every build that has it. */
export const runCardanoDerivationSelfTest = singleKeyCoinSelfTest({
  group: "Cardano",
  adapters: CARDANO_COIN_ADAPTERS,
  derivation: cardanoDerivation,
  // No variant has a published vector of the "abandon … about" seed: each one's first path, and
  // the published vectors of the checks.
  otherPaths: CARDANO_COIN_ADAPTERS.map(({ id }) => [id, FIRST_PATH] as const),
  vectors: [],
  checks: [checkRoot, checkAddresses, checkRows, checkAccountKeys, checkRefusal],
});

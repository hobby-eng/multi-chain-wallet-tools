import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes, secp256k1 } from "../src/crypto.js";
import { envelope191Digest } from "../src/message-signing-envelope-191.js";
import { recoverRecoverable, signRecoverable } from "../src/message-signing-recoverable.js";

const text = (value: string) => new TextEncoder().encode(value);
const keyOne = hexToBytes("01".padStart(64, "0"));
// eth-account tests/core/test_accounts.py L441-L496, the web3.js documentation key.
const ETH_KEY = hexToBytes("4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318");
const SOME_DATA =
  "0xb91467e570a6466aa9e9876cbcd013baba02900b8979d43fe208a4a4f339f5fd6007e74cd82e037b800186422fc2da167c747ef045e5d18a5f5d4300f8e1a0291c";
const digest = envelope191Digest("Ethereum", text("Some data"));

describe("recoverable signatures as Ethereum's and Tron's wallets write them", () => {
  it.each([
    [ETH_KEY, "Ethereum", text("Some data"), SOME_DATA],
    // viem src/accounts/utils/signMessage.test.ts L7-L25, anvil's account 0.
    [
      hexToBytes("ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"),
      "Ethereum",
      text("\u{1f975}"),
      "0x05c99bbbe9fac3ad61721a815d19d6771ad39f3e8dffa7ae7561358f20431d8e7f9e1d487c77355790c79c6eb0b0d63690f690615ef99ee3e4f25eef0317d0701b",
    ],
    // TronWeb test/testcases/src/sign-message.ts L4-L34: its 32-byte message, signed as bytes.
    [
      keyOne,
      "TRON",
      hexToBytes("47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad"),
      "0x7e65909ea47c732a4734bf6c41959761b23a58f4ca34e265428fb4576ee1db402e1e007a9019131a999e9dbbe81cc1f8ba424135a529a1b56220fec02e7647fa1c",
    ],
  ] as const)(
    "reproduces a published signature and recovers its key",
    (key, name, message, signature) => {
      const signed = envelope191Digest(name, message);
      expect(signRecoverable(key, signed)).toBe(signature);
      expect(recoverRecoverable(signature, signed)).toEqual(secp256k1.getPublicKey(key, false));
    },
  );

  it("reads v as 27/28 or 0/1, with or without 0x, in either case", () => {
    const publicKey = secp256k1.getPublicKey(ETH_KEY, false);
    const bare = SOME_DATA.slice(2);
    const v0 = `${bare.slice(0, -2)}${(Number.parseInt(bare.slice(-2), 16) - 27).toString(16).padStart(2, "0")}`;
    for (const form of [bare, bare.toUpperCase(), `0x${v0}`, ` ${SOME_DATA}\n`])
      expect(recoverRecoverable(form, digest)).toEqual(publicKey);
  });

  it("accepts a high S, as ecrecover does, for the same key", () => {
    const n = secp256k1.Point.Fn.ORDER;
    const bytes = hexToBytes(SOME_DATA.slice(2));
    const s = BigInt(`0x${bytesToHex(bytes.slice(32, 64))}`);
    const high = (n - s).toString(16).padStart(64, "0");
    const flipped = 55 - (bytes[64] ?? 0); // 27 <-> 28: the other recovery id of -s.
    const signature = `0x${bytesToHex(bytes.slice(0, 32))}${high}${flipped.toString(16)}`;
    expect(recoverRecoverable(signature, digest)).toEqual(secp256k1.getPublicKey(ETH_KEY, false));
  });

  it.each([
    ["129 hex digits", SOME_DATA.slice(0, -1), "INVALID_HEX"],
    ["131 hex digits", `${SOME_DATA}0`, "INVALID_HEX"],
    ["text that is not hex", `0x${"z".repeat(130)}`, "INVALID_HEX"],
    ["v = 29", `${SOME_DATA.slice(0, -2)}1d`, "INVALID_V"],
    ["v = 2", `${SOME_DATA.slice(0, -2)}02`, "INVALID_V"],
    ["r = 0", `0x${"00".repeat(32)}${SOME_DATA.slice(66)}`, "RECOVERY_FAILED"],
  ])("refuses %s", (_name, signature, code) => {
    expect(() => recoverRecoverable(signature, digest)).toThrow(expect.objectContaining({ code }));
  });
});

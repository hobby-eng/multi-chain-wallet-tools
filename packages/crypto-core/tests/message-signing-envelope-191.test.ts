import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes } from "../src/crypto.js";
import { envelope191, envelope191Digest } from "../src/message-signing-envelope-191.js";

const text = (value: string) => new TextEncoder().encode(value);

describe("EIP-191's personal_sign envelope and TronWeb's signMessageV2", () => {
  it.each([
    // eth-account tests/core/test_accounts.py L441-L496.
    [
      "Ethereum",
      text("Some data"),
      "1da44b586eb0729ff70a73c326926f6ed5a25f5b056e7f47fbc6e58d86871655",
    ],
    ["Ethereum", text("10284"), "0a162a5efbba02f38db3114531c8acba39fe676f09f7e471d93e8a06c471821c"],
    // TronWeb test/testcases/src/sign-message.ts L4-L34.
    [
      "TRON",
      text("hello world"),
      "cf02daeb2bea196ed5692322a66ed50080ce74ff8cb711199f1b04f3c13bc10d",
    ],
    [
      "TRON",
      hexToBytes("47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad"),
      "66733cf31ee3f133db9561efdca3d65ba930bdf57fb1af3b6cc0ba4966ecc882",
    ],
  ] as const)("hashes the %s envelope of a published message", (name, message, digest) => {
    expect(bytesToHex(envelope191Digest(name, message))).toBe(digest);
  });

  it("writes 0x19, the name, the length in bytes and the message", () => {
    // 🥵 is one character and four UTF-8 bytes, as viem's vector counts it.
    const emoji = text("\u{1f975}");
    expect(new TextDecoder().decode(envelope191("Ethereum", emoji))).toBe(
      "\x19Ethereum Signed Message:\n4\u{1f975}",
    );
    expect(envelope191("TRON", new Uint8Array())).toEqual(text("\x19TRON Signed Message:\n0"));
  });
});

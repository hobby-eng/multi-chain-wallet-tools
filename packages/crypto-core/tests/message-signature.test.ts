import { describe, expect, it } from "vitest";
import { MessageSignatureText } from "../src/message-signature.js";
import { SigningMessage } from "../src/signing-message.js";

describe("pasted signature text is admitted exactly and bounded", () => {
  it("accepts text up to the limit, surrounding whitespace included", () => {
    for (const text of ["H", " smpAkcw ", "a".repeat(MessageSignatureText.maxCharacters)])
      expect(() => MessageSignatureText.require(text)).not.toThrow();
  });

  it.each([
    [null, "INVALID_SIGNATURE_TEXT"],
    [42, "INVALID_SIGNATURE_TEXT"],
    [{ toString: () => "H" }, "INVALID_SIGNATURE_TEXT"],
    ["", "EMPTY_SIGNATURE"],
    [" \n\t", "EMPTY_SIGNATURE"],
    ["a".repeat(MessageSignatureText.maxCharacters + 1), "SIGNATURE_TOO_LONG"],
  ])("refuses %j with %s", (text, code) => {
    expect(() => MessageSignatureText.require(text)).toThrow(expect.objectContaining({ code }));
  });

  it("states its limit in its refusal", () => {
    expect(() =>
      MessageSignatureText.require("a".repeat(MessageSignatureText.maxCharacters + 1)),
    ).toThrow(`The signature exceeds ${MessageSignatureText.maxCharacters} characters.`);
  });

  it("holds a TON Connect response that repeats the longest message, each character escaped", () => {
    // The worst case: every character of the message is a control character JSON writes as \u0001.
    const text = "\u0001".repeat(SigningMessage.maxBytes);
    const response = JSON.stringify({
      signature: "A".repeat(86) + "==",
      address: `0:${"0".repeat(64)}`,
      timestamp: Number.MAX_SAFE_INTEGER,
      domain: '"'.repeat(253),
      payload: { type: "text", text },
    });
    expect(() => MessageSignatureText.require(response)).not.toThrow();
  });
});

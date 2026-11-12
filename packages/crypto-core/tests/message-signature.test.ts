import { describe, expect, it } from "vitest";
import { MessageSignatureText } from "../src/message-signature.js";

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
    expect(() => MessageSignatureText.require("a".repeat(5000))).toThrow(
      `The signature exceeds ${MessageSignatureText.maxCharacters} characters.`,
    );
  });
});

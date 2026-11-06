import { describe, expect, it } from "vitest";
import { SigningMessage } from "../src/signing-message.js";

describe("message admission bounds exact UTF-8 without changing the text", () => {
  it("accepts exact ASCII, multibyte and supplementary-character boundaries", () => {
    for (const text of [
      "a".repeat(SigningMessage.maxBytes),
      "é".repeat(SigningMessage.maxBytes / 2),
      "😀".repeat(SigningMessage.maxBytes / 4),
      " Text with spaces and e\u0301 ",
    ])
      expect(() => SigningMessage.require(text)).not.toThrow();
  });

  it("refuses each boundary's next UTF-8 byte", () => {
    for (const text of [
      "a".repeat(SigningMessage.maxBytes + 1),
      "é".repeat(SigningMessage.maxBytes / 2) + "a",
      "😀".repeat(SigningMessage.maxBytes / 4) + "a",
    ])
      expect(() => SigningMessage.require(text)).toThrow(
        expect.objectContaining({ code: "MESSAGE_TOO_LARGE" }),
      );
  });

  it.each([null, 7, {}, "\ud800", "\udc00", "a\ud800z"])(
    "refuses malformed text without coercion",
    (text) => {
      expect(() => SigningMessage.require(text)).toThrow(
        expect.objectContaining({ code: "INVALID_MESSAGE" }),
      );
    },
  );

  it("admits an empty verification message while refusing an empty signing message", () => {
    expect(() => SigningMessage.require("", true)).not.toThrow();
    expect(() => SigningMessage.require("")).toThrow(
      expect.objectContaining({ code: "EMPTY_MESSAGE" }),
    );
  });
});

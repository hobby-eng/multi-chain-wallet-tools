import { describe, expect, it } from "vitest";
import { SecretEgressGuard, disposeSecretBytes } from "../src/secret-guard.js";

describe("SecretEgressGuard", () => {
  it("blocks raw, compacted, percent-decoded and base64-encoded secret material", () => {
    const guard = new SecretEgressGuard();
    guard.registerString("mnemonic", "alpha beta gamma delta");
    expect(() => guard.assertPublic({ value: "alpha beta gamma delta" }, "request")).toThrow(
      /mnemonic/u,
    );
    expect(() => guard.assertPublic({ value: "alphabetagammadelta" }, "request")).toThrow(
      /mnemonic/u,
    );
    expect(() => guard.assertPublic({ value: "alpha%20beta%20gamma%20delta" }, "request")).toThrow(
      /mnemonic/u,
    );
    expect(() => guard.assertPublic({ value: btoa("alpha beta gamma delta") }, "request")).toThrow(
      /mnemonic/u,
    );
  });

  it("blocks encoded cells inside CSV, including Unicode, binary bytes and upper-case hex (AUD-026-SEC002)", () => {
    const guard = new SecretEgressGuard();
    const phrase = "synthetic café passphrase";
    const bytes = new Uint8Array([0xab, 0xcd, 0xef, 0x80, 0xff, 0x01, 0x02, 0x03]);
    guard.registerString("phrase", phrase);
    guard.registerBytes("key", bytes);
    const utf8 = new TextEncoder().encode(phrase.normalize("NFKD"));
    const originalUtf8 = new TextEncoder().encode(phrase);
    const encoded = (data: Uint8Array) => btoa(String.fromCharCode(...data));
    for (const cell of [
      encoded(utf8),
      encoded(originalUtf8),
      encoded(bytes),
      encoded(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, ""),
      "ABCDEF80FF010203",
      encodeURIComponent(phrase.normalize("NFKD")).toLowerCase(),
      encodeURIComponent(phrase).toLowerCase(),
    ])
      expect(() => guard.assertPublic(`label,100%,${cell}\n`, "export")).toThrow(/Blocked export/u);
    expect(() => guard.assertPublic("public address,123.45,confirmed", "export")).not.toThrow();
  });

  it("registers a lone surrogate without failing the seed session", () => {
    const guard = new SecretEgressGuard();
    const passphrase = "synthetic\ud800passphrase";
    expect(() => guard.registerString("passphrase", passphrase)).not.toThrow();
    expect(() => guard.assertPublic(passphrase, "export")).toThrow(/passphrase/u);
  });

  it("clears registered values and wipes disposable byte buffers", () => {
    const guard = new SecretEgressGuard();
    const secret = new Uint8Array([1, 2, 3, 4]);
    guard.registerBytes("seed", secret);
    expect(() => guard.assertPublic({ value: "01020304" }, "request")).toThrow(/seed/u);
    guard.clear();
    expect(() => guard.assertPublic({ value: "01020304" }, "request")).not.toThrow();
    disposeSecretBytes(secret);
    expect([...secret]).toEqual([0, 0, 0, 0]);
  });
});

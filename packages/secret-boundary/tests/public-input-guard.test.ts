import { describe, expect, it } from "vitest";
import {
  assertPublicBatchLookupInput,
  assertPublicLookupInput,
  PrivateMaterialError,
} from "../src/public-input-guard.js";

describe("public-input private-material boundary", () => {
  it.each([
    "0x" + "11".repeat(32),
    "xprv9s21ZrQH143K3QTDL4J7vG4hXr7hQeK1M8k1xH8pK5Q6Y6sXQ5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q",
    "xprv9s21ZrQH143K3example",
    "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----",
    "private key: secret",
  ])("rejects secret-looking public input and exposes the cleanup error", (value) => {
    expect(() => assertPublicLookupInput(value)).toThrow(PrivateMaterialError);
    expect(() => assertPublicLookupInput(value)).toThrow(/erased|No network request/iu);
  });

  it("rejects a valid mnemonic embedded in a multiline batch", () => {
    const mnemonic =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    expect(() =>
      assertPublicBatchLookupInput(`public-value\n${mnemonic}\nother-public-value`),
    ).toThrow(PrivateMaterialError);
  });

  // Public BIP39 vector for entropy ff..ff; its short words fit a DPNS name when joined.
  const ZOO = `${"zoo ".repeat(11)}wrong`;
  const ABANDON = `${"abandon ".repeat(11)}about`;

  it.each([
    ["hyphens", ZOO.replaceAll(" ", "-")],
    ["no separator", ZOO.replaceAll(" ", "")],
    ["dots", ZOO.replaceAll(" ", ".")],
    ["underscores", ZOO.replaceAll(" ", "_")],
    ["commas", ABANDON.replaceAll(" ", ",")],
    ["commas and spaces", ABANDON.replaceAll(" ", ", ")],
    ["slashes, upper case", ABANDON.replaceAll(" ", "/").toUpperCase()],
  ])("rejects a phrase joined with %s (AUD-019-SEC001)", (_, value) => {
    expect(() => assertPublicLookupInput(value)).toThrow(PrivateMaterialError);
  });

  it("rejects a batch with twelve phrase words in a row, even with a wrong checksum", () => {
    // Twelve times "zoo" fails the BIP39 checksum, like a phrase with a typo.
    const oneWordPerLine = `${"zoo\n".repeat(11)}zoo`;
    expect(() => assertPublicLookupInput("zoo")).not.toThrow();
    expect(() => assertPublicBatchLookupInput(oneWordPerLine)).toThrow(PrivateMaterialError);
    expect(() =>
      assertPublicBatchLookupInput(`public-value\n${ZOO.replaceAll(" ", ",\n")}`),
    ).toThrow(PrivateMaterialError);
  });

  it("accepts names that only resemble a joined phrase", () => {
    for (const value of [
      "alice-bob",
      "zoo-zoo-zoo",
      "thisisaverylongdpnsnamethatisnotaphrase",
      `${"zoo-".repeat(10)}zoo`,
    ])
      expect(() => assertPublicLookupInput(value)).not.toThrow();
    expect(() => assertPublicBatchLookupInput(`${"zoo\n".repeat(10)}zoo`)).not.toThrow();
  });

  it("accepts public values and rejects empty input explicitly", () => {
    expect(() =>
      assertPublicBatchLookupInput("1BoatSLRHtKNngkdXEeobR76b53LETtpyT\nDashIdentityName"),
    ).not.toThrow();
    expect(() => assertPublicLookupInput("   ")).toThrow(/Enter a public/iu);
  });
});

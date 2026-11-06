import { describe, expect, it } from "vitest";
import { Bip85 } from "../src/bip85.js";
import { Bip85Parameters } from "../src/bip85-parameters.js";
import { encodeWif } from "../src/crypto.js";

describe("BIP85 public parameter admission", () => {
  it.each<[unknown, string]>([
    [undefined, "bip85.application"],
    [null, "bip85.application"],
    [[], "bip85.application"],
    [{ application: "unsupported", index: 0 }, "bip85.application"],
    ...[-1, 2 ** 31, 0.5, Number.NaN, "0", undefined].map<[unknown, string]>((index) => [
      { application: "xprv", index },
      "bip85.index",
    ]),
    ...[0, 13, "12", Number.NaN, null].map<[unknown, string]>((words) => [
      { application: "bip39", index: 0, words },
      "bip85.words",
    ]),
    ...[15, 65, 16.5, "32", Number.NaN].map<[unknown, string]>((bytes) => [
      { application: "hex", index: 0, bytes },
      "bip85.bytes",
    ]),
    ...[-1, 256, 128.5, "128", Number.NaN].map<[unknown, string]>((wifVersion) => [
      { application: "wif", index: 0, wifVersion },
      "key.wif-version",
    ]),
  ])("refuses malformed options before reading any source: %j", (input, code) => {
    expect(() => Bip85.derive("invalid source must never be read", input)).toThrow(
      expect.objectContaining({ code }),
    );
  });

  it("snapshots defaults and ignores fields belonging only to inactive applications", () => {
    const input = { application: "xprv", index: 2 ** 31 - 1, words: 13, bytes: 1, wifVersion: -1 };
    const owner = new Bip85Parameters(input);
    input.index = 0;
    expect(owner.options.index).toBe(2 ** 31 - 1);
    expect(owner.options.application).toBe("xprv");
    expect(Object.isFrozen(owner.options)).toBe(true);
    expect(new Bip85Parameters({ application: "bip39", index: 0 }).options.words).toBe(12);
    expect(new Bip85Parameters({ application: "hex", index: 0 }).options.bytes).toBe(32);
  });

  it.each([16, 64])("admits the hexadecimal boundary %i without a secret", (bytes) => {
    expect(new Bip85Parameters({ application: "hex", index: 0, bytes }).options.bytes).toBe(bytes);
  });

  it.each(["", "  ", "-1", "0.5", "2147483648"])("refuses the index page field %j", (index) => {
    expect(() =>
      Bip85Parameters.fromFields({ application: "bip39", index, words: "12", bytes: "" }),
    ).toThrow(expect.objectContaining({ code: "bip85.index" }));
  });

  it("retains explicit-width validation on the individual public methods", () => {
    expect(() => Bip85.bip39("invalid", undefined, 0)).toThrow(
      expect.objectContaining({ code: "bip85.words" }),
    );
    expect(() => Bip85.hex("invalid", undefined, 0)).toThrow(
      expect.objectContaining({ code: "bip85.bytes" }),
    );
  });

  it.each([-1, 256, 1.5, Number.NaN])("refuses silent WIF prefix truncation: %j", (version) => {
    const borrowed = new Uint8Array(32).fill(1);
    expect(() => encodeWif(borrowed, version)).toThrow(
      expect.objectContaining({ code: "key.wif-version" }),
    );
    expect(borrowed.every((value) => value === 1)).toBe(true);
    borrowed.fill(0);
  });
});

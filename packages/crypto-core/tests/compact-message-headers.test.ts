import { describe, expect, it } from "vitest";
import {
  compactSigningHeader,
  readCompactHeader,
  type CompactHeaders,
} from "../src/compact-message-headers.js";
import { encodeP2pkh, hash160, secp256k1 } from "../src/crypto.js";
import { signCompactP2pkhMessage, verifyCompactP2pkhMessage } from "../src/compact-message.js";

const ANY = ["p2pkh", "p2sh-p2wpkh", "p2wpkh"];

describe("a compact signature's header, as each format reads it", () => {
  it.each([
    [27, "core", { recoveryId: 0, compressed: false, types: ["p2pkh"] }],
    [30, "core", { recoveryId: 3, compressed: false, types: ["p2pkh"] }],
    [31, "core", { recoveryId: 0, compressed: true, types: ["p2pkh"] }],
    [34, "core", { recoveryId: 3, compressed: true, types: ["p2pkh"] }],
    [27, "bip137", { recoveryId: 0, compressed: false, types: ["p2pkh"] }],
    [32, "bip137", { recoveryId: 1, compressed: true, types: ANY }],
    [35, "bip137", { recoveryId: 0, compressed: true, types: ["p2sh-p2wpkh"] }],
    [38, "bip137", { recoveryId: 3, compressed: true, types: ["p2sh-p2wpkh"] }],
    [39, "bip137", { recoveryId: 0, compressed: true, types: ["p2wpkh"] }],
    [42, "bip137", { recoveryId: 3, compressed: true, types: ["p2wpkh"] }],
    [31, "compressed", { recoveryId: 0, compressed: true, types: ["p2pkh"] }],
    [34, "compressed", { recoveryId: 3, compressed: true, types: ["p2pkh"] }],
  ] as const)("reads %i under %s", (header, headers, expected) => {
    expect(readCompactHeader(header, headers)).toEqual(expected);
  });

  it.each([
    [26, "core"],
    [35, "core"],
    [42, "core"],
    [26, "bip137"],
    [43, "bip137"],
    [27, "compressed"],
    [30, "compressed"],
    [35, "compressed"],
  ] as [number, CompactHeaders][])("does not read %i under %s", (header, headers) => {
    expect(readCompactHeader(header, headers)).toBeUndefined();
  });

  it("writes 31, 35 or 39 plus the recovery id, as BIP137 does", () => {
    expect(compactSigningHeader(0, "p2pkh")).toBe(31);
    expect(compactSigningHeader(3, "p2pkh")).toBe(34);
    expect(compactSigningHeader(1, "p2sh-p2wpkh")).toBe(36);
    expect(compactSigningHeader(2, "p2wpkh")).toBe(41);
  });
});

describe("Bitcoin's compact format keeps Bitcoin Core's headers", () => {
  const key = Uint8Array.from([...new Uint8Array(31), 1]);
  const address = encodeP2pkh(hash160(secp256k1.getPublicKey(key, true)), 0x00);
  const { signature } = signCompactP2pkhMessage(key, address, "fixture", "bitcoin", "mainnet");

  it("still signs with header 31 to 34", () => {
    const header = atob(signature).charCodeAt(0);
    expect(header).toBeGreaterThanOrEqual(31);
    expect(header).toBeLessThanOrEqual(34);
  });

  it("refuses BIP137's typed SegWit headers", () => {
    const bytes = Uint8Array.from(atob(signature), (character) => character.charCodeAt(0));
    bytes[0] = (bytes[0] ?? 0) + 4;
    const typed = btoa(String.fromCharCode(...bytes));
    expect(() =>
      verifyCompactP2pkhMessage(address, "fixture", typed, "bitcoin", "mainnet"),
    ).toThrow(expect.objectContaining({ code: "INVALID_HEADER" }));
  });
});

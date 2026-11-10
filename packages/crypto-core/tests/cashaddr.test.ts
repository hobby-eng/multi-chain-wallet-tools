// CashAddr against its specification (bitcoincash.org spec/cashaddr.md, version 1.0): the 20-byte
// P2KH (bitcoincash) and P2SH (bchtest) vectors of its "Larger Test Vectors" table and a pair of its
// address translations.
import { describe, expect, it } from "vitest";
import { hexToBytes } from "@ckd/core/crypto.js";
import { CASHADDR_P2KH, CASHADDR_P2SH, decodeCashAddr, encodeCashAddr } from "../src/cashaddr.js";

const HASH = hexToBytes("F5BF48B397DAE70BE82B3CCA4793F8EB2B6CDAC9");
const P2KH = "bitcoincash:qr6m7j9njldwwzlg9v7v53unlr4jkmx6eylep8ekg2";
const P2SH = "bchtest:pr6m7j9njldwwzlg9v7v53unlr4jkmx6eyvwc0uz5t";

describe("CashAddr", () => {
  it("encodes the specification's P2KH and P2SH vectors", () => {
    expect(encodeCashAddr("bitcoincash", CASHADDR_P2KH, HASH)).toBe(P2KH);
    expect(encodeCashAddr("bchtest", CASHADDR_P2SH, HASH)).toBe(P2SH);
    // 1BpEi6DfDAUFd7GtittLSdBeYJvcoaVggu, translated by the specification.
    expect(
      encodeCashAddr(
        "bitcoincash",
        CASHADDR_P2KH,
        hexToBytes("76a04053bda0a88bda5177b86a15c3b29f559873"),
      ),
    ).toBe("bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a");
  });

  it("decodes either case, with or without the prefix", () => {
    for (const text of [P2KH, P2KH.slice("bitcoincash:".length), P2KH.toUpperCase()]) {
      const decoded = decodeCashAddr(text, "bitcoincash");
      expect(decoded?.type).toBe(CASHADDR_P2KH);
      expect(decoded?.hash).toEqual(HASH);
    }
    expect(decodeCashAddr(P2SH, "bchtest")?.type).toBe(CASHADDR_P2SH);
  });

  it("refuses mixed case, another prefix, a changed character and a wrong length", () => {
    expect(
      decodeCashAddr("Bitcoincash:qr6m7j9njldwwzlg9v7v53unlr4jkmx6eylep8ekg2", "bitcoincash"),
    ).toBeNull();
    expect(decodeCashAddr(P2KH.replace("bitcoincash", "bchtest"), "bitcoincash")).toBeNull();
    expect(decodeCashAddr(P2KH.replace("ekg2", "ekg3"), "bitcoincash")).toBeNull();
    expect(decodeCashAddr(`${P2KH}q`, "bitcoincash")).toBeNull();
    expect(
      decodeCashAddr("bitcoincash:qr6m7j9njldwwzlg9v7v53unlr4jkmx6eylep8ekgb", "bitcoincash"),
    ).toBeNull();
  });
});

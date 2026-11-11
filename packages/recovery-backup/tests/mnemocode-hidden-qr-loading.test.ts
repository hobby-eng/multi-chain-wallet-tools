import { expect, it } from "vitest";
import { syntheticQrPng } from "../../../test/support/synthetic-png.mjs";
import { readHiddenQrRecord } from "../src/mnemocode-hidden-qr.js";

// This file's realm never loads MnemoCode, as a page whose MnemoCode is still loading: the hidden
// reader cannot look yet, and the image is read as an ordinary QR.
it("reads a PNG as keeping no hidden record while MnemoCode is still loading, and says so", () => {
  const reasons: string[] = [];
  const ordinary = syntheticQrPng(`${"0000".repeat(11)}0003`, 330, 330, 10);
  expect(readHiddenQrRecord(ordinary, (reason) => reasons.push(reason))).toBeUndefined();
  expect(reasons).toEqual(["MnemoCode is still loading: choose the image again in a moment."]);
});

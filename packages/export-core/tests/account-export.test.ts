import { expect, it } from "vitest";
import { AccountExportChoice, AccountExportError } from "../src/account-export.js";
import { AccountDescriptorFixture } from "@ckd/test-support/account-descriptor-fixture.js";

const BUNDLE = AccountDescriptorFixture.create();

it.each([
  ["publicCopy", false, false],
  ["publicDownload", false, true],
  ["privateCopy", true, false],
  ["privateDownload", true, true],
] as const)("preserves the exact %s choices in both formats", (action, secret, download) => {
  for (const format of ["raw", "core"] as const) {
    const choice = new AccountExportChoice(action, format);
    expect(choice.containsSecret).toBe(secret);
    expect(choice.download).toBe(download);
    expect(AccountExportChoice.permits(action, false)).toBe(!secret);
    expect(AccountExportChoice.permits(action, true)).toBe(true);
    const text = choice.text(BUNDLE, true);
    expect(choice.filename("fixture")).toBe(
      `fixture.${secret ? "PRIVATE" : "public"}.${format === "core" ? "core-import" : "descriptors"}.txt`,
    );
    if (format === "raw") expect(text).toBe(secret ? BUNDLE.privateText : BUNDLE.publicText);
    else {
      const requests: unknown = JSON.parse(text.slice("importdescriptors '".length, -1));
      const prefix = secret ? "xprv" : "xpub";
      expect(requests).toEqual([
        { desc: `pkh(${prefix}/0/*)`, timestamp: 0, active: true, internal: false },
        { desc: `pkh(${prefix}/1/*)`, timestamp: 0, active: true, internal: true },
      ]);
    }
  }
});

it.each([undefined, null, 0, true, {}, [], Symbol("synthetic"), "constructor", "__proto__"])(
  "refuses an outside action or format without coercing it",
  (value) => {
    expect(() => new AccountExportChoice(value, "raw")).toThrow(
      expect.objectContaining({ code: "account-export.action" }),
    );
    expect(() => new AccountExportChoice("publicCopy", value)).toThrow(
      expect.objectContaining({ code: "account-export.format" }),
    );
  },
);

it("does not expose private data through raw or Core views without disclosure", () => {
  for (const format of ["raw", "core"] as const) {
    const choice = new AccountExportChoice("privateCopy", format);
    expect(() => choice.text(BUNDLE, false)).toThrow(
      expect.objectContaining({ code: "account-export.disclosure" }),
    );
  }
});

it.each(["wrong/0/*", "first/1/*\nsecond/0/*", "bad'/0/*\nsecond/1/*", "bad\\/0/*\nsecond/1/*"])(
  "refuses unsafe console interpolation with a stable descriptor code",
  (text) => {
    expect(() => AccountExportChoice.coreCommand(text)).toThrow(AccountExportError);
    expect(() => AccountExportChoice.coreCommand(text)).toThrow(
      expect.objectContaining({ code: "account-export.descriptors" }),
    );
  },
);

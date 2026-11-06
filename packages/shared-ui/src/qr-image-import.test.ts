import { QrRaster } from "../../../test/support/qr-raster.js";
import { describe, expect, it } from "vitest";
import { decodeQrPixels } from "./qr-image-import.js";
import { QR_NOT_UTF8, qrText } from "./qr-text.js";

describe("offline QR image decoder", () => {
  it("decodes a textual recovery share", () => {
    const payload = "academic acid acrobat romp romp boring voting";
    expect(decodeQrPixels(QrRaster.of(payload)).text).toBe(payload);
  });

  it("gives a text field only UTF-8 text, as MnemoCode's QR input does (AUD-014-API002)", () => {
    const text = decodeQrPixels(QrRaster.of("Grüße, 你好"));
    expect(text.utf8).toBe(true);
    expect(qrText(text)).toBe("Grüße, 你好");
    // 0xff is no UTF-8 byte: decoded leniently it would be U+FFFD, another text without a word.
    const bytes = decodeQrPixels(QrRaster.of([0x70, 0x61, 0xff, 0x73, 0x73]));
    expect(bytes.utf8).toBe(false);
    expect(bytes.text).toContain("\uFFFD");
    expect(() => qrText(bytes)).toThrow(QR_NOT_UTF8);
  });

  it("preserves CompactSeedQR bytes containing NUL and line-break values", () => {
    const payload = Array.from(
      Buffer.from("0e59dde276009317f1275f1389888078c99368d1e82489b5f629531fc5b6a56e", "hex"),
    );
    expect(Array.from(decodeQrPixels(QrRaster.of(payload)).binaryData ?? [])).toEqual(payload);
  });
});

import assert from "node:assert/strict";

/** Inspect public fixture exports through the native decoder without loading an image URL. */
export class CardImageReadback {
  /** Require the selected file signature and return native dimensions, closing decoded pixels. */
  static async size(page, bytes, format) {
    if (format === "png")
      assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    else assert.deepEqual([...bytes.subarray(0, 3)], [255, 216, 255]);
    return page.evaluate(
      async ({ base64, type }) => {
        // A compact string avoids millions of JSON number objects in the driver.
        const data = Uint8Array.from(atob(base64), (symbol) => symbol.charCodeAt(0));
        const image = await createImageBitmap(new Blob([data], { type }));
        try {
          return [image.width, image.height];
        } finally {
          image.close();
        }
      },
      { base64: bytes.toString("base64"), type: format === "png" ? "image/png" : "image/jpeg" },
    );
  }
}

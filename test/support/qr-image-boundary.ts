import { vi } from "vitest";
import { PassiveQrPage } from "./qr-page.js";
import { QrRaster } from "./qr-raster.js";

const PAYLOAD = "public imported QR";

/** Deferred native bitmap/canvas boundary; QR pixel encoding and decoding remain real. */
export class QrImageBoundary {
  readonly pending: {
    release(payload?: string | readonly number[]): void;
    reject(): void;
    close: ReturnType<typeof vi.fn>;
  }[] = [];

  constructor(page: PassiveQrPage) {
    let raster = QrRaster.of(PAYLOAD);
    const create = page.createElement.bind(page);
    page.createElement = (tag) => {
      const element = create(tag);
      if (tag === "canvas")
        Object.assign(element, {
          getContext: () => ({ drawImage() {}, getImageData: () => raster }),
        });
      return element;
    };
    vi.stubGlobal(
      "createImageBitmap",
      () =>
        new Promise((resolve, reject) => {
          const close = vi.fn();
          this.pending.push({
            close,
            release(payload = PAYLOAD) {
              raster = QrRaster.of(payload);
              resolve({ width: raster.width, height: raster.height, close });
            },
            reject: () => reject(new Error("Synthetic browser decoder refusal")),
          });
        }),
    );
  }
}

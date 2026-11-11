// The types of synthetic-png.mjs for the unit tests; the browser cases import the module itself.

type Rgb = readonly [number, number, number];

/**
 * An 8-bit RGB PNG file of `width` by `height` pixels whose image data is `imageData` as given,
 * its chunks framed with their lengths and CRCs, in bytes of its own.
 */
export function framedPng(
  width: number,
  height: number,
  imageData: Uint8Array,
): Uint8Array<ArrayBuffer>;

/** An RGB PNG file of `width` by `height` pixels, each coloured by `pixel`, in bytes of its own. */
export function syntheticPng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => Rgb,
): Uint8Array<ArrayBuffer>;

/** Smooth shades across the picture, which hold a phrase in their legend. */
export function smoothPicture(width?: number, height?: number): Uint8Array<ArrayBuffer>;

/** One flat colour, which no legend can hold a phrase in. */
export function flatPicture(width?: number, height?: number): Uint8Array<ArrayBuffer>;

/**
 * A PNG file of `width` by `height` white pixels with the QR code of `payload` (text, or bytes as
 * an array of numbers) as uqr writes it, at its centre, `scale` pixels a module.
 */
export function syntheticQrPng(
  payload: string | readonly number[],
  width: number,
  height: number,
  scale: number,
): Uint8Array<ArrayBuffer>;

/**
 * Host services used by the card renderers.
 *
 * Rendering itself is platform-neutral. Reading bundled artwork, random choices,
 * PNG coding and QR matrices come from the host: Node.js supplies them through
 * `platform-node.ts`, and another host, such as a browser page, supplies its own.
 */
export interface RasterImage {
  readonly width: number;
  readonly height: number;
  /** RGBA, eight bits per channel, rows from top to bottom. */
  readonly data: Uint8Array;
}

export interface QrModules {
  readonly size: number;
  readonly get: (row: number, column: number) => boolean;
}

export interface RenderPlatform {
  /** Returns one bundled file named in `renderAssets`. */
  readonly readAsset: (path: RenderAsset) => Promise<Uint8Array>;
  /** Uniform integer from 0 up to, but not including, the limit. */
  readonly randomInt: (upperExclusive: number) => number;
  readonly decodePng: (bytes: Uint8Array) => RasterImage;
  readonly encodePng: (image: RasterImage, deflateLevel: number) => Uint8Array;
  /** QR matrix with error correction level M. */
  readonly qrModules: (payload: string) => QrModules;
}

/** Every bundled file a renderer can request, relative to the `assets` directory. */
export const renderAssets = [
  'fonts/DejaVuSans-UI.ttf',
  'images/business-architect-v1.png',
  'images/business-contact-v1.png',
  'images/business-curves-v1.png',
  'images/business-diagonal-v1.png',
  'images/business-estate-v1.png',
  'images/business-facets-v1.png',
  'images/business-it-v1.png',
  'images/business-glass-4in1.png',
  'images/business-glass-6in1.jpg',
  'images/business-glass-8in1.jpg',
  'images/material-enclosure.jpg',
  'images/material-kitchen.jpg',
  'images/material-switch.jpg',
  'images/material-tile.jpg',
  'images/material-vehicle.jpg',
] as const;
export type RenderAsset = (typeof renderAssets)[number];

export function isRenderAsset(path: string): path is RenderAsset {
  return (renderAssets as readonly string[]).includes(path);
}

let configured: RenderPlatform | undefined;

export function configureRenderPlatform(platform: RenderPlatform): void {
  configured = platform;
}

export function renderPlatform(): RenderPlatform {
  if (configured === undefined)
    throw new Error(
      'Card rendering has no platform. Node.js programs import the mnemocode package or export/platform-node.js; other hosts call configureRenderPlatform first.',
    );
  return configured;
}

export function readRenderAsset(path: string): Promise<Uint8Array> {
  if (!isRenderAsset(path)) throw new Error(`Unknown card asset: ${path}`);
  return renderPlatform().readAsset(path);
}

export function createRasterImage(width: number, height: number): RasterImage {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Image dimensions must be positive integers.');
  return { width, height, data: new Uint8Array(width * height * 4) };
}

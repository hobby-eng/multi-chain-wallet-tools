/**
 * Host services used by the card renderers.
 *
 * Rendering itself is platform-neutral. Reading bundled artwork, random choices,
 * PNG coding and QR matrices come from the host: Node.js supplies them through
 * `platform-node.ts`, and another host, such as a browser page, supplies its own. The host builds
 * a CardRenderer with them (card-renderer.ts) and passes it to every render; no module keeps a
 * platform of its own.
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

/**
 * The error correction of every QR code that MnemoCode draws or saves: level M, which restores
 * about 15% of a damaged code. A host's qrModules takes it from here.
 */
export const QR_ERROR_CORRECTION_LEVEL = "M";

/**
 * A uniform choice of a whole number below `upperExclusive`: the platform's randomInt, or a
 * test's.
 */
export type UniformChoice = (upperExclusive: number) => number;

export interface RenderPlatform {
  /** Returns one bundled file named in `renderAssets`. */
  readonly readAsset: (path: RenderAsset) => Promise<Uint8Array>;
  /** Uniform integer from 0 up to, but not including, the limit. */
  readonly randomInt: UniformChoice;
  readonly decodePng: (bytes: Uint8Array) => RasterImage;
  readonly encodePng: (image: RasterImage, deflateLevel: number) => Uint8Array;
  /** QR matrix with the error correction level QR_ERROR_CORRECTION_LEVEL. */
  readonly qrModules: (payload: string) => QrModules;
}

/** The parts of a platform that one renderer uses, each asked for alone (CardDrawing). */
export type AssetSource = Pick<RenderPlatform, "readAsset">;
/**
 * The random choices of a CardDrawing. The renderers pass `randomInt` on alone and call it
 * detached from its object, so a host that builds its own CardDrawing gives a function that needs
 * no `this`; CardRenderer wraps the platform's method so (card-renderer.ts).
 */
export interface RandomSource {
  /** Uniform integer from 0 up to, but not including, the limit; called detached. */
  readonly randomInt: UniformChoice;
}
export type QrSource = Pick<RenderPlatform, "qrModules">;
export type PngCodec = Pick<RenderPlatform, "decodePng" | "encodePng">;

/**
 * Every bundled file a renderer can request, relative to the `assets` directory: the host's
 * deliberate allowlist, written out rather than derived from the designs so that this module
 * imports no renderer; test/render-platform.test.ts keeps it in step with the files.
 */
export const renderAssets = [
  "fonts/DejaVuSans-UI.ttf",
  "images/business-architect-v1.png",
  "images/business-contact-v1.png",
  "images/business-curves-v1.png",
  "images/business-diagonal-v1.png",
  "images/business-estate-v1.png",
  "images/business-facets-v1.png",
  "images/business-it-v1.png",
  "images/material-enclosure.jpg",
  "images/material-kitchen.jpg",
  "images/material-switch.jpg",
  "images/material-tile.jpg",
  "images/material-vehicle.jpg",
] as const;
export type RenderAsset = (typeof renderAssets)[number];

export function isRenderAsset(path: string): path is RenderAsset {
  return (renderAssets as readonly string[]).includes(path);
}

/** The bundled file `path` from `source`, refused when it is none of renderAssets. */
export function readRenderAsset(source: AssetSource, path: string): Promise<Uint8Array> {
  if (!isRenderAsset(path)) throw new Error(`Unknown card asset: ${path}`);
  return source.readAsset(path);
}

/**
 * Bundled public artwork, each file read from `source` and prepared once, as its family of cards
 * needs it. A class, because it owns its entries and their one rule: a read or a preparation that
 * fails is forgotten, so that the next render tries again, and the error names the file, which is
 * public. It never holds a caller's references or recoloured artwork. Its entries come from its
 * own source only, so a renderer of another platform keeps a cache of its own (card-renderer.ts).
 */
export class BundledAssetCache<T> {
  readonly #entries = new Map<RenderAsset, Promise<T>>();
  readonly #source: AssetSource;
  readonly #prepare: (bytes: Uint8Array) => T;

  constructor(source: AssetSource, prepare: (bytes: Uint8Array) => T) {
    this.#source = source;
    this.#prepare = prepare;
  }

  /** The file `path`, prepared; read once, and again after a failure. */
  get(path: RenderAsset): Promise<T> {
    let entry = this.#entries.get(path);
    if (entry === undefined) {
      entry = Promise.resolve()
        .then(() => readRenderAsset(this.#source, path))
        .then((bytes) => this.#prepare(bytes))
        .catch((error: unknown) => {
          this.#entries.delete(path);
          throw new Error(`Cannot load card artwork ${path}: ${String(error)}`);
        });
      this.#entries.set(path, entry);
    }
    return entry;
  }
}

/** The channels of a pixel of a RasterImage: red, green, blue and alpha, a byte each. */
export const RGBA_CHANNELS = 4;

/** Where the first channel of the pixel at `x`, `y` of `image` is in its data. */
export function pixelOffset(image: RasterImage, x: number, y: number): number {
  return (y * image.width + x) * RGBA_CHANNELS;
}

export function createRasterImage(width: number, height: number): RasterImage {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error("Image dimensions must be positive integers.");
  return { width, height, data: new Uint8Array(width * height * RGBA_CHANNELS) };
}

/**
 * The whole number below `limit` that `choose` gives, refused with `refusal` when it is none: a
 * host's source may give anything. Every random choice of the cards is checked through it, one
 * call of `choose` each, so that the order of the choices stays as it is made.
 */
export function checkedChoice(choose: UniformChoice, limit: number, refusal: string): number {
  const index = choose(limit);
  if (!Number.isInteger(index) || index < 0 || index >= limit) throw new Error(refusal);
  return index;
}

/**
 * The element of `values` at the index that `choose` gives; refused when the index is not one of
 * them, so that a faulty choice never prints `undefined` on a card. The made-up identity and the
 * copy of a card are picked through it, one choice each, in the order they are made.
 */
export function pickWith<T>(values: readonly T[], choose: UniformChoice): T {
  return values[checkedChoice(choose, values.length, "Invalid random selection for a card.")]!;
}

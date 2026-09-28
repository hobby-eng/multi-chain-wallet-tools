import * as upngModule from '@pdf-lib/upng';
import { zipSync } from 'fflate';
import { encode as encodeQr } from 'uqr';
import {
  cardTemplates,
  configureRenderPlatform,
  createCardSession,
  isCardPageSize,
  parseOrientation,
  parsePageSize,
  renderAssets,
  renderCards,
  renderIndividualCards,
  selectTemplate,
  validateProfile,
  type CardContent,
  type CardOrientation,
  type CardPageSize,
  type CardProfile,
  type CardSession,
  type RasterImage,
  type RenderAsset,
  type RenderPlatform,
} from '../../recovery-mnemocode/source/cards.js';
import { encodeMnemoCode, type MnemoCodeDate, type MnemoCodeMode } from './mnemocode.js';

/**
 * Browser host for the unmodified MnemoCode card renderers.
 *
 * MnemoCode draws the cards. This module only supplies the services the renderers
 * ask their host for, using components this project already contains: the system
 * random source, `uqr` for QR matrices, the PNG coder that `pdf-lib` depends on,
 * and `fflate` for the ZIP archive of individual cards.
 */

type Upng = typeof import('@pdf-lib/upng');

function isUpng(value: unknown): value is Upng {
  return typeof value === 'object' && value !== null && 'decode' in value && 'encode' in value;
}

/** The package publishes a default export as ESM and a namespace as CommonJS. */
function resolveUpng(module: unknown): Upng {
  let candidate = module;
  for (let depth = 0; depth < 3; depth += 1) {
    if (isUpng(candidate)) return candidate;
    if (typeof candidate !== 'object' || candidate === null || !('default' in candidate)) break;
    candidate = candidate.default;
  }
  throw new Error('The PNG coder is unavailable in this build.');
}

const upng = resolveUpng(upngModule);

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function decodePng(bytes: Uint8Array): RasterImage {
  const image = upng.decode(arrayBuffer(bytes));
  const frame = upng.toRGBA8(image)[0];
  if (frame === undefined || frame.byteLength !== image.width * image.height * 4)
    throw new Error('The PNG image could not be decoded.');
  return { width: image.width, height: image.height, data: new Uint8Array(frame) };
}

export function encodePng(image: RasterImage): Uint8Array {
  if (image.data.byteLength !== image.width * image.height * 4) throw new Error('The image data is incomplete.');
  // Zero colours requests lossless output.
  return new Uint8Array(upng.encode([arrayBuffer(image.data)], image.width, image.height, 0));
}

const UINT32_RANGE = 0x1_0000_0000;

/** Uniform choice by rejection sampling; a plain remainder would favour small values. */
export function uniformInteger(
  upperExclusive: number,
  fill: (values: Uint32Array<ArrayBuffer>) => unknown = (values) => globalThis.crypto.getRandomValues(values),
): number {
  if (!Number.isSafeInteger(upperExclusive) || upperExclusive < 1 || upperExclusive > UINT32_RANGE)
    throw new Error('The random range is invalid.');
  const accepted = Math.floor(UINT32_RANGE / upperExclusive) * upperExclusive;
  const values = new Uint32Array(1);
  for (let attempt = 0; attempt < 256; attempt += 1) {
    fill(values);
    const value = values[0];
    if (value !== undefined && value < accepted) return value % upperExclusive;
  }
  throw new Error('The random source did not return a usable value.');
}

export type MnemoCodeCardAssetReader = (path: RenderAsset) => Uint8Array | Promise<Uint8Array>;

export function createMnemoCodeCardPlatform(readAsset: MnemoCodeCardAssetReader): RenderPlatform {
  return {
    readAsset: async (path) => {
      const bytes = await readAsset(path);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0)
        throw new Error(`Card asset ${path} is missing from this build.`);
      return bytes;
    },
    randomInt: (upperExclusive) => uniformInteger(upperExclusive),
    decodePng,
    encodePng: (image) => encodePng(image),
    qrModules: (payload) => {
      const { size, data } = encodeQr(payload, { ecc: 'M', border: 0 });
      return { size, get: (row, column) => data[row]?.[column] === true };
    },
  };
}

export const MNEMOCODE_CARD_ASSETS: readonly RenderAsset[] = renderAssets;

export interface MnemoCodeCardTemplate {
  readonly id: string;
  readonly name: string;
}

/** The list comes from the vendored MnemoCode registry, never from a copy kept here. */
export const MNEMOCODE_CARD_TEMPLATES: readonly MnemoCodeCardTemplate[] = cardTemplates
  .filter((template) => template.kind === 'colors')
  .map(({ id, name }) => ({ id, name }));

/** The first entry is the MnemoCode default. */
export const MNEMOCODE_CARD_PAGE_SIZES = [
  { id: 'a6', label: 'A6 sheet · 148 × 105 mm' },
  { id: 'a4', label: 'A4 sheet · 210 × 297 mm' },
  { id: 'wallet', label: 'Separate wallet cards · 85.6 × 54 mm' },
  { id: 'business', label: 'Separate business cards · 90 × 50 mm' },
] as const satisfies readonly { readonly id: CardPageSize; readonly label: string }[];

/**
 * MnemoCode decides what a page size means: a sheet size holds the whole collection on
 * one page, a card size gives separate numbered cards.
 */
export function mnemoCodeCardOutput(pageSize: string | undefined): MnemoCodeCardOutput {
  const size = pageSize === undefined || pageSize === '' ? undefined : parsePageSize(pageSize);
  return isCardPageSize(size) ? 'individual' : 'collection';
}

export type MnemoCodeCardOutput = 'collection' | 'individual';
export type MnemoCodeCardFormat = 'colors' | 'colors-unicode';
export type MnemoCodeCardProfile = CardProfile;

export interface MnemoCodeCardRequest {
  readonly mnemonic: string;
  readonly mode: MnemoCodeMode;
  readonly dates: readonly MnemoCodeDate[];
  /** Data placed in the optional QR code. The printed references are always colours. */
  readonly format: MnemoCodeCardFormat;
  readonly template: string;
  /** Decides the result: a sheet size gives one sheet, a card size separate cards. Empty means A6. */
  readonly pageSize?: string | undefined;
  /** Empty or undefined selects the default orientation of the template. */
  readonly orientation?: string | undefined;
  /** One QR code with the complete data; only a sheet can carry it. */
  readonly qr: boolean;
  /** The user's own details. Whatever is left out is invented and kept for the session. */
  readonly profile?: MnemoCodeCardProfile | undefined;
  /** The user's own name for the studio on a sheet. */
  readonly studioName?: string | undefined;
}

export interface MnemoCodeCardFile {
  readonly fileName: string;
  readonly mimeType: 'application/pdf' | 'application/zip';
  readonly bytes: Uint8Array;
  readonly cards: number;
  /** What is printed, so that the page can show it. None of it depends on the phrase. */
  readonly printed: { readonly name: string; readonly company: string; readonly studio: string };
}

function pageSize(request: MnemoCodeCardRequest): string | undefined {
  return request.pageSize === undefined || request.pageSize === '' ? undefined : request.pageSize;
}

function cardContent(request: MnemoCodeCardRequest, session: CardSession): CardContent {
  if (request.format !== 'colors' && request.format !== 'colors-unicode')
    throw new Error('Cards use a color representation.');
  const encoded = encodeMnemoCode(request.mnemonic, request.mode, request.format, request.dates);
  const orientation: CardOrientation | undefined = parseOrientation(
    request.orientation === undefined || request.orientation === '' ? undefined : request.orientation,
  );
  const studioName = request.studioName?.trim();
  const { profile, presentation } = session.settingsFor(
    request.template,
    validateProfile(request.profile ?? {}),
    studioName === undefined || studioName === '' ? {} : { studioName },
  );
  return {
    kind: 'colors',
    colors: encoded.colors,
    payload: request.format === 'colors' ? encoded.colors.join(' ') : encoded.payload,
    ...(pageSize(request) === undefined ? {} : { pageSize: parsePageSize(pageSize(request)) }),
    ...(orientation === undefined ? {} : { orientation }),
    profile,
    presentation,
    cardQr: request.qr,
  };
}

export interface MnemoCodeCardExporter {
  readonly render: (request: MnemoCodeCardRequest) => Promise<MnemoCodeCardFile>;
  /**
   * Forgets the invented person, company and studio. The page calls this when the
   * phrase changes, so another phrase gets other details.
   */
  readonly forgetDetails: () => void;
}

export function createMnemoCodeCardExporter(readAsset: MnemoCodeCardAssetReader): MnemoCodeCardExporter {
  const platform = createMnemoCodeCardPlatform(readAsset);
  // One session for every export until the page forgets it: every size shows the same details.
  let session: CardSession | undefined;
  return {
    forgetDetails() {
      session = undefined;
    },
    async render(request) {
      if (!MNEMOCODE_CARD_TEMPLATES.some((template) => template.id === request.template))
        throw new Error('Select a card template.');
      const template = selectTemplate(request.template, 'colors');
      // The session draws its random choices from the platform, so the platform comes first.
      configureRenderPlatform(platform);
      session ??= createCardSession();
      const content = cardContent(request, session);
      const size = parsePageSize(pageSize(request));
      const printed = {
        name: content.profile?.name ?? '',
        company: content.profile?.company ?? '',
        studio: content.presentation?.studioName ?? '',
      };
      if (mnemoCodeCardOutput(pageSize(request)) === 'collection') {
        const bytes = await renderCards([{ template, content }]);
        return { fileName: `cards-${size}.pdf`, mimeType: 'application/pdf', bytes, cards: 1, printed };
      }
      const cards = await renderIndividualCards(template, content);
      const entries: Record<string, Uint8Array> = {};
      for (const card of cards) entries[`${card.name}.pdf`] = card.bytes;
      // A fixed timestamp keeps the export time out of the archive.
      const bytes = zipSync(entries, { level: 0, mtime: new Date(1980, 0, 1, 0, 0, 0) });
      // The archive holds its own copy; the separate documents are recovery material and are cleared.
      for (const card of cards) card.bytes.fill(0);
      return { fileName: `cards-${size}.zip`, mimeType: 'application/zip', bytes, cards: cards.length, printed };
    },
  };
}

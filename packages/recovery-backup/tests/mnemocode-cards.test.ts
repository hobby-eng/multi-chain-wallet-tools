import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import decodeQr from 'qr/decode.js';
import { describe, expect, it } from 'vitest';
import { decodeMnemoCode, encodeMnemoCode, parseMnemoCodeDates } from '../src/mnemocode.js';
import {
  MNEMOCODE_CARD_ASSETS,
  MNEMOCODE_CARD_FILE_FORMATS,
  MNEMOCODE_CARD_PAGE_SIZES,
  MNEMOCODE_CARD_TEMPLATES,
  createMnemoCodeCardExporter,
  createMnemoCodeCardPlatform,
  mnemoCodeCardOutput,
  decodePng,
  encodePng,
  uniformInteger,
  type MnemoCodeCardRequest,
} from '../src/mnemocode-cards.js';

// Public BIP39 test vector; never a real wallet.
const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const assetRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../recovery-mnemocode/source/assets');
const readAsset = (path: string): Uint8Array => new Uint8Array(readFileSync(resolve(assetRoot, path)));
const exporter = createMnemoCodeCardExporter(readAsset);
// Reading printed text needs Poppler; without it that check is skipped, not faked.
const hasPoppler = spawnSync('pdftotext', ['-v']).error === undefined;

const request: MnemoCodeCardRequest = {
  mnemonic: MNEMONIC,
  mode: 'seedshift',
  dates: parseMnemoCodeDates('23-09-2026'),
  format: 'colors',
  template: 'business-it',
  pageSize: 'a6',
  qr: false,
  profile: { name: 'John Smith', company: 'Example Systems', role: 'Systems Engineer' },
};

// RGBA pixels of the bundled PNG artwork as decoded by MnemoCode's own Node.js host.
const PIXELS: Record<string, string> = {
  'images/business-architect-v1.png': '900x500:233b064d724f6ac82333e17157ba9bd7157ff4b498efa7dda8b56360c81d6b49',
  'images/business-contact-v1.png': '900x500:ceeb0b89ff0cb4617cee8dcbbfeb02db4a6224c576491c25164a49d915bdf971',
  'images/business-curves-v1.png': '900x500:eb9efd24cfd964793cff35a894bffb3b9a260211fad88189f793d818d06d2326',
  'images/business-diagonal-v1.png': '900x500:8e3d487eb413133d1eb5b47d520867b5f7d3577c9371e41576b1f23c3a7f9783',
  'images/business-estate-v1.png': '720x400:99d2f22d90c25cc7eef4b74e35dcecafee49adf989f705b3ecf3480532f0549c',
  'images/business-facets-v1.png': '900x500:9f7635552afd756119b1014b411f3ec0d888d8e23175997ed1be60768d033390',
  'images/business-glass-4in1.png': '900x500:e309d59cfea1f869bdb7f03542e9fdf19b5b3b51bac3154cbbd8fcfb0490cf31',
  'images/business-it-v1.png': '900x500:6296b7605019057cf15c7e89ab490ddef3bd575a657f120f63520b612b42a5d7',
};

describe('MnemoCode card export', () => {
  it('offers the template list of the vendored MnemoCode registry', () => {
    expect(MNEMOCODE_CARD_TEMPLATES).toHaveLength(16);
    expect(new Set(MNEMOCODE_CARD_TEMPLATES.map((template) => template.id)).size).toBe(16);
    expect(MNEMOCODE_CARD_PAGE_SIZES.map((size) => size.id)).toEqual(['a6', 'a4', 'business']);
    // Sheet sizes hold the collection; the card size means separate cards.
    expect(['', undefined, 'a6', 'a4', 'business'].map((size) => mnemoCodeCardOutput(size))).toEqual([
      'collection',
      'collection',
      'collection',
      'collection',
      'individual',
    ]);
    expect(MNEMOCODE_CARD_FILE_FORMATS.map((format) => format.id)).toEqual(['pdf', 'png']);
  });

  it('decodes the bundled PNG artwork to the same pixels as MnemoCode and encodes without loss', () => {
    const images = MNEMOCODE_CARD_ASSETS.filter((path) => path.endsWith('.png'));
    expect([...images].sort()).toEqual(Object.keys(PIXELS).sort());
    for (const path of images) {
      const image = decodePng(readAsset(path));
      const digest = createHash('sha256').update(image.data).digest('hex');
      expect(`${image.width}x${image.height}:${digest}`, path).toBe(PIXELS[path]);
    }
    const original = decodePng(readAsset('images/business-glass-4in1.png'));
    const restored = decodePng(encodePng(original));
    expect(restored.width).toBe(original.width);
    expect(restored.height).toBe(original.height);
    expect(Buffer.from(restored.data).equals(Buffer.from(original.data))).toBe(true);
  });

  it('chooses uniformly and rejects values outside the accepted range', () => {
    const queue = [0xffff_ffff, 7];
    expect(uniformInteger(10, (values) => values.set([queue.shift() ?? 0]))).toBe(7);
    expect(queue).toEqual([]);
    expect(() => uniformInteger(0)).toThrow();
    expect(() => uniformInteger(1.5)).toThrow();
    for (let index = 0; index < 50; index += 1) {
      const value = uniformInteger(3);
      expect(value >= 0 && value < 3).toBe(true);
    }
  });

  it('produces a QR matrix that decodes to the exact data', () => {
    const payload = encodeMnemoCode(MNEMONIC, 'direct', 'colors').colors.join(' ');
    const modules = createMnemoCodeCardPlatform(readAsset).qrModules(payload);
    const scale = 4;
    const border = 4;
    const side = (modules.size + border * 2) * scale;
    const data = new Uint8Array(side * side * 4).fill(255);
    for (let row = 0; row < modules.size; row += 1)
      for (let column = 0; column < modules.size; column += 1) {
        if (!modules.get(row, column)) continue;
        for (let y = 0; y < scale; y += 1)
          for (let x = 0; x < scale; x += 1) {
            const offset = (((row + border) * scale + y) * side + (column + border) * scale + x) * 4;
            data.fill(0, offset, offset + 3);
          }
      }
    expect(decodeQr({ width: side, height: side, data })).toBe(payload);
  });

  it('renders a one-page collection and the same number of individual cards as references', async () => {
    const collection = await exporter.render({ ...request, qr: true });
    expect(collection.mimeType).toBe('application/pdf');
    expect(collection.fileName).toBe('cards-a6.pdf');
    expect(Buffer.from(collection.bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
    const document = await PDFDocument.load(collection.bytes, { updateMetadata: false });
    expect(document.getPageCount()).toBe(1);
    // MnemoCode clears descriptive metadata; nothing names the tool or the content.
    expect(document.getTitle() ?? '').toBe('');
    expect(document.getProducer() ?? '').toBe('');
    expect(document.getCreator() ?? '').toBe('');

    const colors = encodeMnemoCode(MNEMONIC, request.mode, 'colors', request.dates).colors;
    const archive = await exporter.render({ ...request, pageSize: 'business' });
    expect(archive.mimeType).toBe('application/zip');
    expect(archive.cards).toBe(colors.length);
    const files = unzipSync(archive.bytes);
    expect(Object.keys(files)).toEqual(
      colors.map((color, index) => `${String(index + 1).padStart(2, '0')}-${color.slice(1).toUpperCase()}.pdf`),
    );
    // The printed references alone restore the phrase.
    const restored = decodeMnemoCode(colors.join(' '), { mode: request.mode, format: 'colors', dates: request.dates });
    expect(restored.mnemonic).toBe(MNEMONIC);
    for (const bytes of Object.values(files)) {
      const card = await PDFDocument.load(bytes);
      expect(card.getPageCount()).toBe(1);
      const { width, height } = card.getPage(0).getSize();
      expect([Math.round((width / 72) * 25.4), Math.round((height / 72) * 25.4)]).toEqual([90, 50]);
    }
  }, 120_000);

  it('renders every template', async () => {
    for (const template of MNEMOCODE_CARD_TEMPLATES) {
      const file = await exporter.render({ ...request, template: template.id, pageSize: '' });
      expect((await PDFDocument.load(file.bytes)).getPageCount(), template.id).toBe(1);
    }
  }, 300_000);

  it('prints the same invented details for every size until they are forgotten', async () => {
    const own = createMnemoCodeCardExporter(readAsset);
    const { profile: _, ...invented } = request;
    const first = (await own.render({ ...invented, pageSize: 'a6' })).printed;
    expect(first.name.length).toBeGreaterThan(3);
    for (const size of ['a4', 'business'] as const)
      expect((await own.render({ ...invented, pageSize: size })).printed, size).toEqual(first);
    // Own details win, and the remaining fields keep their invented values.
    const mixed = await own.render({ ...invented, profile: { name: 'John Smith' }, studioName: 'AURORA STUDIO' });
    expect(mixed.printed).toEqual({ name: 'John Smith', company: first.company, studio: 'AURORA STUDIO' });
    expect((await own.render({ ...invented })).printed).toEqual(first);

    const seen = new Set([JSON.stringify(first)]);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      own.forgetDetails();
      seen.add(JSON.stringify((await own.render({ ...invented })).printed));
    }
    expect(seen.size).toBeGreaterThan(1);
  }, 300_000);

  it.skipIf(!hasPoppler)(
    'prints the color codes and nothing of the phrase',
    async () => {
      // A PDF stores its text compressed and as glyph numbers, so the file is read the way a reader would.
      const printedText = (bytes: Uint8Array): string => {
        const directory = mkdtempSync(join(tmpdir(), 'mnemocode-cards-'));
        try {
          writeFileSync(join(directory, 'cards.pdf'), bytes);
          return execFileSync('pdftotext', ['-layout', join(directory, 'cards.pdf'), '-'], { encoding: 'utf8' });
        } finally {
          rmSync(directory, { recursive: true, force: true });
        }
      };
      const text = printedText((await exporter.render({ ...request, qr: true })).bytes);
      const encoded = encodeMnemoCode(MNEMONIC, request.mode, 'english', request.dates);
      for (const color of encoded.colors) expect(text, color).toContain(color.slice(1));
      // Neither the original words nor the shifted words appear on the sheet.
      for (const word of new Set([...MNEMONIC.split(' '), ...encoded.payload.split(' ')]))
        expect(new RegExp(`\\b${word}\\b`, 'iu').test(text), word).toBe(false);
      expect(text).not.toContain('23-09-2026');
    },
    120_000,
  );

  it('applies the input limit before any work starts', async () => {
    const tooLong = `${MNEMONIC} ${' '.repeat(64 * 1024)}`;
    expect(() => encodeMnemoCode(tooLong, 'direct', 'colors')).toThrow('64 KiB');
    expect(() => parseMnemoCodeDates(`23-09-2026${' '.repeat(64 * 1024)}`)).toThrow('64 KiB');
    await expect(exporter.render({ ...request, mnemonic: tooLong })).rejects.toThrow('64 KiB');
  });

  it('clears the separate documents after they are packed', async () => {
    const archive = await exporter.render({ ...request, pageSize: 'business' });
    const files = Object.values(unzipSync(archive.bytes));
    expect(files.length).toBeGreaterThan(0);
    // The archive keeps the documents; only the working copies were cleared.
    for (const bytes of files) expect(Buffer.from(bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
  }, 120_000);

  it('saves images through the image maker of the page and clears the documents it drew from', async () => {
    // A stand-in for the canvas of a browser: it answers with the first bytes of the PDF it was given.
    const received: Uint8Array[] = [];
    const images = createMnemoCodeCardExporter(readAsset, async (pdf) => {
      received.push(pdf);
      return [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, ...pdf.subarray(0, 5)])];
    });
    const sheet = await images.render({ ...request, fileFormat: 'png' });
    expect([sheet.fileName, sheet.mimeType, sheet.cards]).toEqual(['cards-a6.png', 'image/png', 1]);
    expect(Buffer.from(sheet.bytes).toString('latin1')).toBe('\x89PNG%PDF-');

    const colors = encodeMnemoCode(MNEMONIC, request.mode, 'colors', request.dates).colors;
    const archive = await images.render({ ...request, pageSize: 'business', fileFormat: 'png' });
    expect([archive.fileName, archive.mimeType, archive.cards]).toEqual([
      'cards-business.zip',
      'application/zip',
      colors.length,
    ]);
    expect(Object.keys(unzipSync(archive.bytes))).toEqual(
      colors.map((color, index) => `${String(index + 1).padStart(2, '0')}-${color.slice(1).toUpperCase()}.png`),
    );
    // Every PDF was recovery material and is filled with zeros after its image exists.
    expect(received).toHaveLength(1 + colors.length);
    for (const pdf of received) expect(pdf.every((byte) => byte === 0)).toBe(true);

    await expect(exporter.render({ ...request, fileFormat: 'png' })).rejects.toThrow('Image export is unavailable');
    await expect(exporter.render({ ...request, fileFormat: 'jpg' })).rejects.toThrow('Select PDF or PNG');
    const twoPages = createMnemoCodeCardExporter(readAsset, async () => [new Uint8Array(1), new Uint8Array(1)]);
    await expect(twoPages.render({ ...request, fileFormat: 'png' })).rejects.toThrow('exactly one page');
  }, 120_000);

  it('rejects invalid requests before rendering', async () => {
    await expect(exporter.render({ ...request, template: 'unknown' })).rejects.toThrow('Select a card template.');
    await expect(exporter.render({ ...request, pageSize: 'a3' })).rejects.toThrow();
    await expect(exporter.render({ ...request, pageSize: 'wallet' })).rejects.toThrow('a6, a4 or business');
    await expect(exporter.render({ ...request, orientation: 'diagonal' })).rejects.toThrow();
    await expect(exporter.render({ ...request, mnemonic: 'abandon abandon' })).rejects.toThrow();
    await expect(exporter.render({ ...request, profile: { name: '1234' } })).rejects.toThrow();
    await expect(createMnemoCodeCardExporter(() => new Uint8Array()).render(request)).rejects.toThrow(
      /missing from this build/u,
    );
  });
});

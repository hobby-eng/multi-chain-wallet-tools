import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { readCardPages, type DrawingStep } from '../src/mnemocode-card-drawing.js';
import {
  MNEMOCODE_CARD_TEMPLATES,
  createMnemoCodeCardExporter,
  type MnemoCodeCardRequest,
} from '../src/mnemocode-cards.js';

// Public BIP39 test vector; never a real wallet.
const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const assetRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../recovery-mnemocode/source/assets');
const exporter = createMnemoCodeCardExporter((path) => new Uint8Array(readFileSync(resolve(assetRoot, path))));
const request: MnemoCodeCardRequest = {
  mnemonic: MNEMONIC,
  mode: 'direct',
  dates: [],
  format: 'colors',
  template: 'business-it',
  pageSize: 'business',
  qr: false,
  profile: { name: 'John Smith', company: 'Example Systems', role: 'Systems Engineer' },
};

const steps = (all: readonly DrawingStep[], kind: DrawingStep['do']) => all.filter((step) => step.do === kind);

async function firstCard(template: string): Promise<Uint8Array> {
  const archive = await exporter.render({ ...request, template });
  const [card] = Object.values(unzipSync(archive.bytes));
  if (card === undefined) throw new Error('The archive is empty.');
  return card;
}

describe('reading a card PDF for image export', () => {
  it('reads a separate card: rounded edge, artwork, and one line of letters for every field', async () => {
    const [page, ...others] = await readCardPages(await firstCard('business-it'));
    expect(others).toHaveLength(0);
    if (page === undefined) throw new Error('The card has no page.');
    expect([Math.round((page.width / 72) * 25.4), Math.round((page.height / 72) * 25.4)]).toEqual([90, 50]);

    // The first shape is the rounded edge; it limits the artwork and paints nothing itself.
    const [edge] = steps(page.steps, 'path');
    expect(edge).toMatchObject({ do: 'path', clip: true, fill: false, stroke: false });
    if (edge?.do !== 'path') throw new Error('The card has no edge.');
    expect(edge.segments.filter((segment) => segment.to === 'curve')).toHaveLength(4);

    const [artwork] = steps(page.steps, 'image');
    if (artwork?.do !== 'image') throw new Error('The card has no artwork.');
    expect(artwork.image).toMatchObject({ width: 900, height: 500, format: 'rgb' });
    expect(artwork.image.data).toHaveLength(900 * 500 * 3);

    // Company, name, role, email, website, location and the reference.
    const lines = steps(page.steps, 'text');
    expect(lines).toHaveLength(7);
    for (const line of lines) {
      if (line.do !== 'text') continue;
      expect(line.segments.length).toBeGreaterThan(10);
      // Letters stand on the line from its start, within the width of the card.
      const xs = line.segments.flatMap((segment) => ('x' in segment ? [segment.x] : []));
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1);
      expect(line.matrix[4] + Math.max(...xs)).toBeLessThan(page.width);
    }
    // Every `save` has its `restore`.
    expect(steps(page.steps, 'save')).toHaveLength(steps(page.steps, 'restore').length);
  }, 120_000);

  it('reads every template as a sheet with a QR code and as a separate card', async () => {
    for (const template of MNEMOCODE_CARD_TEMPLATES) {
      const sheet = await exporter.render({ ...request, template: template.id, pageSize: 'a6', qr: true });
      for (const pdf of [sheet.bytes, await firstCard(template.id)]) {
        const pages = await readCardPages(pdf);
        expect(pages, template.id).toHaveLength(1);
        expect(steps(pages[0]?.steps ?? [], 'image').length, template.id).toBeGreaterThan(0);
        expect(steps(pages[0]?.steps ?? [], 'text').length, template.id).toBeGreaterThan(0);
      }
    }
  }, 600_000);

  it('stops at a drawing command that it does not know', async () => {
    const shapes = await PDFDocument.create();
    shapes.addPage([100, 100]).drawRectangle({ x: 10, y: 10, width: 20, height: 20, color: rgb(1, 0, 0) });
    const [page] = await readCardPages(await shapes.save());
    expect(page?.steps.some((step) => step.do === 'path' && step.fill)).toBe(true);

    // A standard font writes its text in another way than the card renderers do.
    const letters = await PDFDocument.create();
    letters.addPage([100, 100]).drawText('text', { font: await letters.embedFont(StandardFonts.Helvetica) });
    await expect(readCardPages(await letters.save())).rejects.toThrow('Image export cannot draw this card');
  });
});

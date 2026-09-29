import fontkit from '@pdf-lib/fontkit';
import { unzlibSync } from 'fflate';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

/**
 * Reads a card PDF into a list of drawing steps.
 *
 * MnemoCode draws its cards as PDF pages. A browser has no program that turns a PDF into
 * an image, so image export repeats the drawing on a canvas. The card renderers use a
 * small set of PDF commands, listed in `readSteps`. Any other command stops the export:
 * an image that silently lacks a part of the card would be worse than no image.
 */

/** The six numbers of a PDF transformation: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

export type PathSegment =
  | { readonly to: 'move' | 'line'; readonly x: number; readonly y: number }
  | {
      readonly to: 'curve';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly x: number;
      readonly y: number;
    }
  // Only the outlines of letters use this curve with one control point.
  | { readonly to: 'quadratic'; readonly x1: number; readonly y1: number; readonly x: number; readonly y: number }
  | { readonly to: 'close' };

export interface CardImage {
  readonly width: number;
  readonly height: number;
  /** `rgb` is three bytes for every pixel, row by row. `jpeg` is a complete JPEG file. */
  readonly format: 'rgb' | 'jpeg';
  readonly data: Uint8Array;
  /** One byte of opacity for every pixel; absent when the image is opaque. */
  readonly alpha?: Uint8Array;
}

export type DrawingStep =
  | { readonly do: 'save' | 'restore' }
  | { readonly do: 'transform'; readonly matrix: Matrix }
  | { readonly do: 'fillColor' | 'strokeColor'; readonly red: number; readonly green: number; readonly blue: number }
  | { readonly do: 'opacity'; readonly fill?: number; readonly stroke?: number }
  | { readonly do: 'lineWidth'; readonly width: number }
  | { readonly do: 'dash'; readonly pattern: readonly number[]; readonly phase: number }
  | {
      readonly do: 'path';
      readonly segments: readonly PathSegment[];
      readonly fill: boolean;
      readonly stroke: boolean;
      /** The path also limits everything drawn until the matching `restore`. */
      readonly clip: boolean;
    }
  /** Outlines of the letters of one line, already placed one after another. */
  | { readonly do: 'text'; readonly matrix: Matrix; readonly segments: readonly PathSegment[] }
  /** Drawn into the square from (0, 0) to (1, 1) of the current transformation. */
  | { readonly do: 'image'; readonly image: CardImage };

export interface CardPageDrawing {
  /** Page size in PDF points, 72 to an inch. */
  readonly width: number;
  readonly height: number;
  readonly steps: readonly DrawingStep[];
}

function unsupported(what: string): Error {
  return new Error(`Image export cannot draw this card: ${what}. Save the cards as PDF.`);
}

function numbers(operands: readonly string[], count: number, command: string): number[] {
  if (operands.length !== count) throw unsupported(`the command ${command} has ${operands.length} values`);
  return operands.map((operand) => {
    const value = Number(operand);
    if (!Number.isFinite(value)) throw unsupported(`the command ${command} has the value ${operand}`);
    return value;
  });
}

function matrix(operands: readonly string[], command: string): Matrix {
  const [a, b, c, d, e, f] = numbers(operands, 6, command);
  return [a ?? 0, b ?? 0, c ?? 0, d ?? 0, e ?? 0, f ?? 0];
}

interface OutlineCommand {
  readonly command: string;
  readonly args: readonly number[];
}

/** fontkit keeps the commands of an outline in a list that its type description leaves out. */
interface OutlinePath {
  readonly commands: readonly OutlineCommand[];
}

interface LetterFont {
  readonly unitsPerEm: number;
  readonly glyph: (id: number) => { readonly advance: number; readonly outline: readonly PathSegment[] };
}

function readFont(font: PDFDict): LetterFont {
  // pdf-lib embeds the letters that a document uses as a TrueType program of its own.
  const program = font
    .lookupMaybe(PDFName.of('DescendantFonts'), PDFArray)
    ?.lookupMaybe(0, PDFDict)
    ?.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)
    ?.lookup(PDFName.of('FontFile2'));
  if (!(program instanceof PDFRawStream)) throw unsupported('its font has no TrueType program');
  const parsed = fontkit.create(decodePDFRawStream(program).decode());
  const glyphs = new Map<number, ReturnType<LetterFont['glyph']>>();
  return {
    unitsPerEm: parsed.unitsPerEm,
    glyph(id) {
      let glyph = glyphs.get(id);
      if (glyph === undefined) {
        const source = parsed.getGlyph(id);
        const path = source.path as unknown as OutlinePath;
        glyph = { advance: source.advanceWidth, outline: path.commands.map(outlineSegment) };
        glyphs.set(id, glyph);
      }
      return glyph;
    },
  };
}

function outlineSegment(command: OutlineCommand): PathSegment {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = command.args;
  switch (command.command) {
    case 'moveTo':
      return { to: 'move', x: a, y: b };
    case 'lineTo':
      return { to: 'line', x: a, y: b };
    case 'quadraticCurveTo':
      return { to: 'quadratic', x1: a, y1: b, x: c, y: d };
    case 'bezierCurveTo':
      return { to: 'curve', x1: a, y1: b, x2: c, y2: d, x: e, y: f };
    case 'closePath':
      return { to: 'close' };
    default:
      throw unsupported(`a letter uses the outline command ${command.command}`);
  }
}

/** Moves and scales the outline of one letter to its place in the line. */
function placed(segment: PathSegment, scale: number, offset: number): PathSegment {
  const x = (value: number) => value * scale + offset;
  const y = (value: number) => value * scale;
  switch (segment.to) {
    case 'move':
    case 'line':
      return { to: segment.to, x: x(segment.x), y: y(segment.y) };
    case 'quadratic':
      return { to: 'quadratic', x1: x(segment.x1), y1: y(segment.y1), x: x(segment.x), y: y(segment.y) };
    case 'curve':
      return {
        to: 'curve',
        x1: x(segment.x1),
        y1: y(segment.y1),
        x2: x(segment.x2),
        y2: y(segment.y2),
        x: x(segment.x),
        y: y(segment.y),
      };
    case 'close':
      return segment;
  }
}

// pdf-lib writes text as glyph numbers of four hexadecimal digits each.
const GLYPH_DIGITS = 4;

function textSegments(text: string, font: LetterFont, size: number): PathSegment[] {
  const digits = /^<([0-9A-Fa-f]*)>$/u.exec(text)?.[1];
  if (digits === undefined || digits.length % GLYPH_DIGITS !== 0)
    throw unsupported('its text is not written as glyph numbers');
  const scale = size / font.unitsPerEm;
  const segments: PathSegment[] = [];
  let offset = 0;
  for (let index = 0; index < digits.length; index += GLYPH_DIGITS) {
    const glyph = font.glyph(Number.parseInt(digits.slice(index, index + GLYPH_DIGITS), 16));
    for (const segment of glyph.outline) segments.push(placed(segment, scale, offset));
    offset += glyph.advance * scale;
  }
  return segments;
}

function integer(dictionary: PDFDict, key: string): number {
  const value = dictionary.lookup(PDFName.of(key), PDFNumber).asNumber();
  if (!Number.isInteger(value) || value < 1) throw unsupported(`an image has the ${key} ${value}`);
  return value;
}

function readImage(document: PDFDocument, stream: PDFRawStream): CardImage {
  const name = (key: string) => stream.dict.get(PDFName.of(key))?.toString();
  if (name('Subtype') !== '/Image') throw unsupported('it contains an object that is not an image');
  if (name('ColorSpace') !== '/DeviceRGB' || name('BitsPerComponent') !== '8')
    throw unsupported('an image is not stored as 8-bit RGB');
  const width = integer(stream.dict, 'Width');
  const height = integer(stream.dict, 'Height');
  if (name('Filter') === '/DCTDecode') return { width, height, format: 'jpeg', data: stream.contents };
  if (name('Filter') !== '/FlateDecode') throw unsupported(`an image uses the filter ${name('Filter')}`);
  const data = unzlibSync(stream.contents);
  if (data.length !== width * height * 3) throw unsupported('an image has an unexpected amount of data');
  const mask = stream.dict.get(PDFName.of('SMask'));
  if (mask === undefined) return { width, height, format: 'rgb', data };
  const maskStream = document.context.lookup(mask);
  if (!(maskStream instanceof PDFRawStream) || maskStream.dict.get(PDFName.of('Filter'))?.toString() !== '/FlateDecode')
    throw unsupported('the transparency of an image is stored in an unknown way');
  const alpha = unzlibSync(maskStream.contents);
  if (alpha.length !== width * height) throw unsupported('the transparency of an image has an unexpected size');
  return { width, height, format: 'rgb', data, alpha };
}

function readOpacity(state: PDFDict): { fill?: number; stroke?: number } {
  const opacity: { fill?: number; stroke?: number } = {};
  for (const [key, value] of state.entries()) {
    const name = key.toString();
    if (name === '/Type') continue;
    if (!(value instanceof PDFNumber)) throw unsupported(`the graphics setting ${name} is not a number`);
    if (name === '/ca') opacity.fill = value.asNumber();
    else if (name === '/CA') opacity.stroke = value.asNumber();
    else throw unsupported(`it uses the graphics setting ${name}`);
  }
  return opacity;
}

/** Splits one line of a content stream into its values and the command at its end. */
function commandLine(line: string): { operands: string[]; command: string } | undefined {
  const parts = line
    .trim()
    .split(/\s+/u)
    .filter((part) => part !== '');
  const command = parts.pop();
  return command === undefined ? undefined : { operands: parts, command };
}

function pageContent(document: PDFDocument, contents: unknown): string {
  const references = contents instanceof PDFArray ? contents.asArray() : [contents];
  return references
    .map((reference) => {
      const stream = document.context.lookup(reference as never);
      if (!(stream instanceof PDFRawStream)) throw unsupported('its page content cannot be read');
      // The streams of pdf-lib contain commands, numbers and names: one byte is one character.
      return new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode());
    })
    .join('\n');
}

function readSteps(document: PDFDocument, content: string, resources: PDFDict): DrawingStep[] {
  const dictionary = (key: string): PDFDict | undefined => resources.lookupMaybe(PDFName.of(key), PDFDict);
  const resource = (kind: string, name: string) => {
    const reference = dictionary(kind)?.get(PDFName.of(name.slice(1)));
    if (!name.startsWith('/') || reference === undefined) throw unsupported(`it names the unknown resource ${name}`);
    return reference;
  };
  // One font and one image object are used many times; each is read once.
  const fonts = new Map<string, LetterFont>();
  const images = new Map<string, CardImage>();

  const steps: DrawingStep[] = [];
  let path: PathSegment[] = [];
  let clip = false;
  let font: { letters: LetterFont; size: number } | undefined;
  let textMatrix: Matrix = [1, 0, 0, 1, 0, 0];
  const paint = (fill: boolean, stroke: boolean): void => {
    steps.push({ do: 'path', segments: path, fill, stroke, clip });
    path = [];
    clip = false;
  };

  for (const line of content.split('\n')) {
    const parsed = commandLine(line);
    if (parsed === undefined) continue;
    const { operands, command } = parsed;
    switch (command) {
      case 'q':
        steps.push({ do: 'save' });
        break;
      case 'Q':
        steps.push({ do: 'restore' });
        break;
      case 'cm':
        steps.push({ do: 'transform', matrix: matrix(operands, command) });
        break;
      case 'm':
      case 'l': {
        const [x = 0, y = 0] = numbers(operands, 2, command);
        path.push({ to: command === 'm' ? 'move' : 'line', x, y });
        break;
      }
      case 'c': {
        const [x1 = 0, y1 = 0, x2 = 0, y2 = 0, x = 0, y = 0] = numbers(operands, 6, command);
        path.push({ to: 'curve', x1, y1, x2, y2, x, y });
        break;
      }
      case 're': {
        const [x = 0, y = 0, width = 0, height = 0] = numbers(operands, 4, command);
        path.push(
          { to: 'move', x, y },
          { to: 'line', x: x + width, y },
          { to: 'line', x: x + width, y: y + height },
          { to: 'line', x, y: y + height },
          { to: 'close' },
        );
        break;
      }
      case 'h':
        path.push({ to: 'close' });
        break;
      case 'W':
        clip = true;
        break;
      case 'n':
        paint(false, false);
        break;
      case 'f':
        paint(true, false);
        break;
      case 'S':
        paint(false, true);
        break;
      case 'B':
        paint(true, true);
        break;
      case 'rg':
      case 'RG': {
        const [red = 0, green = 0, blue = 0] = numbers(operands, 3, command);
        steps.push({ do: command === 'rg' ? 'fillColor' : 'strokeColor', red, green, blue });
        break;
      }
      case 'w': {
        const [width = 0] = numbers(operands, 1, command);
        steps.push({ do: 'lineWidth', width });
        break;
      }
      case 'd': {
        // Written as `[3 2] 0 d`: the lengths of dashes and gaps, then the starting point.
        const values = operands.join(' ');
        const match = /^\[\s*([-\d.\s]*)\]\s+([-\d.]+)$/u.exec(values);
        if (match === null) throw unsupported(`the dash pattern ${values} cannot be read`);
        const pattern = (match[1] ?? '').trim();
        steps.push({
          do: 'dash',
          pattern: pattern === '' ? [] : numbers(pattern.split(/\s+/u), pattern.split(/\s+/u).length, command),
          phase: Number(match[2]),
        });
        break;
      }
      case 'gs': {
        const state = document.context.lookup(resource('ExtGState', operands[0] ?? ''), PDFDict);
        steps.push({ do: 'opacity', ...readOpacity(state) });
        break;
      }
      case 'Do': {
        const reference = resource('XObject', operands[0] ?? '');
        const key = reference.toString();
        let image = images.get(key);
        if (image === undefined) {
          const stream = document.context.lookup(reference);
          if (!(stream instanceof PDFRawStream)) throw unsupported('an image cannot be read');
          image = readImage(document, stream);
          images.set(key, image);
        }
        steps.push({ do: 'image', image });
        break;
      }
      case 'BT':
        textMatrix = [1, 0, 0, 1, 0, 0];
        break;
      case 'Tf': {
        const reference = resource('Font', operands[0] ?? '');
        const key = reference.toString();
        let letters = fonts.get(key);
        if (letters === undefined) {
          letters = readFont(document.context.lookup(reference, PDFDict));
          fonts.set(key, letters);
        }
        const [size = 0] = numbers(operands.slice(1), 1, command);
        font = { letters, size };
        break;
      }
      case 'Tm':
        textMatrix = matrix(operands, command);
        break;
      case 'Tj':
        if (font === undefined) throw unsupported('text is drawn before a font is chosen');
        steps.push({
          do: 'text',
          matrix: textMatrix,
          segments: textSegments(operands.join(''), font.letters, font.size),
        });
        break;
      // The line height and the move to the next line matter only for a second line,
      // and the renderers start every line with its own position.
      case 'TL':
      case 'T*':
      case 'ET':
        break;
      default:
        throw unsupported(`it uses the PDF command ${command}`);
    }
  }
  if (path.length > 0) throw unsupported('a shape is left unfinished');
  return steps;
}

export async function readCardPages(pdf: Uint8Array): Promise<CardPageDrawing[]> {
  const document = await PDFDocument.load(pdf);
  return document.getPages().map((page) => {
    const box = page.getMediaBox();
    if (box.x !== 0 || box.y !== 0 || page.getRotation().angle !== 0) throw unsupported('its page is moved or turned');
    const resources = page.node.Resources();
    if (resources === undefined) throw unsupported('its page has no resources');
    const content = pageContent(document, page.node.Contents());
    return { width: box.width, height: box.height, steps: readSteps(document, content, resources) };
  });
}

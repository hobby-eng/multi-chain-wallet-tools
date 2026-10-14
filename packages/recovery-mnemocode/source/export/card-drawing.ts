// Reads a card PDF back into drawing steps, so that a host without a program that turns a PDF
// into an image, such as a browser page, can paint the cards on its own canvas and save them as
// PNG or JPEG. The command line rasterizes with Poppler instead (image-export.ts).
//
// The card renderers draw every page with pdf-lib, which writes a small subset of PDF: the
// commands of OPERATIONS (ACCEPTED_OPERATORS), the graphics settings of GRAPHICS_SETTINGS, the
// blend modes of BLEND_MODES, 8-bit RGB images and letters of an embedded TrueType font. This
// module is the one place that lists that subset, beside the renderers that write it, and
// test/card-drawing.test.ts reads the cards of every renderer through it. Anything else is
// refused: an image that silently lacks a part of the card would be worse than no image.
//
// Needs from the host: the PDF bytes, such as those a renderer returned. Host-neutral: it imports
// only pdf-lib and fontkit.
// Does not: paint (the host turns the steps into pixels), keep a PDF or its steps after it
// returns, or read PDFs that other programs wrote, which may use any other command.

import fontkit from "@pdf-lib/fontkit";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFOperatorNames as Op,
  PDFRawStream,
  decodePDFRawStream,
  type PDFPage,
  type PDFRef,
} from "pdf-lib";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.card-drawing", {
  "save-cards-as-pdf": (value0: string, value1: string) =>
    `${value0}: ${value1}. Save the cards as PDF.`,
});

/** The six numbers of a PDF transformation: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = readonly [a: number, b: number, c: number, d: number, e: number, f: number];
const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0];

/**
 * One step of a path: move or line to a point, a cubic curve with its two control points, or close.
 */
export type PathSegment =
  | { readonly to: "move" | "line"; readonly x: number; readonly y: number }
  | {
      readonly to: "curve";
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly x: number;
      readonly y: number;
    }
  // Only the outlines of letters use this curve with one control point.
  | {
      readonly to: "quadratic";
      readonly x1: number;
      readonly y1: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly to: "close" };

/**
 * An image that a drawing places: its size in pixels and its pixels as RGB bytes or a JPEG file.
 */
export interface CardImage {
  readonly width: number;
  readonly height: number;
  /** `rgb` is three bytes for every pixel, row by row. `jpeg` is a complete JPEG file. */
  readonly format: "rgb" | "jpeg";
  readonly data: Uint8Array;
  /** One byte of opacity for every pixel; absent when the image is opaque. */
  readonly alpha?: Uint8Array;
}

/** PDF blend modes the cards use: plain painting, and the hue and colourfulness of a tint. */
export type BlendMode = "normal" | "color";

/** Which inside of a path counts for a clip: `W` uses the nonzero rule, `W*` the even-odd rule. */
export type ClipRule = "nonzero" | "evenodd";

/** The settings of one graphics state (`gs`) that the cards use. */
export interface GraphicsSettings {
  /** The opacity of fills and of text. */
  readonly fill?: number;
  /** The opacity of strokes. */
  readonly stroke?: number;
  readonly blend?: BlendMode;
}

/**
 * One step of the drawing of a card page: save or restore the state, transform, fill or stroke a
 * path, clip, or draw an image.
 */
export type DrawingStep =
  | { readonly do: "save" | "restore" }
  | { readonly do: "transform"; readonly matrix: Matrix }
  | {
      readonly do: "fillColor" | "strokeColor";
      readonly red: number;
      readonly green: number;
      readonly blue: number;
    }
  | ({ readonly do: "graphicsState" } & GraphicsSettings)
  | { readonly do: "lineWidth"; readonly width: number }
  | { readonly do: "dash"; readonly pattern: readonly number[]; readonly phase: number }
  | {
      readonly do: "path";
      readonly segments: readonly PathSegment[];
      readonly fill: boolean;
      readonly stroke: boolean;
      /** The path also limits everything drawn until the matching `restore`. */
      readonly clip: boolean;
      readonly clipRule: ClipRule;
    }
  /** Outlines of the letters of one piece of text, already placed one after another. */
  | { readonly do: "text"; readonly matrix: Matrix; readonly segments: readonly PathSegment[] }
  /** Drawn into the square from (0, 0) to (1, 1) of the current transformation. */
  | { readonly do: "image"; readonly image: CardImage };

/**
 * The drawing of one card page, its size in PDF points and its steps, which a host replays on its
 * own canvas.
 */
export interface CardPageDrawing {
  /** Page size in PDF points, 72 to an inch. */
  readonly width: number;
  readonly height: number;
  readonly steps: readonly DrawingStep[];
}

/** What every refusal says first, so that a host can tell it from other failures. */
export const CARD_DRAWING_REFUSAL = "Image export cannot draw this card";

function unsupported(what: string): Error {
  return ERRORS.create("save-cards-as-pdf", [`${CARD_DRAWING_REFUSAL}`, `${what}`]);
}

// How many values each command takes (ISO 32000-1, 8.4.4 and 8.5.2): a point, a rectangle, a
// colour of DeviceRGB, and a transformation or a cubic Bézier curve.
const POINT_VALUES = 2;
const RECTANGLE_VALUES = 4;
const RGB_VALUES = 3;
const MATRIX_VALUES = 6;
const CURVE_VALUES = 6;

function numbers(operands: readonly string[], count: number, command: string): number[] {
  if (operands.length !== count)
    throw unsupported(`the command ${command} has ${operands.length} values`);
  return operands.map((operand) => {
    const value = Number(operand);
    if (!Number.isFinite(value))
      throw unsupported(`the command ${command} has the value ${operand}`);
    return value;
  });
}

function matrix(operands: readonly string[], command: string): Matrix {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = numbers(operands, MATRIX_VALUES, command);
  return [a, b, c, d, e, f];
}

/** `base` moved by (x, y) in its own space: [1 0 0 1 x y] × base (ISO 32000-1, 9.4.2). */
function translated(base: Matrix, x: number, y: number): Matrix {
  const [a, b, c, d, e, f] = base;
  return [a, b, c, d, e + x * a + y * c, f + x * b + y * d];
}

/** The bytes of a stream, decoded by pdf-lib; a stream with decoding parameters is refused. */
function decoded(stream: PDFRawStream, what: string): Uint8Array {
  // pdf-lib's Flate decoder ignores a predictor, which would give wrong bytes silently. pdf-lib
  // writes no decoding parameters in the streams of the cards.
  if (stream.dict.has(PDFName.of("DecodeParms")))
    throw unsupported(`${what} is stored with decoding parameters`);
  return decodePDFRawStream(stream).decode();
}

interface OutlineCommand {
  readonly command: string;
  readonly args: readonly number[];
}

/** fontkit keeps the commands of an outline in a list that its type description leaves out. */
interface OutlinePath {
  readonly commands: readonly OutlineCommand[];
}

interface Letter {
  /** In the units of the font's em square. */
  readonly advance: number;
  readonly outline: readonly PathSegment[];
}

function outlineSegment(command: OutlineCommand): PathSegment {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = command.args;
  switch (command.command) {
    case "moveTo":
      return { to: "move", x: a, y: b };
    case "lineTo":
      return { to: "line", x: a, y: b };
    case "quadraticCurveTo":
      return { to: "quadratic", x1: a, y1: b, x: c, y: d };
    case "bezierCurveTo":
      return { to: "curve", x1: a, y1: b, x2: c, y2: d, x: e, y: f };
    case "closePath":
      return { to: "close" };
    default:
      throw unsupported(`a letter uses the outline command ${command.command}`);
  }
}

/** Moves and scales the outline of one letter to its place in the text. */
function placed(segment: PathSegment, scale: number, offset: number): PathSegment {
  const x = (value: number) => value * scale + offset;
  const y = (value: number) => value * scale;
  switch (segment.to) {
    case "move":
    case "line":
      return { to: segment.to, x: x(segment.x), y: y(segment.y) };
    case "quadratic":
      return {
        to: "quadratic",
        x1: x(segment.x1),
        y1: y(segment.y1),
        x: x(segment.x),
        y: y(segment.y),
      };
    case "curve":
      return {
        to: "curve",
        x1: x(segment.x1),
        y1: y(segment.y1),
        x2: x(segment.x2),
        y2: y(segment.y2),
        x: x(segment.x),
        y: y(segment.y),
      };
    case "close":
      return segment;
  }
}

// pdf-lib writes the text of an embedded font as a hexadecimal string of glyph numbers, each of
// two bytes (Identity-H encoding): four hexadecimal digits.
const GLYPH_DIGITS = 4;
const HEXADECIMAL = 16;
const GLYPH_TEXT = /^<([0-9A-Fa-f]*)>$/u;

/** The letters of one embedded font, each outline read once. */
class LetterFont {
  readonly #program: ReturnType<typeof fontkit.create>;
  readonly #letters = new Map<number, Letter>();

  constructor(font: PDFDict) {
    // pdf-lib embeds the letters that a document uses as a TrueType program of its own.
    const program = font
      .lookupMaybe(PDFName.of("DescendantFonts"), PDFArray)
      ?.lookupMaybe(0, PDFDict)
      ?.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict)
      ?.lookup(PDFName.of("FontFile2"));
    if (!(program instanceof PDFRawStream)) throw unsupported("its font has no TrueType program");
    this.#program = fontkit.create(decoded(program, "its font"));
  }

  /**
   * The outlines of `text` at `size`, one letter after another from 0, and how far the text
   * moves on: the sum of the letters' advances, with no spacing between letters or words, since
   * the commands that set it (Tc, Tw, Tz) are refused (ISO 32000-1, 9.4.4).
   */
  text(text: string, size: number): { segments: PathSegment[]; advance: number } {
    const digits = GLYPH_TEXT.exec(text)?.[1];
    if (digits === undefined || digits.length % GLYPH_DIGITS !== 0)
      throw unsupported("its text is not written as glyph numbers");
    const scale = size / this.#program.unitsPerEm;
    const segments: PathSegment[] = [];
    let offset = 0;
    for (let index = 0; index < digits.length; index += GLYPH_DIGITS) {
      const glyph = Number.parseInt(digits.slice(index, index + GLYPH_DIGITS), HEXADECIMAL);
      const letter = this.#letter(glyph);
      for (const segment of letter.outline) segments.push(placed(segment, scale, offset));
      offset += letter.advance * scale;
    }
    return { segments, advance: offset };
  }

  #letter(glyph: number): Letter {
    let letter = this.#letters.get(glyph);
    if (letter === undefined) {
      const source = this.#program.getGlyph(glyph);
      const path = source.path as unknown as OutlinePath;
      letter = { advance: source.advanceWidth, outline: path.commands.map(outlineSegment) };
      this.#letters.set(glyph, letter);
    }
    return letter;
  }
}

// The images of the cards, as pdf-lib embeds a PNG or a JPEG: 8-bit DeviceRGB, compressed with
// Flate, with an 8-bit Flate mask of one opacity byte per pixel when the PNG has an alpha channel;
// a JPEG is kept as it is (DCT), and the host decodes it.
const IMAGE_COLOR_SPACE = "/DeviceRGB";
const IMAGE_BITS_PER_COMPONENT = "8";
const RGB_BYTES_PER_PIXEL = 3;
const ALPHA_BYTES_PER_PIXEL = 1;
const FLATE = "/FlateDecode";
const DCT = "/DCTDecode";

function dimension(dictionary: PDFDict, key: string): number {
  const value = dictionary.lookup(PDFName.of(key), PDFNumber).asNumber();
  if (!Number.isInteger(value) || value < 1) throw unsupported(`an image has the ${key} ${value}`);
  return value;
}

function readImage(document: PDFDocument, stream: PDFRawStream): CardImage {
  const name = (key: string) => stream.dict.get(PDFName.of(key))?.toString();
  if (name("Subtype") !== "/Image") throw unsupported("it contains an object that is not an image");
  if (
    name("ColorSpace") !== IMAGE_COLOR_SPACE ||
    name("BitsPerComponent") !== IMAGE_BITS_PER_COMPONENT
  )
    throw unsupported("an image is not stored as 8-bit RGB");
  const width = dimension(stream.dict, "Width");
  const height = dimension(stream.dict, "Height");
  // pdf-lib cannot decode DCT, and the host's canvas reads the JPEG file itself.
  if (name("Filter") === DCT) return { width, height, format: "jpeg", data: stream.contents };
  if (name("Filter") !== FLATE) throw unsupported(`an image uses the filter ${name("Filter")}`);
  const data = decoded(stream, "an image");
  if (data.length !== width * height * RGB_BYTES_PER_PIXEL)
    throw unsupported("an image has an unexpected amount of data");
  const mask = stream.dict.get(PDFName.of("SMask"));
  if (mask === undefined) return { width, height, format: "rgb", data };
  const maskStream = document.context.lookup(mask);
  if (
    !(maskStream instanceof PDFRawStream) ||
    maskStream.dict.get(PDFName.of("Filter"))?.toString() !== FLATE
  )
    throw unsupported("the transparency of an image is stored in an unknown way");
  const alpha = decoded(maskStream, "the transparency of an image");
  if (alpha.length !== width * height * ALPHA_BYTES_PER_PIXEL)
    throw unsupported("the transparency of an image has an unexpected size");
  return { width, height, format: "rgb", data, alpha };
}

/**
 * The blend modes of a graphics state (ISO 32000-1, table 136) that the cards write: Normal, the
 * default, and Color, the tint of the material cards (material-cards.ts).
 */
const BLEND_MODES: ReadonlyMap<string, BlendMode> = new Map([
  ["/Normal", "normal"],
  ["/Color", "color"],
]);

type MutableSettings = { -readonly [Key in keyof GraphicsSettings]: GraphicsSettings[Key] };
type ReadSetting = (value: unknown, settings: MutableSettings) => void;

/**
 * The entries of a graphics state (ISO 32000-1, table 58) that the cards write, each with how it is
 * read: the opacities that pdf-lib writes for `opacity` and `borderOpacity`, and the blend mode.
 */
const GRAPHICS_SETTINGS: ReadonlyMap<string, ReadSetting> = new Map<string, ReadSetting>([
  // The type of the dictionary, ExtGState, draws nothing.
  ["/Type", () => {}],
  ["/ca", (value, settings) => (settings.fill = opacity(value, "/ca"))],
  ["/CA", (value, settings) => (settings.stroke = opacity(value, "/CA"))],
  [
    "/BM",
    (value, settings) => {
      // A blend mode may also be a list of choices; the cards write exactly one name.
      const blend = value instanceof PDFName ? BLEND_MODES.get(value.toString()) : undefined;
      if (blend === undefined) throw unsupported(`it uses the blend mode ${String(value)}`);
      settings.blend = blend;
    },
  ],
]);

function opacity(value: unknown, key: string): number {
  if (!(value instanceof PDFNumber))
    throw unsupported(`the graphics setting ${key} is not a number`);
  return value.asNumber();
}

function readGraphicsState(state: PDFDict): GraphicsSettings {
  const settings: MutableSettings = {};
  for (const [key, value] of state.entries()) {
    const read = GRAPHICS_SETTINGS.get(key.toString());
    if (read === undefined) throw unsupported(`it uses the graphics setting ${key.toString()}`);
    read(value, settings);
  }
  return settings;
}

/** The fonts, images and graphics states of one document, each read once for all its pages. */
class DocumentObjects {
  readonly #document: PDFDocument;
  readonly #fonts = new Map<string, LetterFont>();
  readonly #images = new Map<string, CardImage>();

  constructor(document: PDFDocument) {
    this.#document = document;
  }

  font(reference: PDFRef | PDFDict): LetterFont {
    const key = reference.toString();
    let font = this.#fonts.get(key);
    if (font === undefined) {
      font = new LetterFont(this.#document.context.lookup(reference, PDFDict));
      this.#fonts.set(key, font);
    }
    return font;
  }

  image(reference: PDFRef | PDFDict): CardImage {
    const key = reference.toString();
    let image = this.#images.get(key);
    if (image === undefined) {
      const stream = this.#document.context.lookup(reference);
      if (!(stream instanceof PDFRawStream)) throw unsupported("an image cannot be read");
      image = readImage(this.#document, stream);
      this.#images.set(key, image);
    }
    return image;
  }

  graphicsState(reference: PDFRef | PDFDict): GraphicsSettings {
    return readGraphicsState(this.#document.context.lookup(reference, PDFDict));
  }

  /** The commands of a page's content, from one stream or several (ISO 32000-1, 7.7.3.3). */
  content(contents: unknown): string {
    const references = contents instanceof PDFArray ? contents.asArray() : [contents];
    return references
      .map((reference) => {
        const stream = this.#document.context.lookup(reference as PDFRef);
        if (!(stream instanceof PDFRawStream)) throw unsupported("its page content cannot be read");
        // The streams of pdf-lib contain commands, numbers and names: one byte is one character.
        return new TextDecoder("latin1").decode(decoded(stream, "its page content"));
      })
      .join("\n");
  }
}

/** The resources that one page names, found through the objects of its document. */
class PageResources {
  readonly #objects: DocumentObjects;
  readonly #resources: PDFDict;

  constructor(objects: DocumentObjects, resources: PDFDict) {
    this.#objects = objects;
    this.#resources = resources;
  }

  font(name: string | undefined): LetterFont {
    return this.#objects.font(this.#named("Font", name));
  }

  image(name: string | undefined): CardImage {
    return this.#objects.image(this.#named("XObject", name));
  }

  graphicsState(name: string | undefined): GraphicsSettings {
    return this.#objects.graphicsState(this.#named("ExtGState", name));
  }

  #named(kind: string, name = ""): PDFRef | PDFDict {
    const reference = name.startsWith("/")
      ? this.#resources.lookupMaybe(PDFName.of(kind), PDFDict)?.get(PDFName.of(name.slice(1)))
      : undefined;
    if (reference === undefined) throw unsupported(`it names the unknown resource ${name}`);
    return reference as PDFRef | PDFDict;
  }
}

/** The text settings that a graphics state keeps besides the transformation (ISO 32000-1, 9.3). */
interface TextSettings {
  readonly font: { readonly letters: LetterFont; readonly size: number } | undefined;
  /** The distance between the baselines of two lines, which `T*` moves down. */
  readonly leading: number;
}

/**
 * The commands of one page, read in order into drawing steps. A class, because a path, the text
 * position and the saved text settings carry over from one command to the next.
 */
class PageContent {
  readonly #resources: PageResources;
  readonly #steps: DrawingStep[] = [];
  #path: PathSegment[] = [];
  #clipRule: ClipRule | undefined;
  #text: TextSettings = { font: undefined, leading: 0 };
  readonly #savedText: TextSettings[] = [];
  #inText = false;
  /** The start of the current line, and where the next text starts (ISO 32000-1, 9.4.2). */
  #lineMatrix: Matrix = IDENTITY_MATRIX;
  #textMatrix: Matrix = IDENTITY_MATRIX;

  constructor(resources: PageResources) {
    this.#resources = resources;
  }

  read(content: string): DrawingStep[] {
    for (const line of content.split("\n")) {
      // Each line that pdf-lib writes is the values of one command, then the command.
      const parts = line.trim().split(/\s+/u);
      const command = parts.pop();
      if (command === undefined || command === "") continue;
      const operation = OPERATIONS.get(command);
      if (operation === undefined) throw unsupported(`it uses the PDF command ${command}`);
      operation(this, parts, command);
    }
    if (this.#path.length > 0) throw unsupported("a shape is left unfinished");
    if (this.#inText) throw unsupported("a text is left unfinished");
    return this.#steps;
  }

  step(step: DrawingStep): void {
    this.#steps.push(step);
  }

  save(): void {
    this.#savedText.push(this.#text);
    this.step({ do: "save" });
  }

  restore(): void {
    const text = this.#savedText.pop();
    if (text === undefined) throw unsupported("it restores more than it saved");
    this.#text = text;
    this.step({ do: "restore" });
  }

  extendPath(...segments: PathSegment[]): void {
    this.#path.push(...segments);
  }

  clip(rule: ClipRule): void {
    this.#clipRule = rule;
  }

  paint(fill: boolean, stroke: boolean): void {
    const clip = this.#clipRule !== undefined;
    const clipRule = this.#clipRule ?? "nonzero";
    this.step({ do: "path", segments: this.#path, fill, stroke, clip, clipRule });
    this.#path = [];
    this.#clipRule = undefined;
  }

  graphicsState(name: string | undefined): void {
    this.step({ do: "graphicsState", ...this.#resources.graphicsState(name) });
  }

  image(name: string | undefined): void {
    this.step({ do: "image", image: this.#resources.image(name) });
  }

  beginText(): void {
    if (this.#inText) throw unsupported("a text begins inside another");
    this.#inText = true;
    this.#lineMatrix = this.#textMatrix = IDENTITY_MATRIX;
  }

  endText(): void {
    this.#textCommand("ET");
    this.#inText = false;
  }

  font(name: string | undefined, size: number): void {
    this.#text = { ...this.#text, font: { letters: this.#resources.font(name), size } };
  }

  leading(leading: number): void {
    this.#text = { ...this.#text, leading };
  }

  textMatrix(matrix: Matrix): void {
    this.#textCommand("Tm");
    this.#lineMatrix = this.#textMatrix = matrix;
  }

  nextLine(): void {
    this.#textCommand("T*");
    this.#lineMatrix = this.#textMatrix = translated(this.#lineMatrix, 0, -this.#text.leading);
  }

  showText(text: string): void {
    this.#textCommand("Tj");
    const font = this.#text.font;
    if (font === undefined) throw unsupported("text is drawn before a font is chosen");
    const { segments, advance } = font.letters.text(text, font.size);
    this.step({ do: "text", matrix: this.#textMatrix, segments });
    // The next text, if any comes before a new line, starts where this one ends.
    this.#textMatrix = translated(this.#textMatrix, advance, 0);
  }

  #textCommand(command: string): void {
    if (!this.#inText) throw unsupported(`the command ${command} stands outside a text`);
  }
}

type Operation = (content: PageContent, operands: readonly string[], command: string) => void;

/** The command that moves to a point (`m`) or draws a line to it (`l`), by its segment. */
function pointOperation(to: "move" | "line"): Operation {
  return (content, operands, command) => {
    const [x = 0, y = 0] = numbers(operands, POINT_VALUES, command);
    content.extendPath({ to, x, y });
  };
}

/** The command that sets the DeviceRGB colour of fills (`rg`) or of strokes (`RG`), by its step. */
function rgbOperation(step: "fillColor" | "strokeColor"): Operation {
  return (content, operands, command) => {
    const [red = 0, green = 0, blue = 0] = numbers(operands, RGB_VALUES, command);
    content.step({ do: step, red, green, blue });
  };
}

/**
 * Every PDF command that the card renderers write, by pdf-lib's own name of it (PDFOperatorNames),
 * with how it is read. pdf-lib writes them for the calls the renderers make: drawRectangle,
 * drawEllipse, drawSvgPath, drawImage, drawText and its operators (pushGraphicsState, clip,
 * clipEvenOdd, endPath, setGraphicsState …). A command not in this list is refused.
 */
const OPERATIONS: ReadonlyMap<string, Operation> = new Map<string, Operation>([
  [Op.PushGraphicsState, (content) => content.save()],
  [Op.PopGraphicsState, (content) => content.restore()],
  [
    Op.ConcatTransformationMatrix,
    (content, operands, command) =>
      content.step({ do: "transform", matrix: matrix(operands, command) }),
  ],
  [Op.MoveTo, pointOperation("move")],
  [Op.LineTo, pointOperation("line")],
  [
    Op.AppendBezierCurve,
    (content, operands, command) => {
      const [x1 = 0, y1 = 0, x2 = 0, y2 = 0, x = 0, y = 0] = numbers(
        operands,
        CURVE_VALUES,
        command,
      );
      content.extendPath({ to: "curve", x1, y1, x2, y2, x, y });
    },
  ],
  [
    Op.AppendRectangle,
    (content, operands, command) => {
      const [x = 0, y = 0, width = 0, height = 0] = numbers(operands, RECTANGLE_VALUES, command);
      // The four corners of `re`, counterclockwise from (x, y) (ISO 32000-1, 8.5.2.1).
      content.extendPath(
        { to: "move", x, y },
        { to: "line", x: x + width, y },
        { to: "line", x: x + width, y: y + height },
        { to: "line", x, y: y + height },
        { to: "close" },
      );
    },
  ],
  [Op.ClosePath, (content) => content.extendPath({ to: "close" })],
  [Op.ClipNonZero, (content) => content.clip("nonzero")],
  [Op.ClipEvenOdd, (content) => content.clip("evenodd")],
  [Op.EndPath, (content) => content.paint(false, false)],
  [Op.FillNonZero, (content) => content.paint(true, false)],
  [Op.StrokePath, (content) => content.paint(false, true)],
  [Op.FillNonZeroAndStroke, (content) => content.paint(true, true)],
  [Op.NonStrokingColorRgb, rgbOperation("fillColor")],
  [Op.StrokingColorRgb, rgbOperation("strokeColor")],
  [
    Op.SetLineWidth,
    (content, operands, command) => {
      const [width = 0] = numbers(operands, 1, command);
      content.step({ do: "lineWidth", width });
    },
  ],
  [
    Op.SetLineDashPattern,
    (content, operands, command) => {
      // Written as `[3 2] 0 d`: the lengths of dashes and gaps, then the starting point.
      const values = operands.join(" ");
      const match = /^\[\s*([-\d.\s]*)\]\s+([-\d.]+)$/u.exec(values);
      if (match === null) throw unsupported(`the dash pattern ${values} cannot be read`);
      const lengths = (match[1] ?? "").trim();
      const pattern = lengths === "" ? [] : lengths.split(/\s+/u);
      const [phase = 0] = numbers([match[2] ?? ""], 1, command);
      content.step({ do: "dash", pattern: numbers(pattern, pattern.length, command), phase });
    },
  ],
  [Op.SetGraphicsStateParams, (content, operands) => content.graphicsState(operands[0])],
  [Op.DrawObject, (content, operands) => content.image(operands[0])],
  [Op.BeginText, (content) => content.beginText()],
  [Op.EndText, (content) => content.endText()],
  [
    Op.SetFontAndSize,
    (content, operands, command) => {
      const [size = 0] = numbers(operands.slice(1), 1, command);
      content.font(operands[0], size);
    },
  ],
  [
    Op.SetTextLineHeight,
    (content, operands, command) => {
      const [leading = 0] = numbers(operands, 1, command);
      content.leading(leading);
    },
  ],
  [Op.SetTextMatrix, (content, operands, command) => content.textMatrix(matrix(operands, command))],
  [Op.NextLine, (content) => content.nextLine()],
  // A glyph string holds no white space, so the text is the one value.
  [Op.ShowText, (content, operands) => content.showText(operands.join(""))],
]);

/** The PDF commands that the reader accepts, which the card renderers may write. */
export const ACCEPTED_OPERATORS: readonly string[] = Object.freeze([...OPERATIONS.keys()]);

/**
 * A card PDF as drawing steps, page by page. A class, because the document and the fonts and
 * images it holds are read once for all its pages, which share them.
 */
export class CardPdfReader {
  readonly #document: PDFDocument;
  readonly #objects: DocumentObjects;

  private constructor(document: PDFDocument) {
    this.#document = document;
    this.#objects = new DocumentObjects(document);
  }

  /** Reads the PDF `pdf`, such as one that a card renderer returned. */
  static async load(pdf: Uint8Array): Promise<CardPdfReader> {
    return new CardPdfReader(await PDFDocument.load(pdf));
  }

  get pageCount(): number {
    return this.#document.getPageCount();
  }

  /** The drawing steps of every page, in order. */
  pages(): CardPageDrawing[] {
    return this.#document.getPages().map((page) => this.#page(page));
  }

  #page(page: PDFPage): CardPageDrawing {
    const box = page.getMediaBox();
    if (box.x !== 0 || box.y !== 0 || page.getRotation().angle !== 0)
      throw unsupported("its page is moved or turned");
    const resources = page.node.Resources();
    if (resources === undefined) throw unsupported("its page has no resources");
    const content = this.#objects.content(page.node.Contents());
    const steps = new PageContent(new PageResources(this.#objects, resources)).read(content);
    return { width: box.width, height: box.height, steps };
  }
}

/** The drawing steps of every page of the card PDF `pdf` (CardPdfReader). */
export async function readCardPages(pdf: Uint8Array): Promise<CardPageDrawing[]> {
  return (await CardPdfReader.load(pdf)).pages();
}

import { strFromU8, unzipSync } from "fflate";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  text = text.replace(/^\uFEFF/u, "");
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if (character === "\n" && !quoted) {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }
  if (row.length > 0 || field.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function csvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  return rows.map((row) => Object.fromEntries(header!.map((name, index) => [name, row[index]!])));
}

function xmlText(text: string): string {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

/** Reads the pinned writer's simple shared-string worksheets, preserving cell positions. */
export async function workbookRecords(
  blob: Blob,
  sheetNumber: number,
): Promise<Record<string, string>[]> {
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const strings = [
    ...strFromU8(files["xl/sharedStrings.xml"]!).matchAll(/<t[^>]*>(.*?)<\/t>/gsu),
  ].map((match) => xmlText(match[1]!));
  const xml = strFromU8(files[`xl/worksheets/sheet${sheetNumber}.xml`]!);
  if (xml.includes("<f>")) throw new Error("Activity workbook contains a formula.");
  const rows = [...xml.matchAll(/<row\b[^>]*>(.*?)<\/row>/gsu)].map((row) => {
    const cells: string[] = [];
    // The writer emits styled blanks as <c .../>; they must not consume the next cell's value.
    for (const cell of row[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>(.*?)<\/c>)/gsu)) {
      const reference = cell[1]!.match(/\br="([A-Z]+)\d+"/u)?.[1];
      if (reference === undefined) throw new Error("Activity workbook cell has no reference.");
      // Spreadsheet columns use bijective base 26: ASCII A=65 maps to 1, Z=26, AA=27.
      const column = [...reference].reduce(
        (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
        0,
      );
      const value = cell[2]?.match(/<v>(.*?)<\/v>/su)?.[1];
      cells[column - 1] =
        value === undefined
          ? ""
          : /\bt="s"/u.test(cell[1]!)
            ? strings[Number(value)]!
            : xmlText(value);
    }
    return cells;
  });
  const [header, ...data] = rows;
  return data.map((row) =>
    Object.fromEntries(header!.map((name, index) => [name, row[index] ?? ""])),
  );
}

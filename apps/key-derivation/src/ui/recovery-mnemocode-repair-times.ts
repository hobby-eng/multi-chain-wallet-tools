// How long a repair of damaged shares takes, as MnemoCode measured it: the two tables of its README
// section "Damaged shares", which is their single source. Copy the numbers again when that section
// changes. The page shows them in the help beside each share field; before it searches, it shows
// its own estimate for the shares typed, on this computer.

/** One table: the heading row, then a row for each number of elements missing on a share. */
interface TimeTable {
  readonly caption: string;
  readonly headings: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

const MEASURED =
  "Measured by MnemoCode on a laptop with an Intel Core i7-1260P, for a 2-of-3 set with two shares " +
  "given and the marks in the part of each share that holds the secret. Before it searches, this " +
  "page shows its own estimate for your shares on this computer.";

const OUT_OF_REACH =
  "Out of reach is beyond the trillion combinations that a repair tries at most. Color Unicode " +
  "codes, word numbers, Bytewords and ur:sskr codes take a ? only for a whole element.";

const TABLES: readonly TimeTable[] = [
  {
    caption: "Colors",
    headings: [
      "Colors missing on a share",
      "Whole color, ?",
      "One digit, #B500C?",
      "Two digits, #B500??",
      "Three digits, #B50???",
    ],
    rows: [
      ["1", "at once", "at once", "at once", "at once"],
      ["2", "under a second", "at once", "at once", "at once"],
      ["2 on both shares", "about 3 hours", "at once", "at once", "at once"],
      ["3", "about a month", "at once", "at once", "under a second"],
      ["3 on both shares", "out of reach", "at once", "at once", "under a second"],
      ["4", "out of reach", "at once", "under a second", "under a second"],
      ["4 on both shares", "out of reach", "at once", "under a second", "about 3 hours"],
    ],
  },
  {
    caption: "Unicode codes",
    headings: [
      "Unicode codes missing on a share",
      "Whole code, ?",
      "One digit, 4E0?",
      "Two digits, 4E??",
      "Three digits, 4???",
    ],
    rows: [
      ["1 or 2, on one or both shares", "at once", "at once", "at once", "at once"],
      ["3, on one or both shares", "under a second", "at once", "under a second", "under a second"],
      ["4", "under a second", "at once", "under a second", "under a second"],
      ["4 on both shares", "about 40 s", "at once", "under a second", "about 40 s"],
    ],
  },
];

function table({ caption, headings, rows }: TimeTable): HTMLElement {
  const element = document.createElement("table");
  element.className = "mnemocode-repair-times";
  const title = document.createElement("caption");
  title.textContent = caption;
  const head = document.createElement("tr");
  for (const text of headings) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = text;
    head.append(cell);
  }
  const header = document.createElement("thead");
  header.append(head);
  const body = document.createElement("tbody");
  for (const values of rows) {
    const row = document.createElement("tr");
    for (const text of values) {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.append(cell);
    }
    body.append(row);
  }
  element.append(title, header, body);
  return element;
}

/** Fills every `[data-share-repair-times]` of the page with the heading, both tables and notes. */
export function showShareRepairTimes(): void {
  for (const target of document.querySelectorAll<HTMLElement>("[data-share-repair-times]")) {
    const heading = document.createElement("h3");
    heading.textContent = "How long a repair takes";
    const measured = document.createElement("p");
    measured.textContent = MEASURED;
    const reach = document.createElement("p");
    reach.textContent = OUT_OF_REACH;
    // Wide tables scroll inside the help instead of widening it.
    const tables = TABLES.map((times) => {
      const wrap = document.createElement("div");
      wrap.className = "mnemocode-repair-times-wrap";
      wrap.append(table(times));
      return wrap;
    });
    target.replaceChildren(heading, measured, ...tables, reach);
  }
}

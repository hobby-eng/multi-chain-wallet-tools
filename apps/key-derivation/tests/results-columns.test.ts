// The Basic results table's columns come from every row, so that a first row without an address
// (a Zcash Sapling index without one) hides no address; such a row shows its note across them.
// Public test data only: the phrase "abandon … about" and the Android SDK's test phrase.
import { describe, expect, it } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { paymentAddressField, type DerivationResult, type DerivedRow } from "@ckd/core/types.js";
import { zcashDerivation } from "@ckd/coins/zcash/index.js";
import { PassiveQrPage } from "@ckd/test-support/qr-page.js";
import type { RecoveryTestElement } from "./fake-recovery-page.js";
import { renderResults, type ResultsRenderOptions } from "../src/ui/results.js";

const ABANDON_ABOUT =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
/** zcash-android-wallet-sdk's PHRASE (TransparentTest.kt); its index 0 has no Sapling address. */
const ANDROID_PHRASE =
  "deputy visa gentle among clean scout farm drive comfort patch skin salt ranch cool ramp warrior drink narrow normal lunch behind salt deal person";
/** Its Sapling address at j = 1, which the SDK declares as its zAddr. */
const ANDROID_ZS = "zs1yc4sgtfwwzz6xfsy2xsradzr6m4aypgxhfw2vcn3hatrh5ryqsr08sgpemlg39vdh9kfupx20py";
const NOTE = "No address at this index.";

/** The Sapling rows of `phrase`, account 0, from diversifier index `start`. */
function sapling(phrase: string, start: number, count: number): DerivationResult {
  const derive = zcashDerivation("zcash-sapling");
  if (derive === undefined) throw new Error("Zcash's Sapling variant is not derived.");
  const seed = mnemonicToSeed(phrase, "");
  try {
    return derive({ seed, network: "mainnet", account: 0, branch: 0, start, count });
  } finally {
    seed.fill(0);
  }
}

/** A synthetic result of these rows. */
function synthetic(rows: DerivedRow[]): DerivationResult {
  const result = { id: "synthetic", title: "Public fixture", networkLabel: "mainnet" };
  return { ...result, pathTemplate: "m/i", basicSummary: [], summary: [], notices: [], rows };
}

/** A row with an address and a second payment form of it. */
function addressRow(index: number): DerivedRow {
  return {
    index,
    path: `m/${index}`,
    title: `Address #${index}`,
    basic: [
      paymentAddressField("address", "Address", `synthetic-address-${index}`),
      paymentAddressField("otherAddress", "Other form", `synthetic-other-${index}`),
    ],
    advanced: [],
  };
}

/** A row of an index without an address. */
function noteRow(index: number): DerivedRow {
  return {
    index,
    path: `m/${index}`,
    title: `Index #${index}`,
    note: NOTE,
    basic: [],
    advanced: [],
  };
}

/** The rendered list of `result` in `mode`. */
function render(
  result: DerivationResult,
  mode: "basic" | "advanced",
  encryptedBip38: ReadonlyMap<number, string> = new Map(),
): RecoveryTestElement {
  const page = new PassiveQrPage();
  Object.assign(page, {
    createDocumentFragment: () => page.createElement("fragment"),
    createTextNode: (text: string) => {
      const node = page.createElement("text");
      node.textContent = text;
      return node;
    },
  });
  const [summary, list, notices] = [page.add("summary"), page.add("list"), page.add("notices")];
  const options: ResultsRenderOptions = {
    mode,
    selected: new Set(),
    secretsRevealed: false,
    windowStart: 0,
    windowSize: 50,
    canSignMessage: () => false,
    encryptedBip38,
    onSignMessage() {},
    onSelectionChange() {},
    onWindowChange() {},
  };
  const document = page.asDocument();
  renderResults(
    document.querySelector<HTMLElement>(`#${summary.id}`)!,
    document.querySelector<HTMLElement>(`#${list.id}`)!,
    document.querySelector<HTMLElement>(`#${notices.id}`)!,
    result,
    options,
  );
  return list;
}

/** The table's header texts. */
function headers(list: RecoveryTestElement): string[] {
  return list
    .descendants()
    .filter(({ tagName }) => tagName === "th")
    .map(({ textContent }) => textContent);
}

/** Each body row's cells after Use and Path: their texts and column spans. */
function cells(list: RecoveryTestElement): { text: string; span: number }[][] {
  return list
    .descendants()
    .filter(({ tagName }) => tagName === "tr")
    .slice(1)
    .map((row) =>
      row
        .descendants()
        .filter(({ tagName, parentElement }) => tagName === "td" && parentElement === row)
        .slice(2)
        .map((cell) => ({
          // The value, or the "—" of a missing one or the row's note, without the actions' texts.
          text: cell
            .descendants()
            .filter(
              ({ classList }) => classList.contains("value") || classList.contains("table-empty"),
            )
            .map(({ textContent }) => textContent)
            .join(" "),
          span: Number(Reflect.get(cell, "colSpan") ?? 1),
        })),
    );
}

describe("the Basic results table", () => {
  it("takes its columns from later rows when the first row has no address, and shows its note across them", () => {
    const list = render(synthetic([noteRow(0), addressRow(1)]), "basic");
    expect(headers(list)).toEqual(["Use", "Path", "Address", "Other form"]);
    const [none, first] = cells(list);
    expect(none).toEqual([{ text: NOTE, span: 2 }]);
    expect(first?.map(({ text }) => text)).toEqual(["synthetic-address-1", "synthetic-other-1"]);
  });

  it("spans the note over the BIP38 column beside the address too", () => {
    const list = render(
      synthetic([noteRow(0), addressRow(1)]),
      "basic",
      new Map([[1, "synthetic-bip38"]]),
    );
    expect(headers(list)).toEqual([
      "Use",
      "Path",
      "Address",
      "Encrypted private key · BIP38",
      "Other form",
    ]);
    expect(cells(list)[0]).toEqual([{ text: NOTE, span: 3 }]);
  });

  it("keeps the columns of rows that share their fields", () => {
    const list = render(synthetic([addressRow(0), addressRow(1)]), "basic");
    expect(headers(list)).toEqual(["Use", "Path", "Address", "Other form"]);
    expect(cells(list).map((row) => row.map(({ text }) => text))).toEqual([
      ["synthetic-address-0", "synthetic-other-0"],
      ["synthetic-address-1", "synthetic-other-1"],
    ]);
  });

  it("shows the Android SDK phrase's Sapling address at j = 1 under its column when j = 0 has none", () => {
    const list = render(sapling(ANDROID_PHRASE, 0, 2), "basic");
    expect(headers(list)).toEqual([
      "Use",
      "Path",
      "Sapling address",
      "Unified address (Sapling only)",
    ]);
    const [none, first] = cells(list);
    expect(none).toEqual([
      {
        text: "No Sapling address at this index: its diversifier is not valid (ZIP-32), and wallets skip it.",
        span: 2,
      },
    ]);
    expect(first?.[0]?.text).toBe(ANDROID_ZS);
    expect(first?.[1]?.text).toMatch(/^u1/u);
  });

  it("gives the same columns to rows of abandon … about from an index without an address as from 0", () => {
    const fromTwo = render(sapling(ABANDON_ABOUT, 2, 2), "basic");
    expect(headers(fromTwo)).toEqual(headers(render(sapling(ABANDON_ABOUT, 0, 2), "basic")));
    expect(cells(fromTwo)[1]?.[0]?.text).toBe(
      "zs1c2wlrsejawrdxcmz4sn84ms5myyhs59ez9dpjfjh5rf674hkpwfqgj8qy95q6euj6p82w33psvr",
    );
  });
});

describe("the Advanced result cards", () => {
  it("show a row's note in its card", () => {
    const notes = render(synthetic([noteRow(0), addressRow(1)]), "advanced")
      .descendants()
      .filter((element) => element.classList.contains("row-note"));
    expect(notes.map(({ textContent }) => textContent)).toEqual([NOTE]);
  });
});

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type MnemoCodeBinding } from "@ckd/recovery-backup/mnemocode-engine.js";
import { loadMnemoCode } from "@ckd/recovery-backup/mnemocode-module.js";
import { mnclList } from "@ckd/test-support/mncl-list.js";
import { CandidateListImport } from "../src/candidate-list-import.js";
import { CandidateListPanel } from "../src/candidate-list-panel.js";
import { CandidateListTestFile as ListFile } from "./candidate-list-file.js";

// Public BIP39 test phrases and synthetic list passphrases only.
const PHRASES = [
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  "legal winner thank year wave sausage worth useful legal winner thank yellow",
];
const LIST_PASSPHRASE = "public list passphrase";
/** MnemoCode's limits (docs/CANDIDATES.md): the age header read for the lock, and an age file. */
const HEADER_BYTES = 64 * 1024;
const MAX_ENCRYPTED_BYTES = 155_292_688;

let mnemocode: MnemoCodeBinding;
beforeAll(async () => {
  mnemocode = await loadMnemoCode();
});

function plainList(phrases: readonly string[], passphrase?: string): Uint8Array {
  return mnclList(
    phrases.map((phrase) => ({ phrase })),
    passphrase,
  );
}

function encryptCandidates(list: Uint8Array, recipient: string): Uint8Array {
  return mnemocode.protectList(list, "key", recipient);
}

class FakeElement extends EventTarget {
  hidden = false;
  disabled = false;
  checked = false;
  value = "";
  textContent = "";
  /** The page's document, with its window where the page sets one (panelPage). */
  ownerDocument: { readonly defaultView?: EventTarget } = {};
  click(): void {
    this.dispatchEvent(new Event("click"));
  }
}

/** The button and the file-name line that FileChoice draws around the file input. */
class FakeChoicePart extends FakeElement {
  className = "";
  append(): void {}
  after(): void {}
}

/**
 * A file input: choosing a file fires change, and an empty value empties it, as in a browser. Its
 * document makes the parts of the chooser around it; `name` is the line that names the file.
 */
class FakeFileInput extends EventTarget {
  disabled = false;
  files: ListFile[] = [];
  readonly parts: FakeChoicePart[] = [];
  readonly ownerDocument = {
    createElement: (): FakeChoicePart => {
      const part = new FakeChoicePart();
      this.parts.push(part);
      return part;
    },
  };
  get name(): FakeChoicePart | undefined {
    return this.parts.find((part) => part.className === "file-choice-name");
  }
  replaceWith(): void {}
  get value(): string {
    return this.files.length === 0 ? "" : "list.age";
  }
  set value(text: string) {
    if (text === "") this.files = [];
  }
  choose(file: ListFile): void {
    this.files = [file];
    this.dispatchEvent(new Event("change"));
  }
}

/**
 * The page around the panel: the ten elements it uses, by the selectors it asks for. The panel is
 * opened as the page does once the startup self-test has passed, unless `selfTestPassed` is false.
 */
function panelPage(selfTestPassed = true) {
  const page = {
    key: new FakeElement(),
    keyNote: new FakeElement(),
    showKey: new FakeElement(),
    file: new FakeFileInput(),
    passphraseField: new FakeElement(),
    passphrase: new FakeElement(),
    plaintext: new FakeElement(),
    open: new FakeElement(),
    remove: new FakeElement(),
    status: new FakeElement(),
    typed: new FakeElement(),
  };
  // As the page starts: index.html hides these until they apply.
  page.key.hidden = page.keyNote.hidden = page.passphraseField.hidden = page.remove.hidden = true;
  // The window of the page, whose pagehide ends its lists and its key.
  const window = new EventTarget();
  page.key.ownerDocument = { defaultView: window };
  const selectors: Readonly<Record<string, EventTarget>> = {
    "#candidate-list-key": page.key,
    "#candidate-list-key-note": page.keyNote,
    "#candidate-list-show-key": page.showKey,
    "#candidate-list-file": page.file,
    "#candidate-list-passphrase-field": page.passphraseField,
    "#candidate-list-passphrase": page.passphrase,
    "#candidate-list-plaintext": page.plaintext,
    "#candidate-list-open": page.open,
    "#candidate-list-remove": page.remove,
    "#candidate-list-status": page.status,
    "#batch-input .batch-grid": page.typed,
  };
  const required = <T extends HTMLElement>(selector: string): T => {
    const element = selectors[selector];
    if (element === undefined) throw new Error(`No fake element for ${selector}.`);
    return element as unknown as T;
  };
  const panel = new CandidateListPanel(CandidateListImport, required, () => undefined);
  panel.setEnabled(selfTestPassed);
  return { panel, window, ...page };
}

type Page = ReturnType<typeof panelPage>;

/** The Scanner key the panel shows, as a person copies it into MnemoCode or the Deriver. */
async function scannerKey(page: Page): Promise<string> {
  page.showKey.click();
  await vi.waitFor(() => expect(page.key.value).toMatch(/^age1/u));
  return page.key.value;
}

/** Waits until the open started by the Open button has finished. */
async function opened(page: Page): Promise<void> {
  await vi.waitFor(() => expect(page.open.disabled).toBe(false));
}

/** Lets the pending promise callbacks run; reading a header involves no timer. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("candidate-list panel key lifetime", () => {
  it("wipes the page's key when the page goes, so that a list saved to it no longer opens", async () => {
    const page = panelPage();
    const recipient = await scannerKey(page);
    const file = new ListFile(encryptCandidates(plainList(PHRASES), recipient));
    page.window.dispatchEvent(new Event("pagehide"));
    expect(page.key.value).toBe("");
    expect(page.key.hidden).toBe(true);
    page.file.choose(file);
    await settle();
    page.open.click();
    await opened(page);
    expect(page.panel.source).toBeUndefined();
    expect(page.status.textContent).toMatch(/no Scanner key yet/u);
    // A new key is made when one is asked for again.
    expect(await scannerKey(page)).not.toBe(recipient);
    page.panel.close();
  });
});

describe("candidate-list panel File admission", () => {
  afterEach(() => vi.restoreAllMocks());

  it("opens plaintext only with the selected consent and clears that choice when removed", async () => {
    const page = panelPage();
    const file = new ListFile(plainList(PHRASES.slice(0, 1), "TREZOR"));
    page.plaintext.checked = true;
    page.file.choose(file);
    await settle();
    expect(file.buffers).toHaveLength(0);
    expect(page.passphraseField.hidden).toBe(true);
    page.open.click();
    await opened(page);
    expect(page.panel.source?.count).toBe(1);
    expect(page.panel.source?.inputs()[0]?.passphrase).toBe("TREZOR");
    expect(file.readsWiped).toBe(true);
    page.panel.clear();
    expect(page.plaintext.checked).toBe(false);
    expect(page.panel.source).toBeUndefined();
  });

  it.each(["Select", "Open"])(
    "refuses an oversized %s without reading or allocating the reported body",
    async (action) => {
      const page = panelPage();
      const file = new ListFile(Uint8Array.of(1, 2, 3));
      // Metadata-only fault injection: ordinary fixtures retain native File/Blob sizes and slices.
      vi.spyOn(file, "size", "get").mockReturnValue(MAX_ENCRYPTED_BYTES + 1);
      const arrayBuffer = vi.spyOn(file, "arrayBuffer");
      const slice = vi.spyOn(file, "slice");
      if (action === "Select") page.file.choose(file);
      else {
        page.file.files = [file];
        page.open.click();
      }
      await vi.waitFor(() => expect(page.status.textContent).not.toBe(""));
      await opened(page);
      expect(arrayBuffer).not.toHaveBeenCalled();
      expect(slice).not.toHaveBeenCalled();
      expect(page.panel.source).toBeUndefined();
      expect(page.passphraseField.hidden).toBe(true);
      page.panel.close();
    },
  );

  it("inspects only a native File prefix during selection", async () => {
    const page = panelPage();
    const recipient = await scannerKey(page);
    const file = new ListFile(encryptCandidates(plainList(PHRASES), recipient));
    const body = vi.spyOn(file, "arrayBuffer");
    page.file.choose(file);
    await vi.waitFor(() => expect(file.buffers).toHaveLength(1));
    await settle();
    expect(file.prefixSizes).toEqual([Math.min(file.size, HEADER_BYTES)]);
    expect(file.readsWiped).toBe(true);
    expect(body).not.toHaveBeenCalled();
    expect(page.passphraseField.hidden).toBe(true);
    expect(page.panel.source).toBeUndefined();
    page.panel.close();
  });
});

describe("MnemoCode candidate list panel in the Scanner", () => {
  // scrypt at the fixed work factor takes about a second, so the passphrase list is made once.
  let passphraseList: Uint8Array;
  beforeAll(() => {
    passphraseList = mnemocode.protectList(
      plainList(PHRASES, "TREZOR"),
      "passphrase",
      LIST_PASSPHRASE,
    );
  });

  /** Chooses the passphrase list and waits until the panel asks for its passphrase. */
  async function choosePassphraseList(page: Page): Promise<ListFile> {
    const file = new ListFile(passphraseList);
    page.file.choose(file);
    await vi.waitFor(() => expect(page.passphraseField.hidden).toBe(false));
    return file;
  }

  it("keeps no list cleared while its file is read (the AUD-022 reproduction)", async () => {
    const page = panelPage();
    const file = new ListFile(encryptCandidates(plainList([PHRASES[0]!]), await scannerKey(page)));
    page.file.choose(file);
    await settle();
    const { release } = file.holdNextRead();
    page.open.click();
    page.panel.clear();
    release();
    await opened(page);
    expect(page.panel.source).toBeUndefined();
    expect(page.remove.hidden).toBe(true);
    expect(page.typed.hidden).toBe(false);
    expect(page.status.textContent).toBe("");
    expect(file.readsWiped).toBe(true);
  });

  it("drops the open of a file replaced while it is read; the new file decides", async () => {
    const page = panelPage();
    const file = new ListFile(encryptCandidates(plainList(PHRASES), await scannerKey(page)));
    page.file.choose(file);
    await settle();
    const { release } = file.holdNextRead();
    page.open.click();
    await choosePassphraseList(page);
    release();
    await opened(page);
    expect(page.panel.source).toBeUndefined();
    expect(page.passphraseField.hidden).toBe(false);
    expect(page.status.textContent).toBe("");
    expect(file.readsWiped).toBe(true);
  });

  it("does not ask for a passphrase again when Clear comes while the header is read", async () => {
    const page = panelPage();
    const file = new ListFile(passphraseList);
    const { release } = file.holdNextRead();
    page.file.choose(file);
    page.panel.clear();
    release();
    await settle();
    expect(page.passphraseField.hidden).toBe(true);
    expect(page.status.textContent).toBe("");
  });

  it("opens a passphrase list, says what it holds, and removes it", async () => {
    const page = panelPage();
    // The chooser is a button with the name of the file chosen beside it (FileChoice).
    expect(page.file.parts.map((part) => part.className)).toEqual([
      "secondary compact file-choice",
      "file-choice-name",
    ]);
    expect(page.file.name?.textContent).toBe("No file chosen");
    await choosePassphraseList(page);
    expect(page.file.name?.textContent).toBe("public-test-candidates.age");
    page.passphrase.value = LIST_PASSPHRASE;
    page.open.click();
    await opened(page);
    expect(page.panel.source?.count).toBe(2);
    expect(page.status.textContent).toContain(
      "2 candidates from the list, with the BIP39 passphrase stored in the list.",
    );
    expect(page.passphrase.value).toBe("");
    expect(page.remove.hidden).toBe(false);
    expect(page.typed.hidden).toBe(true);
    page.remove.click();
    expect(page.panel.source).toBeUndefined();
    expect(page.remove.hidden).toBe(true);
    // Remove forgets the file too, and its name.
    expect(page.file.files).toEqual([]);
    expect(page.file.name?.textContent).toBe("No file chosen");
  });

  it("says when the list passphrase is wrong, and keeps no list", async () => {
    const page = panelPage();
    await choosePassphraseList(page);
    page.passphrase.value = "another passphrase";
    page.open.click();
    await opened(page);
    expect(page.panel.source).toBeUndefined();
    expect(page.status.textContent).toMatch(/This passphrase does not open/u);
  });

  it("stays closed until the startup self-test passes, and drops its list after a failure (AUD-023-FUN002)", async () => {
    const page = panelPage(false);
    for (const control of [page.showKey, page.file, page.passphrase, page.open])
      expect(control.disabled).toBe(true);
    page.showKey.click();
    await settle();
    expect(page.key.value).toBe("");
    expect(page.key.hidden).toBe(true);

    page.panel.setEnabled(true);
    const file = new ListFile(encryptCandidates(plainList([PHRASES[0]!]), await scannerKey(page)));
    page.file.choose(file);
    await settle();
    page.open.click();
    await opened(page);
    expect(page.panel.source?.count).toBe(1);

    page.panel.close();
    expect(page.panel.source).toBeUndefined();
    expect(page.key.value).toBe("");
    expect(page.key.hidden).toBe(true);
    for (const control of [page.showKey, page.file, page.passphrase, page.open])
      expect(control.disabled).toBe(true);
  });
});

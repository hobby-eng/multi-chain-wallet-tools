// AUD-023 remediation re-run of AUD-022-SEC002: the Scanner's real CandidateListPanel and
// CandidateListImport, with only the File read (and, in two cases, the age decryption) held so that
// Clear, Remove or another file can come at a chosen stage. Copied from AUD-022-harnesses
// scanner-panel/scanner-import and extended with the orderings AUD-022's "required verification"
// names. Lists hold the public all-zero BIP39 entropy only.
import { describe, expect, it, vi } from "vitest";

const decryption = vi.hoisted(() => {
  let hold: { reached: () => void; released: Promise<void> } | undefined;
  return {
    holdNext(): { started: Promise<void>; release: () => void } {
      let reached!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => (reached = resolve));
      const released = new Promise<void>((resolve) => (release = resolve));
      hold = { reached, released };
      return { started, release };
    },
    async pass(): Promise<void> {
      const current = hold;
      hold = undefined;
      current?.reached();
      await current?.released;
    },
  };
});

vi.mock(
  "../../../packages/recovery-mnemocode/source/core/candidate-encryption.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../packages/recovery-mnemocode/source/core/candidate-encryption.js")
      >();
    return {
      ...actual,
      decryptCandidates: async (...args: Parameters<typeof actual.decryptCandidates>) => {
        await decryption.pass();
        return actual.decryptCandidates(...args);
      },
    };
  },
);

import { CandidateListImport } from "../../../apps/discovery-scanner/src/candidate-list-import.js";
import { CandidateListPanel } from "../../../apps/discovery-scanner/src/candidate-list-panel.js";
import { encryptCandidates } from "../../../packages/recovery-mnemocode/source/core/candidate-encryption.js";
import { encodeCandidateList } from "../../../packages/recovery-mnemocode/source/core/candidate-list.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await new Promise((done) => setTimeout(done, 0));
}

class ElementStub {
  hidden = false;
  disabled = false;
  value = "";
  textContent = "";
  files: { arrayBuffer(): Promise<ArrayBuffer> }[] = [];
  listeners = new Map<string, () => void>();
  addEventListener(name: string, callback: () => void) {
    this.listeners.set(name, callback);
  }
}

/** The real panel over stub elements; `lists` is the panel's own importer. */
async function panelPage() {
  let lists!: CandidateListImport;
  class CapturedImport extends CandidateListImport {
    constructor() {
      super();
      lists = this;
    }
  }
  const elements = new Map<string, ElementStub>();
  const element = (selector: string): ElementStub => {
    if (!elements.has(selector)) elements.set(selector, new ElementStub());
    return elements.get(selector)!;
  };
  const required = <T extends HTMLElement>(selector: string): T => element(selector) as never;
  const changes = { count: 0 };
  const panel = new CandidateListPanel(CapturedImport, required, () => (changes.count += 1));
  // Since the AUD-023 remediation (AUD-023-FUN002) the panel stays closed until the page's startup
  // self-test passed; the page then opens it, as here.
  panel.setEnabled(true);
  const plain = encodeCandidateList({ records: [{ entropy: new Uint8Array(16) }] });
  const encrypted = await encryptCandidates(plain, await lists.recipient());
  plain.fill(0);
  const file = element("#candidate-list-file");
  element("#candidate-list-passphrase-field").hidden = true;
  return {
    panel,
    lists,
    element,
    changes,
    /** A list file whose read the test releases; it records the buffer it handed out. */
    heldFile() {
      const reading = deferred<ArrayBuffer>();
      const handed: ArrayBuffer[] = [];
      const entry = {
        arrayBuffer: () => reading.promise,
        release() {
          const buffer = encrypted.slice().buffer as ArrayBuffer;
          handed.push(buffer);
          reading.resolve(buffer);
        },
        fail: (cause: unknown) => reading.reject(cause),
        handed,
      };
      return entry;
    },
    choose(entry: { arrayBuffer(): Promise<ArrayBuffer> }) {
      file.files = [entry];
    },
    open: () => element("#candidate-list-open").listeners.get("click")!(),
    fileChanged: () => file.listeners.get("change")!(),
    status: () => element("#candidate-list-status").textContent,
  };
}

describe("AUD-022-SEC002 re-run: Scanner panel ownership of a list import", () => {
  it("control: an unchanged file opens with one candidate", async () => {
    const page = await panelPage();
    const entry = page.heldFile();
    page.choose(entry);
    page.open();
    entry.release();
    await settle();
    expect(page.panel.source?.count).toBe(1);
    expect(page.status()).toMatch(/^1 candidate from the list/u);
    page.panel.clear();
    expect(page.panel.source).toBeUndefined();
  });

  it("the AUD-022 reproduction: Clear during the file read keeps no list", async () => {
    const page = await panelPage();
    const entry = page.heldFile();
    page.choose(entry);
    page.open();
    page.panel.clear();
    entry.release();
    await settle();
    expect(page.panel.source?.count ?? 0).toBe(0);
    expect(page.lists.count).toBe(0);
    expect(page.status()).toBe("");
    // The bytes the importer read are wiped although the list was dropped.
    expect(new Uint8Array(entry.handed[0]!).every((byte) => byte === 0)).toBe(true);
    expect(page.element("#candidate-list-open").disabled).toBe(false);
  });

  it("another file chosen during the read replaces the open: the old file keeps nothing", async () => {
    const page = await panelPage();
    const first = page.heldFile();
    page.choose(first);
    page.open();
    const second = page.heldFile();
    page.choose(second);
    page.fileChanged();
    first.release();
    second.release();
    await settle();
    expect(page.panel.source).toBeUndefined();
    expect(page.lists.count).toBe(0);
    expect(page.status()).not.toMatch(/candidate from the list/u);
  });

  it("Clear during the age decryption keeps no list and reports nothing", async () => {
    const page = await panelPage();
    const entry = page.heldFile();
    page.choose(entry);
    const held = decryption.holdNext();
    page.open();
    entry.release();
    await held.started;
    page.panel.clear();
    held.release();
    await settle();
    expect(page.panel.source).toBeUndefined();
    expect(page.lists.count).toBe(0);
    expect(page.status()).toBe("");
  });

  it("a read failure after Clear is not reported", async () => {
    const page = await panelPage();
    const entry = page.heldFile();
    page.choose(entry);
    page.open();
    page.panel.clear();
    entry.fail(new Error("Synthetic read failure"));
    await settle();
    expect(page.status()).toBe("");
    expect(page.panel.source).toBeUndefined();
  });

  it("control: a read failure without Clear is reported and keeps no list", async () => {
    const page = await panelPage();
    const entry = page.heldFile();
    page.choose(entry);
    page.open();
    entry.fail(new Error("Synthetic read failure"));
    await settle();
    expect(page.status()).toBe("Synthetic read failure");
    expect(page.panel.source).toBeUndefined();
  });
});

describe("AUD-022-SEC002 re-run: importer revision ownership", () => {
  it("Clear during the read of a Blob-like file keeps nothing (AUD-022 importer case, fixed input)", async () => {
    // AUD-022's importer probe passed a Uint8Array, which has no arrayBuffer(); this passes a file.
    const lists = new CandidateListImport();
    const plain = encodeCandidateList({ records: [{ entropy: new Uint8Array(16) }] });
    const encrypted = await encryptCandidates(plain, await lists.recipient());
    plain.fill(0);
    const reading = deferred<ArrayBuffer>();
    const opening = lists.open({ arrayBuffer: () => reading.promise });
    lists.clear();
    reading.resolve(encrypted.slice().buffer as ArrayBuffer);
    expect(await opening).toBeUndefined();
    expect(lists.count).toBe(0);
  });

  it("an older open that finishes after a newer one leaves the newer list in place", async () => {
    const lists = new CandidateListImport();
    const recipient = await lists.recipient();
    const one = await encryptCandidates(
      encodeCandidateList({ records: [{ entropy: new Uint8Array(16) }] }),
      recipient,
    );
    const two = await encryptCandidates(
      encodeCandidateList({
        records: [{ entropy: new Uint8Array(16) }, { entropy: new Uint8Array(16).fill(0x7f) }],
      }),
      recipient,
    );
    const slow = deferred<ArrayBuffer>();
    const older = lists.open({ arrayBuffer: () => slow.promise });
    const newer = await lists.open({ arrayBuffer: async () => two.slice().buffer as ArrayBuffer });
    slow.resolve(one.slice().buffer as ArrayBuffer);
    expect(await older).toBeUndefined();
    expect(newer?.count).toBe(2);
    expect(lists.count).toBe(2);
    lists.clear();
  });
});

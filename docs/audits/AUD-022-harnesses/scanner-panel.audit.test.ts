import { describe, expect, it } from "vitest";
import { CandidateListPanel } from "../../../apps/discovery-scanner/src/candidate-list-panel.js";
import { CandidateListImport } from "../../../apps/discovery-scanner/src/candidate-list-import.js";
import { encodeCandidateList } from "../../../packages/recovery-mnemocode/source/core/candidate-list.js";
import { encryptCandidates } from "../../../packages/recovery-mnemocode/source/core/candidate-encryption.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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

describe("AUD-022 Scanner panel input ownership", () => {
  for (const cleared of [false, true]) {
    it(
      cleared ? "rejects an import cleared during the file read" : "opens the unchanged file",
      async () => {
        let lists!: CandidateListImport;
        class CapturedImport extends CandidateListImport {
          constructor() {
            super();
            lists = this;
          }
        }
        const elements = new Map<string, ElementStub>();
        const required = <T extends HTMLElement>(selector: string): T => {
          if (!elements.has(selector)) elements.set(selector, new ElementStub());
          return elements.get(selector) as unknown as T;
        };
        let onChange = () => {};
        const panel = new CandidateListPanel(CapturedImport, required, () => onChange());
        const plain = encodeCandidateList({ records: [{ entropy: new Uint8Array(16) }] });
        const file = await encryptCandidates(plain, await lists.recipient());
        plain.fill(0);
        const reading = deferred<ArrayBuffer>();
        elements.get("#candidate-list-file")!.files = [{ arrayBuffer: () => reading.promise }];
        elements.get("#candidate-list-passphrase-field")!.hidden = true;
        elements.get("#candidate-list-open")!.listeners.get("click")!();
        if (cleared) panel.clear();
        const completion = deferred<void>();
        onChange = () => completion.resolve();
        reading.resolve(file.slice().buffer as ArrayBuffer);
        await completion.promise;
        const count = panel.source?.count ?? 0;
        panel.clear();
        expect(count, "Clear must also invalidate the file-read stage before decryption").toBe(
          cleared ? 0 : 1,
        );
      },
    );
  }
});

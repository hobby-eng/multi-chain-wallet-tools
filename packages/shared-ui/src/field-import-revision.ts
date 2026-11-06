import { SecretValue } from "@ckd/core/secret-value.js";

const IMPORT_FIELD = "[data-file-import]";
type ImportField = HTMLInputElement | HTMLTextAreaElement;

/** A revision owns active snapshots, so revocation retires bytes before a native read settles. */
class ImportLifetime {
  readonly #captures = new Set<FieldImportCapture>();
  #revision = 0;

  get revision(): number {
    return this.#revision;
  }

  add(capture: FieldImportCapture): void {
    this.#captures.add(capture);
  }

  forget(capture: FieldImportCapture): void {
    this.#captures.delete(capture);
  }

  revise(): void {
    this.#revision += 1;
    // Retirement removes the current item; Set iteration still visits every remaining capture.
    for (const capture of this.#captures) capture.wipe();
  }
}

/** Page events own pending captures only until publication or revocation; field keys are weak. */
class PageImports {
  static readonly #pages = new WeakMap<Document, PageImports>();
  readonly #removed = new WeakMap<Element, Set<() => void>>();
  readonly #lifetime = new ImportLifetime();
  readonly #observer: MutationObserver | undefined;

  get revision(): number {
    return this.#lifetime.revision;
  }

  constructor(document: Document) {
    document.defaultView?.addEventListener("pagehide", () => {
      this.#lifetime.revise();
    });
    document.querySelector("#clear-all")?.addEventListener("click", () => {
      this.#lifetime.revise();
    });
    const Observer = document.defaultView?.MutationObserver;
    if (Observer !== undefined) {
      this.#observer = new Observer((records) => this.#records(records));
      this.#observer.observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["disabled", "type"],
      });
    }
  }

  #records(records: readonly MutationRecord[]): void {
    for (const record of records) {
      if (record.type === "attributes" && record.target instanceof Element) {
        for (const revoke of this.#removed.get(record.target) ?? []) revoke();
      }
      for (const node of record.removedNodes) {
        if (!(node instanceof Element)) continue;
        const fields = [
          ...(node.matches(IMPORT_FIELD) ? [node] : []),
          ...node.querySelectorAll(IMPORT_FIELD),
        ];
        // A move out and back still ends the pending operation's earlier field lifetime.
        for (const field of fields) for (const revoke of this.#removed.get(field) ?? []) revoke();
      }
    }
  }

  /** Drain transitions before admission too: disable/type changes may be restored in one turn. */
  flush(): void {
    this.#records(this.#observer?.takeRecords?.() ?? []);
  }

  static for(document: Document): PageImports {
    let page = this.#pages.get(document);
    if (page === undefined) {
      page = new PageImports(document);
      this.#pages.set(document, page);
    }
    return page;
  }

  add(capture: FieldImportCapture): void {
    this.#lifetime.add(capture);
  }

  forget(capture: FieldImportCapture): void {
    this.#lifetime.forget(capture);
  }

  watch(field: ImportField, revoke: () => void): void {
    let callbacks = this.#removed.get(field);
    if (callbacks === undefined) {
      callbacks = new Set();
      this.#removed.set(field, callbacks);
    }
    callbacks.add(revoke);
    field.dataset.fileImport = "";
  }
}

/** Shared admission for asynchronous text and QR imports into one live editable field. */
export class FieldImportRevision {
  static readonly #states = new WeakMap<ImportField, ImportLifetime>();
  readonly #field: ImportField;
  readonly #page: PageImports;
  readonly #state: ImportLifetime;

  /** Edits, Clear, page departure and removal revoke captures, including remove/reinsert. */
  constructor(document: Document, field: ImportField) {
    this.#field = field;
    this.#page = PageImports.for(document);
    let state = FieldImportRevision.#states.get(field);
    if (state === undefined) {
      state = new ImportLifetime();
      FieldImportRevision.#states.set(field, state);
      const shared = state;
      const revoke = (): void => {
        shared.revise();
      };
      for (const type of ["input", "change"]) field.addEventListener(type, revoke);
      this.#page.watch(field, revoke);
    }
    this.#state = state;
  }

  /** Cancelling or replacing a chooser revokes its previous pending work too. */
  revise(): void {
    this.#state.revise();
  }

  /** Captures exact presentation and optional literal owner text in wipeable storage. */
  capture(read: () => string = () => this.#field.value): FieldImportCapture {
    this.#page.flush();
    this.revise();
    const revision = this.#state.revision;
    const page = this.#page.revision;
    const type = this.#field.type;
    const capture = new FieldImportCapture(
      this.#field,
      read,
      () => {
        this.#page.flush();
        return (
          revision === this.#state.revision &&
          page === this.#page.revision &&
          this.#field.type === type
        );
      },
      (retired) => {
        this.#state.forget(retired);
        this.#page.forget(retired);
      },
    );
    this.#state.add(capture);
    this.#page.add(capture);
    return capture;
  }
}

/** An awaited import's owned snapshot; dispose after publication, refusal or cancellation. */
export class FieldImportCapture implements Disposable {
  readonly #field: ImportField;
  readonly #snapshot: SecretValue<readonly string[]>;
  readonly #revision: () => boolean;
  readonly #retired: ((capture: FieldImportCapture) => void) | undefined;
  #read: (() => string) | undefined;

  /** Called by FieldImportRevision; the reader must be synchronous and side-effect free. */
  constructor(
    field: ImportField,
    read: () => string,
    revision: () => boolean,
    retired?: (capture: FieldImportCapture) => void,
  ) {
    this.#field = field;
    this.#read = read;
    this.#revision = revision;
    this.#retired = retired;
    this.#snapshot = SecretValue.utf16Texts([field.value, read()]);
  }

  /** Exact prior DOM text, for rollback if a field sanitizes an admitted import. */
  get presentation(): string {
    this.#revision();
    return this.#snapshot.value[0] ?? "";
  }

  /** Joins record imports from the captured field; literal replacement keeps its exact text. */
  importedText(incoming: string, append: boolean): string {
    if (!append) return incoming;
    this.#revision();
    const previous = this.#snapshot.value[1]?.trim() ?? "";
    return previous === "" ? incoming : incoming === "" ? previous : `${previous}\n${incoming}`;
  }

  /** Refuses stale, removed, disabled, replaced or changed fields before callbacks/publication. */
  current(): boolean {
    if (
      this.#read === undefined ||
      !this.#revision() ||
      this.#read === undefined ||
      !this.#field.isConnected ||
      this.#field.disabled
    )
      return false;
    const [presentation, literal] = this.#snapshot.value;
    return this.#field.value === presentation && this.#read() === literal;
  }

  /** Releases the capture; later current() is false. */
  wipe(): void {
    if (this.#read === undefined) return;
    this.#read = undefined;
    try {
      this.#snapshot.wipe();
    } finally {
      this.#retired?.(this);
    }
  }

  /** Ends the retained presentation's lifetime. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}

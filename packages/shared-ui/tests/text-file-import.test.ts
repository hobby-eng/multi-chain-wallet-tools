import { afterEach, describe, expect, it, vi } from "vitest";
import { FileChoice } from "../src/file-choice.js";
import { LiteralSecretField } from "../src/literal-secret-field.js";
import { installTextFileImport, TEXT_FILE_LIMIT_BYTES } from "../src/text-file-import.js";

type ImportOptions = Parameters<typeof installTextFileImport>[2];

/** The value sanitization of a single-line input, with an observable synthetic event target. */
class TextField extends EventTarget {
  #value = "typed synthetic value";
  readonly #attributes = new Map<string, string>();
  readonly #classes = new Set<string>();
  id = "synthetic-secret-field";
  type: string;
  disabled = false;
  validity = "";
  readonly inputEvents: Event[] = [];
  readonly after = vi.fn();
  readonly reportValidity = vi.fn(() => true);
  readonly clearAction = new EventTarget();
  readonly ownerDocument = {
    defaultView: new EventTarget(),
    querySelector: (selector: string) => (selector === "#clear-all" ? this.clearAction : null),
    createElement: vi.fn(() => ({ id: "", className: "", textContent: "" })),
  } as unknown as Document;
  readonly classList = {
    add: (...names: string[]): void => {
      for (const name of names) this.#classes.add(name);
    },
    remove: (...names: string[]): void => {
      for (const name of names) this.#classes.delete(name);
    },
    contains: (name: string): boolean => this.#classes.has(name),
  };

  constructor(
    readonly tagName: "INPUT" | "TEXTAREA",
    readonly stripLineBreaks = false,
  ) {
    super();
    this.type = tagName === "INPUT" ? "password" : "textarea";
  }

  get value(): string {
    return this.#value;
  }

  set value(value: string) {
    this.#value = this.stripLineBreaks
      ? value.replace(/[\r\n]/gu, "")
      : this.tagName === "TEXTAREA"
        ? value.replace(/\r\n?/gu, "\n")
        : value;
  }

  setAttribute(name: string, value: string): void {
    this.#attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.#attributes.get(name) ?? null;
  }

  setCustomValidity(message: string): void {
    this.validity = message;
  }

  override dispatchEvent(event: Event): boolean {
    if (event.type === "input") this.inputEvents.push(event);
    return super.dispatchEvent(event);
  }
}

function fakeFile(contents: string | Uint8Array) {
  const source = typeof contents === "string" ? new TextEncoder().encode(contents) : contents;
  const buffers: Uint8Array<ArrayBuffer>[] = [];
  const arrayBuffer = vi.fn(async (): Promise<ArrayBuffer> => {
    const owned = new Uint8Array(source);
    buffers.push(owned);
    return owned.buffer;
  });
  return {
    file: { size: source.byteLength, arrayBuffer } as unknown as File,
    buffers,
    arrayBuffer,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((complete, refuse) => {
    resolve = complete;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

function mount(target: TextField, options: Partial<ImportOptions> = {}) {
  let selected: File | undefined;
  let choose!: () => void;
  const clear = vi.fn(() => {
    selected = undefined;
  });
  const create = vi.spyOn(FileChoice, "create").mockReturnValue({
    elements: [],
    get file() {
      return selected;
    },
    clear,
    onChoose(listener: () => void) {
      choose = listener;
    },
  } as unknown as FileChoice);
  installTextFileImport(target.ownerDocument, target as unknown as HTMLInputElement, {
    accept: "text/plain",
    ...options,
  });
  return {
    clear,
    create,
    choose(file?: File): void {
      selected = file;
      choose();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("bounded local text-file inputs", () => {
  it("preserves a literal input value and emits the existing bubbling input event", async () => {
    const target = new TextField("INPUT");
    const file = fakeFile("  public synthetic passphrase\t ");
    const reader = mount(target);
    reader.choose(file.file);
    expect(reader.clear).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(target.inputEvents).toHaveLength(1));
    expect(target.value).toBe("  public synthetic passphrase\t ");
    expect(target.inputEvents[0]!.bubbles).toBe(true);
    expect(file.buffers[0]!.every((byte) => byte === 0)).toBe(true);
    expect(reader.create).toHaveBeenCalledWith(expect.anything(), "Open a text file", {
      accept: "text/plain",
    });
  });

  it("keeps the existing trimmed textarea import and its supplied picker label", async () => {
    const target = new TextField("TEXTAREA");
    const file = fakeFile("\n  synthetic record \n");
    const reader = mount(target, { label: "Synthetic record import" });
    reader.choose(file.file);
    await vi.waitFor(() => expect(target.value).toBe("synthetic record"));
    expect(reader.create).toHaveBeenCalledWith(expect.anything(), "Synthetic record import", {
      accept: "text/plain",
    });
  });

  it("can explicitly preserve a textarea's literal value", async () => {
    const target = new TextField("TEXTAREA");
    const file = fakeFile("  synthetic multiline value\n ");
    mount(target, { preserveWhitespace: true }).choose(file.file);
    await vi.waitFor(() => expect(target.value).toBe("  synthetic multiline value\n "));
  });

  it.each(["\n", "\r\n"])(
    "drops one requested final %j while keeping a BOM and password spaces",
    async (ending) => {
      const target = new TextField("INPUT", true);
      const password = "\uFEFF  public synthetic passphrase\t ";
      const file = fakeFile(password + ending);
      mount(target, { stripFinalLineBreak: true }).choose(file.file);
      await vi.waitFor(() => expect(target.inputEvents).toHaveLength(1));
      expect(target.value).toBe(password);
      expect(file.buffers[0]!.every((byte) => byte === 0)).toBe(true);
    },
  );

  it("removes exactly one final line break when the host can preserve the remainder", async () => {
    const target = new TextField("TEXTAREA");
    const file = fakeFile("\uFEFF  synthetic password \n\n");
    mount(target, { preserveWhitespace: true, stripFinalLineBreak: true }).choose(file.file);
    await vi.waitFor(() => expect(target.inputEvents).toHaveLength(1));
    expect(target.value).toBe("\uFEFF  synthetic password \n");
  });

  it("imports exact BIP39 text through the value owner despite native textarea normalization", async () => {
    const target = new TextField("TEXTAREA");
    const value = new LiteralSecretField(target as unknown as HTMLTextAreaElement);
    const file = fakeFile("\uFEFF  public synthetic\r\npassword\rwith spaces \n\r\n");
    mount(target, { preserveWhitespace: true, stripFinalLineBreak: true, value }).choose(file.file);
    await vi.waitFor(() => expect(target.inputEvents).toHaveLength(1));
    expect(target.value).toBe("\uFEFF  public synthetic\npassword\nwith spaces \n");
    const exact = "\uFEFF  public synthetic\r\npassword\rwith spaces \n";
    expect(value.read()).toBe(exact);
    expect(new TextEncoder().encode(value.read())).toEqual(new TextEncoder().encode(exact));
    expect(file.buffers[0]!.every((byte) => byte === 0)).toBe(true);
    expect(target.validity).toBe("");
  });

  it("delegates field normalization without trimming the text first", async () => {
    const target = new TextField("INPUT", true);
    const text = "\uFEFF  synthetic password \r\n";
    const normalize = vi.fn(() => "library-normalized synthetic value");
    const file = fakeFile(text);
    mount(target, { normalize }).choose(file.file);
    await vi.waitFor(() => expect(target.inputEvents).toHaveLength(1));
    expect(normalize).toHaveBeenCalledWith(text);
    expect(target.value).toBe("library-normalized synthetic value");
  });

  it("redacts a field parser's refusal and keeps the typed value", async () => {
    const target = new TextField("INPUT");
    const file = fakeFile("synthetic refused password");
    const normalize = (): string => {
      throw new Error("synthetic private parser detail");
    };
    mount(target, { normalize }).choose(file.file);
    await vi.waitFor(() =>
      expect(target.validity).toBe("That file is not accepted by this field."),
    );
    expect(target.value).toBe("typed synthetic value");
    expect(target.inputEvents).toHaveLength(0);
    expect(file.buffers[0]!.every((byte) => byte === 0)).toBe(true);
  });

  it.each(["synthetic password\n\n", "synthetic\npassword", "synthetic password\r"])(
    "refuses remaining input line breaks without replacing the typed value (%j)",
    async (contents) => {
      const target = new TextField("INPUT", true);
      const file = fakeFile(contents);
      mount(target, { stripFinalLineBreak: true }).choose(file.file);
      await vi.waitFor(() => expect(target.validity).not.toBe(""));
      expect(target.value).toBe("typed synthetic value");
      expect(target.validity).toBe("That file contains characters this field cannot preserve.");
      expect(target.reportValidity).toHaveBeenCalledOnce();
      expect(target.inputEvents).toHaveLength(0);
      expect(file.buffers[0]!.every((byte) => byte === 0)).toBe(true);
      target.dispatchEvent(new Event("input"));
      expect(target.validity).toBe("");
    },
  );

  it("does not concatenate an internally split key even when surrounding whitespace is trimmed", async () => {
    const target = new TextField("INPUT", true);
    const file = fakeFile("  synthetic\nkey \n");
    mount(target, { preserveWhitespace: false }).choose(file.file);
    await vi.waitFor(() => expect(target.validity).not.toBe(""));
    expect(target.value).toBe("typed synthetic value");
    expect(target.inputEvents).toHaveLength(0);
  });

  it("refuses oversized metadata before reading the body", async () => {
    const target = new TextField("INPUT");
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const file = { size: TEXT_FILE_LIMIT_BYTES + 1, arrayBuffer } as unknown as File;
    const onError = vi.fn();
    mount(target, { onError }).choose(file);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(target.value).toBe("typed synthetic value");
    expect(target.inputEvents).toHaveLength(0);
  });

  it("rechecks the actual byte length and wipes a mismatched oversized body", async () => {
    const target = new TextField("INPUT");
    const bytes = new Uint8Array(TEXT_FILE_LIMIT_BYTES + 1).fill(1);
    const file = { size: 1, arrayBuffer: async () => bytes.buffer } as unknown as File;
    const onError = vi.fn();
    mount(target, { onError }).choose(file);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(target.value).toBe("typed synthetic value");
    expect(bytes.every((byte) => byte === 0)).toBe(true);
  });

  it("refuses invalid UTF-8 without exposing bytes or replacing typed text", async () => {
    const target = new TextField("INPUT");
    // An incomplete UTF-8 sequence followed by an ASCII opening parenthesis.
    const file = fakeFile(Uint8Array.of(0xc3, 0x28));
    const onError = vi.fn();
    mount(target, { onError }).choose(file.file);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith("That file is not text."));
    expect(target.value).toBe("typed synthetic value");
    expect(file.buffers[0]!.every((byte) => byte === 0)).toBe(true);
  });

  it("redacts a reader's own diagnostic", async () => {
    const target = new TextField("INPUT");
    const file = {
      size: 1,
      arrayBuffer: async () => {
        throw new Error("synthetic file name and sensitive reader detail");
      },
    } as unknown as File;
    const onError = vi.fn();
    mount(target, { onError }).choose(file);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith("The file could not be read."));
    expect(target.value).toBe("typed synthetic value");
  });

  it.each(["edit", "clear", "type", "disable", "cancel"] as const)(
    "drops a pending read after %s and wipes its buffer",
    async (change) => {
      const target = new TextField("INPUT");
      const gate = deferred<ArrayBuffer>();
      const bytes = new TextEncoder().encode("synthetic delayed secret");
      const file = { size: bytes.byteLength, arrayBuffer: () => gate.promise } as unknown as File;
      const onError = vi.fn();
      const reader = mount(target, { onError });
      reader.choose(file);
      if (change === "edit") {
        target.value = "later typed value";
        target.dispatchEvent(new Event("input"));
      } else if (change === "clear") target.value = "";
      else if (change === "type") target.type = "text";
      else if (change === "disable") target.disabled = true;
      else reader.choose();
      const expectedValue = target.value;
      const inputEvents = target.inputEvents.length;
      gate.resolve(bytes.buffer);
      await vi.waitFor(() => expect(bytes.every((byte) => byte === 0)).toBe(true));
      expect(target.value).toBe(expectedValue);
      expect(target.inputEvents).toHaveLength(inputEvents);
      expect(onError).not.toHaveBeenCalled();
    },
  );

  it("keeps the newest chosen file when an earlier read finishes later", async () => {
    const target = new TextField("INPUT");
    const gate = deferred<ArrayBuffer>();
    const bytes = new TextEncoder().encode("synthetic earlier secret");
    const first = { size: bytes.byteLength, arrayBuffer: () => gate.promise } as unknown as File;
    const latest = fakeFile("synthetic latest secret");
    const reader = mount(target);
    reader.choose(first);
    reader.choose(latest.file);
    await vi.waitFor(() => expect(target.value).toBe("synthetic latest secret"));
    gate.resolve(bytes.buffer);
    await vi.waitFor(() => expect(bytes.every((byte) => byte === 0)).toBe(true));
    expect(target.value).toBe("synthetic latest secret");
    expect(target.inputEvents).toHaveLength(1);
  });

  it("cannot restore an exact secret from a file that finishes after pagehide", async () => {
    const target = new TextField("TEXTAREA");
    const value = new LiteralSecretField(target as unknown as HTMLTextAreaElement);
    const gate = deferred<ArrayBuffer>();
    const bytes = new TextEncoder().encode("synthetic delayed\r\nsecret");
    const file = { size: bytes.byteLength, arrayBuffer: () => gate.promise } as unknown as File;
    mount(target, { preserveWhitespace: true, value }).choose(file);
    target.ownerDocument.defaultView!.dispatchEvent(new Event("pagehide"));
    gate.resolve(bytes.buffer);
    await vi.waitFor(() => expect(bytes.every((byte) => byte === 0)).toBe(true));
    expect(target.value).toBe("");
    expect(value.read()).toBe("");
    // The clear emits input; the abandoned import emits none.
    expect(target.inputEvents).toHaveLength(1);
  });

  it("does not read a disabled field or a cancelled choice", () => {
    const target = new TextField("INPUT");
    target.disabled = true;
    const file = fakeFile("synthetic unused file");
    const reader = mount(target);
    reader.choose(file.file);
    reader.choose();
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(target.value).toBe("typed synthetic value");
  });
});

describe("literal imported secret lifetime", () => {
  function field() {
    const target = new TextField("TEXTAREA");
    return { target, value: new LiteralSecretField(target as unknown as HTMLTextAreaElement) };
  }

  it("starts concealed and retains exact bytes through reveal and reconceal", () => {
    const { target, value } = field();
    expect(target.classList.contains("concealed")).toBe(true);
    const exact = "\uFEFF  synthetic\r\npassword\rsecond line \t";
    value.assign(exact);
    expect(target.value).toBe("\uFEFF  synthetic\npassword\nsecond line \t");
    expect(value.read()).toBe(exact);
    expect(target.inputEvents).toHaveLength(1);
    expect(target.inputEvents[0]!.bubbles).toBe(true);
    for (const revealed of [true, false]) {
      if (revealed) target.classList.remove("concealed");
      else target.classList.add("concealed");
      expect(new TextEncoder().encode(value.read())).toEqual(new TextEncoder().encode(exact));
    }
    const note = target.after.mock.calls[0]![0] as HTMLParagraphElement;
    expect(note.id).toBe("synthetic-secret-field-import-note");
    expect(note.textContent).toContain("edit or clear");
    expect(target.getAttribute("aria-describedby")).toBe(note.id);
  });

  it.each(["input", "change"])(
    "invalidates an import on a real %s, including edit then undo",
    (type) => {
      const { target, value } = field();
      value.assign("synthetic\r\npassword");
      // A real edit can end at the same visible value while still abandoning the imported factor.
      target.dispatchEvent(new Event(type));
      expect(value.read()).toBe("synthetic\npassword");
    },
  );

  it("invalidates a changed presentation even without an edit event", () => {
    const { target, value } = field();
    value.assign("synthetic\r\npassword");
    target.value = "changed\rpassword";
    expect(value.read()).toBe("changed\npassword");
    target.value = "synthetic\npassword";
    expect(value.read()).toBe("synthetic\npassword");
  });

  it("clears the canonical value without resurrecting it when the presentation is restored", () => {
    const { target, value } = field();
    value.assign("synthetic\r\npassword");
    value.clear();
    expect(value.read()).toBe("");
    expect(target.value).toBe("");
    target.value = "synthetic\npassword";
    expect(value.read()).toBe("synthetic\npassword");
  });

  it("clears both values on pagehide", () => {
    const { target, value } = field();
    value.assign("synthetic\r\npassword");
    target.ownerDocument.defaultView!.dispatchEvent(new Event("pagehide"));
    expect(target.value).toBe("");
    expect(value.read()).toBe("");
  });

  it("drops an imported factor on the host Clear action before any later read", () => {
    const target = new TextField("TEXTAREA");
    // The existing host may clear its DOM without emitting an input event.
    target.clearAction.addEventListener("click", () => {
      target.value = "";
    });
    const value = new LiteralSecretField(target as unknown as HTMLTextAreaElement);
    value.assign("synthetic\r\npassword");
    target.clearAction.dispatchEvent(new Event("click"));
    expect(target.value).toBe("");
    // Restoring the old display before the first read must not revive its canonical CRLF.
    target.value = "synthetic\npassword";
    expect(value.read()).toBe("synthetic\npassword");
  });
});

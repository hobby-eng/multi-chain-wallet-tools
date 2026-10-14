/** Native immutable File/Blob geometry with observable owned reads, using public test data only. */
export class CandidateListTestFile extends File {
  readonly buffers: ArrayBuffer[] = [];
  readonly prefixSizes: number[] = [];
  #held: { kind: "any" | "body"; reached: () => void; released: Promise<void> } | undefined;

  constructor(bytes: Uint8Array) {
    super([bytes.slice()], "public-test-candidates.age");
  }

  get readsWiped(): boolean {
    return (
      this.buffers.length > 0 &&
      this.buffers.every((buffer) => new Uint8Array(buffer).every((byte) => byte === 0))
    );
  }

  /** Holds exactly the next read, including a sliced prefix read. */
  holdNextRead(kind: "any" | "body" = "any"): { started: Promise<void>; release: () => void } {
    let reached!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => (reached = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    this.#held = { kind, reached, released };
    return { started, release };
  }

  override slice(start?: number, end?: number, contentType?: string): Blob {
    const prefix = super.slice(start, end, contentType);
    this.prefixSizes.push(prefix.size);
    const read = prefix.arrayBuffer.bind(prefix);
    // The slice remains a native Blob; only its owned arrayBuffer read is observed or delayed.
    Object.defineProperty(prefix, "arrayBuffer", { value: () => this.#read(read, "prefix") });
    return prefix;
  }

  override arrayBuffer(): Promise<ArrayBuffer> {
    return this.#read(() => super.arrayBuffer(), "body");
  }

  async #read(read: () => Promise<ArrayBuffer>, kind: "prefix" | "body"): Promise<ArrayBuffer> {
    const held = this.#held?.kind === "body" && kind === "prefix" ? undefined : this.#held;
    if (held !== undefined) this.#held = undefined;
    const buffer = await read();
    this.buffers.push(buffer);
    held?.reached();
    await held?.released;
    return buffer;
  }
}

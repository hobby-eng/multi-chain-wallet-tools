import { Tsv } from "@ckd/export/tsv.js";
import type { ResultField } from "@ckd/core/types.js";
import { SecretValue } from "@ckd/core/secret-value.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";

const ERRORS = new ErrorCatalog("wallet.matcher-secrets", {
  wiped: () => "The matched private results are no longer available.",
  row: () => "Private export rows are not aligned.",
});

/** Byte-owned matched private fields; callers borrow decoded views only for immediate display/export. */
export class MatcherSecrets implements Disposable {
  /** The identity columns of both public and private match exports. */
  static readonly COLUMNS = ["Seed", "Known target", "Wallet structure", "Path"] as const;
  readonly #rows: (readonly string[])[] = [];
  readonly #metadata: { key: string; label: string }[][] = [];
  readonly #values: SecretValue<readonly string[]>[] = [];
  #wiped = false;

  /** Copies one row's public identity and secret values, with independent cleanup ownership. */
  add(row: readonly string[], fields: readonly ResultField[]): void {
    this.#assertLive();
    if (row.length !== MatcherSecrets.COLUMNS.length) throw ERRORS.create("row", []);
    // Read borrowed metadata/getters before acquiring secret storage or mutating this owner.
    const identity = [...row];
    const captured = fields.map(({ key, label, value }) => ({ key, label, value }));
    const metadata = captured.map(({ key, label }) => ({ key, label }));
    const values = SecretValue.utf16Texts(captured.map(({ value }) => value));
    this.#values.push(values);
    this.#rows.push(identity);
    this.#metadata.push(metadata);
  }

  /** Number of matched rows, without decoding secret values. */
  get size(): number {
    this.#assertLive();
    return this.#rows.length;
  }

  /** A fresh view for one DOM update; the caller must not retain it across awaited operations. */
  fields(index: number): ResultField[] {
    this.#assertLive();
    const metadata = this.#metadata[index];
    const values = this.#values[index];
    if (metadata === undefined || values === undefined) throw ERRORS.create("row", []);
    const text = values.value;
    return metadata.map((field, place) => ({ ...field, value: text[place] ?? "", secret: true }));
  }

  /** Builds an aligned TSV now; no immutable private TSV is retained by this owner. */
  tsv(): string {
    this.#assertLive();
    const identity = (field: { key: string; label: string }): string =>
      `${field.key}\0${field.label}`;
    const columns = [
      ...new Map(
        this.#metadata.flatMap((row) => row.map((field) => [identity(field), field] as const)),
      ).values(),
    ];
    const rows = this.#rows.map((row, index) => {
      const values = new Map(this.fields(index).map((field) => [identity(field), field.value]));
      return [...row, ...columns.map((field) => values.get(identity(field)) ?? "")];
    });
    return Tsv.table([
      [...MatcherSecrets.COLUMNS, ...columns.map((field) => field.label)],
      ...rows,
    ]);
  }

  #assertLive(): void {
    if (this.#wiped) throw ERRORS.create("wiped", []);
  }

  /** Erases owned byte storage as far as the runtime permits; later reads refuse. */
  wipe(): void {
    this.#wiped = true;
    for (const values of this.#values) values.wipe();
    this.#values.length = 0;
    this.#rows.length = 0;
    this.#metadata.length = 0;
  }

  /** Ends the result's lifetime. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}

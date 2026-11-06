import type { DerivationResult, ResultField } from "./types.js";
import { SecretValue } from "./secret-value.js";

/** Stable input-free failures of retained derivation text ownership. */
export type DerivationSecretsErrorCode =
  | "derivation.result.text"
  | "derivation.result.retired"
  | "derivation.result.property"
  | "derivation.key.address"
  | "derivation.key.unavailable"
  | "derivation.key.material";

/** Private text could not be owned, replaced or released through its mutable result contract. */
export class DerivationSecretsError extends Error {
  readonly code: DerivationSecretsErrorCode;
  constructor(code: DerivationSecretsErrorCode) {
    super(code);
    this.name = "DerivationSecretsError";
    this.code = code;
  }
}

class ResultText implements Disposable {
  #value: SecretValue<readonly string[]> | undefined;
  #retired = false;

  constructor(value: unknown) {
    this.replace(value);
  }

  read(): string {
    return this.#value?.value[0] ?? "";
  }

  replace(value: unknown): void {
    if (typeof value !== "string") throw new DerivationSecretsError("derivation.result.text");
    if (this.#retired) {
      if (value !== "") throw new DerivationSecretsError("derivation.result.retired");
      return;
    }
    // Keep exact opaque code units, including a leading BOM or a lone surrogate.
    const next = SecretValue.utf16Texts([value]);
    this.#value?.wipe();
    this.#value = next;
  }

  wipe(): void {
    this.#retired = true;
    this.#value?.wipe();
    this.#value = undefined;
  }

  [Symbol.dispose](): void {
    this.wipe();
  }
}

/** Completes independent releases before reporting a single input-free cleanup failure. */
class ResultCleanup {
  #failed = false;
  attempt(release: () => void): void {
    try {
      release();
    } catch {
      this.#failed = true;
    }
  }
  finish(): void {
    if (this.#failed) throw new DerivationSecretsError("derivation.result.property");
  }
}

/** Owns private result text as bytes while preserving the existing native DTO/field interface. */
export class DerivationSecrets {
  static readonly #owned = new WeakMap<object, Map<string, ResultText>>();
  static readonly #clearing = new WeakSet<DerivationResult>();

  static *#fields(result: DerivationResult): Generator<ResultField> {
    yield* result.basicSummary;
    yield* result.summary;
    for (const row of result.rows) {
      yield* row.basic;
      yield* row.advanced;
      for (const group of row.groups ?? []) {
        yield* group.basic;
        yield* group.advanced;
      }
    }
  }

  static #takeProperty(target: object, key: string): void {
    if (this.#owned.get(target)?.has(key) === true) return;
    let owner: ResultText | undefined;
    try {
      owner = new ResultText(Reflect.get(target, key));
      const value = owner;
      Object.defineProperty(target, key, {
        enumerable: true,
        // Native structuredClone reads this temporary view; it never transports this owner.
        configurable: false,
        get: () => value.read(),
        set: (text: unknown) => value.replace(text),
      });
      let properties = this.#owned.get(target);
      if (properties === undefined) {
        properties = new Map();
        this.#owned.set(target, properties);
      }
      properties.set(key, owner);
    } catch (cause) {
      owner?.wipe();
      if (cause instanceof DerivationSecretsError) throw cause;
      throw new DerivationSecretsError("derivation.result.property");
    }
  }

  /** Take private fields, private descriptors and privacy-sensitive watch-only text before retention. */
  static take(result: DerivationResult): DerivationResult {
    try {
      for (const field of this.#fields(result)) {
        if (field.secret) this.#takeProperty(field, "value");
      }
      if (result.watchOnly !== undefined) this.#takeProperty(result.watchOnly, "text");
      if (result.accountDescriptors !== undefined)
        this.#takeProperty(result.accountDescriptors, "privateText");
      return result;
    } catch (cause) {
      // A partially admitted mutable container must not leave its earlier owners live.
      this.clear(result);
      throw cause;
    }
  }

  static #clearProperty(target: object, key: string): void {
    const owner = this.#owned.get(target)?.get(key);
    if (owner !== undefined) owner.wipe();
    else if (!Reflect.set(target, key, ""))
      throw new DerivationSecretsError("derivation.result.property");
  }

  static #snapshot(result: DerivationResult, cleanup: ResultCleanup) {
    // Planning also crosses native getters: retain partial targets and continue independent branches.
    const properties: { target: object; key: string }[] = [];
    const arrays: { length: number }[] = [];
    const fields = (values: ResultField[]): void => {
      arrays.push(values);
      for (const target of values) properties.push({ target, key: "value" });
    };
    cleanup.attempt(() => fields(result.basicSummary));
    cleanup.attempt(() => fields(result.summary));
    cleanup.attempt(() => {
      arrays.push(result.notices);
    });
    cleanup.attempt(() => {
      const watchOnly = result.watchOnly;
      if (watchOnly !== undefined) properties.push({ target: watchOnly, key: "text" });
    });
    cleanup.attempt(() => {
      const descriptors = result.accountDescriptors;
      if (descriptors !== undefined)
        for (const key of ["privateText", "accountPath", "publicText", "scannerText", "fileStem"])
          properties.push({ target: descriptors, key });
    });
    cleanup.attempt(() => {
      const rows = result.rows;
      arrays.push(rows);
      const rowSnapshot = rows.slice();
      for (const row of rowSnapshot) {
        properties.push({ target: row, key: "path" });
        cleanup.attempt(() => fields(row.basic));
        cleanup.attempt(() => fields(row.advanced));
        cleanup.attempt(() => {
          const groups = row.groups;
          if (groups === undefined) return;
          arrays.push(groups);
          const groupSnapshot = groups.slice();
          for (const group of groupSnapshot) {
            cleanup.attempt(() => fields(group.basic));
            cleanup.attempt(() => fields(group.advanced));
          }
        });
      }
    });
    return { properties, arrays };
  }

  /** Retire this container's current graph; transferred rows survive, recursive cleanup joins the active release. */
  static clear(result: DerivationResult | null): void {
    if (result !== null) this.clearAll([result]);
  }

  /** Snapshot all containers before invoking any setter, then finish every independent release. */
  static clearAll(results: readonly DerivationResult[]): void {
    const admitted = [...new Set(results)].filter((result) => !this.#clearing.has(result));
    for (const result of admitted) this.#clearing.add(result);
    const cleanup = new ResultCleanup();
    try {
      const plans = admitted.map((result) => this.#snapshot(result, cleanup));
      for (const { properties, arrays } of plans) {
        for (const { target, key } of properties)
          cleanup.attempt(() => this.#clearProperty(target, key));
        for (const array of arrays)
          cleanup.attempt(() => {
            array.length = 0;
          });
      }
    } finally {
      for (const result of admitted) this.#clearing.delete(result);
    }
    cleanup.finish();
  }
}

/** Compatibility entry for result retirement; immutable native transport copies cannot be erased. */
export const clearDerivationResult = DerivationSecrets.clear.bind(DerivationSecrets);

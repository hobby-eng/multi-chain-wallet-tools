// A text input repeats its last edit as change after losing focus. That repeat must not revoke a
// job started by the intervening click. Snapshot bytes are owned; no entered string is retained.
import { SecretValue } from "@ckd/core/secret-value.js";

const CHANGE_REPORTING_TYPES = new Set(["checkbox", "radio", "file", "range", "color"]);
// This bounds comparison storage, not input admission. Larger text conservatively counts as new.
const MAX_CACHED_TEXT_UNITS = 65_536;

type TextOwner = SecretValue<readonly string[]>;
interface FieldSnapshot {
  readonly value: TextOwner;
  readonly reference: WeakRef<TextOwner>;
}

function textField(target: unknown): { key: object; text: string } | undefined {
  if (
    typeof target !== "object" ||
    target === null ||
    !("tagName" in target) ||
    !("value" in target)
  )
    return undefined;
  const tagName = target.tagName;
  if (typeof tagName !== "string") return undefined;
  const text = target.value;
  if (typeof text !== "string") return undefined;
  const tag = tagName.toUpperCase();
  const nativeType = "type" in target ? target.type : undefined;
  const type = typeof nativeType === "string" ? nativeType : "text";
  return tag === "TEXTAREA" || (tag === "INPUT" && !CHANGE_REPORTING_TYPES.has(type))
    ? { key: target, text }
    : undefined;
}

/** Owns bounded exact field comparisons, without retaining private strings or removed native fields. */
export class FieldEdits implements Disposable {
  #counted = new WeakMap<object, FieldSnapshot>();
  readonly #owners = new Set<WeakRef<TextOwner>>();
  readonly #pages = new WeakSet<Document>();

  /** Raw UTF-16 units retained per field for duplicate-change suppression, before any copy. */
  static get maximumCachedTextUnits(): number {
    return MAX_CACHED_TEXT_UNITS;
  }

  /** Count text changes once; oversize text is not cached and every event remains an edit. */
  isNew(event: Event): boolean {
    const field = textField(event.target);
    if (field === undefined) {
      if (event.target !== null) this.#forget(event.target);
      return true;
    }
    if (typeof Element !== "undefined" && field.key instanceof Element)
      this.#watch(field.key.ownerDocument);
    const previous = this.#counted.get(field.key);
    if (event.type === "change" && previous?.value.value[0] === field.text) return false;
    this.#forget(field.key);
    if (field.text.length <= MAX_CACHED_TEXT_UNITS) {
      // Preserve lone surrogates: a lossy UTF-8 replacement could hide an actual edit.
      const value = SecretValue.utf16Texts([field.text]);
      const reference = new WeakRef(value);
      for (const old of this.#owners) if (old.deref() === undefined) this.#owners.delete(old);
      this.#owners.add(reference);
      this.#counted.set(field.key, { value, reference });
    }
    return true;
  }

  #forget(key: object): void {
    const previous = this.#counted.get(key);
    if (previous === undefined) return;
    this.#counted.delete(key);
    this.#owners.delete(previous.reference);
    previous.value.wipe();
  }

  #watch(document: Document): void {
    if (this.#pages.has(document)) return;
    this.#pages.add(document);
    // Page listeners must not keep a retired panel and all its comparison owners alive.
    const owner = new WeakRef(this);
    const retire = (): void => owner.deref()?.wipe();
    document.querySelector("#clear-all")?.addEventListener("click", retire);
    document.defaultView?.addEventListener("pagehide", retire);
  }

  /** Wipe reachable comparison owners and revoke every cached comparison; native fields are untouched. */
  wipe(): void {
    // Collect reachable owners while the comparison cache still keeps them alive.
    const owners: TextOwner[] = [];
    for (const reference of this.#owners) {
      const value = reference.deref();
      if (value !== undefined) owners.push(value);
    }
    this.#counted = new WeakMap();
    this.#owners.clear();
    for (const value of owners) value.wipe();
  }

  [Symbol.dispose](): void {
    this.wipe();
  }
}

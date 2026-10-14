// Which `input` and `change` events are new edits of a field. A text field reports each edit as
// `input` and repeats it as `change` when it loses focus; Firefox sends that `change` after the click
// that started a job, so a handler that treats it as an edit drops the job or result it just started.

/** Input types whose edits arrive as `change` alone in some browsers; every other type is text. */
const CHANGE_REPORTING_TYPES = new Set(["checkbox", "radio", "file", "range", "color"]);

interface EditedField {
  readonly tagName?: string;
  readonly type?: string;
  readonly value?: unknown;
}

/** A textarea or a text-like input, whose every edit is reported as `input`. */
function textField(target: EventTarget | null): (EditedField & { value: string }) | undefined {
  const field = target as EditedField | null;
  const tag = field?.tagName?.toUpperCase();
  const text =
    tag === "TEXTAREA" || (tag === "INPUT" && !CHANGE_REPORTING_TYPES.has(field?.type ?? "text"));
  return text && typeof field?.value === "string"
    ? (field as EditedField & { value: string })
    : undefined;
}

/**
 * Remembers the text each field held at its last counted edit. A listener that receives both
 * events asks `isNew` first: a text field's `change` with the text already counted repeats that
 * edit; a value the page sets and announces with `change` alone is a new one.
 */
export class FieldEdits {
  readonly #counted = new WeakMap<object, string>();

  isNew(event: Event): boolean {
    const field = textField(event.target);
    if (field === undefined) return true;
    if (event.type === "change" && this.#counted.get(field) === field.value) return false;
    this.#counted.set(field, field.value);
    return true;
  }
}

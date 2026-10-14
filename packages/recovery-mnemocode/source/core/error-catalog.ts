// Module-owned error codes and messages, shared by the terminal and by library hosts. The
// catalog is static program data: namespaces and codes are never taken from a person's input.

type Message = (...parameters: never[]) => string;
type Definition = Message | Readonly<{ kind: "type" | "range"; text: Message }>;
type MessageOf<Value> = Value extends Message
  ? Value
  : Value extends Readonly<{ text: infer Text extends Message }>
    ? Text
    : never;

/** A failure with a stable module code; it keeps the ordinary Error message and cause contract. */
export interface CodedFailure<Code extends string = string> extends Error {
  readonly code: Code;
}

/**
 * The adapter for a refusal whose wording already belongs to a shared rule or to its host. A
 * catalog assigns its stable failure code without copying that rule's formatter or its text.
 */
export function suppliedMessage(message: string): string {
  return message;
}

/** One implementation for the native error kinds, preserving instanceof TypeError/RangeError. */
function codedErrorType(baseError: ErrorConstructor) {
  return class CodedError<Code extends string> extends baseError {
    readonly code: Code;

    constructor(code: Code, message: string, options?: ErrorOptions) {
      super(message, options);
      this.code = code;
      Object.defineProperty(this, "code", { writable: false, configurable: false });
    }
  };
}

const ERROR_TYPES = {
  error: codedErrorType(Error),
  type: codedErrorType(TypeError),
  range: codedErrorType(RangeError),
} as const;

/** This module's own failures contain no supplied namespace, code or message value. */
const CATALOG_FAILURES = {
  unknownCode: "error-catalog.unknown-code",
  invalidMessage: "error-catalog.invalid-message",
} as const;

/**
 * A module's one list of failure codes and their English messages. The definitions belong to the
 * module rather than a whole-program registry, so a host can take it independently. create()
 * accepts the selected message's parameter tuple and optional ErrorOptions, and returns a failure
 * whose code is namespace.code. The ordinary message is built from that code once; existing
 * terminal and browser hosts may display it or provide their own wording for the same code.
 */
export class ErrorCatalog<
  const Namespace extends string,
  const Definitions extends Readonly<Record<string, Definition>>,
> {
  readonly #namespace: Namespace;
  readonly #definitions: Readonly<Definitions>;

  /** Takes ownership of static definitions; neither the code list nor its native kinds change. */
  constructor(namespace: Namespace, definitions: Definitions) {
    this.#namespace = namespace;
    for (const definition of Object.values(definitions)) {
      if (typeof definition !== "function") Object.freeze(definition);
    }
    this.#definitions = Object.freeze(definitions);
  }

  /**
   * Builds one failure. Parameters are evaluated by the caller in their original order and are
   * not retained separately. An unknown code or non-string message is a coded TypeError without
   * echoing the supplied value; a message factory's own operational failure still propagates.
   */
  create<Code extends Extract<keyof Definitions, string>>(
    code: Code,
    parameters: Parameters<MessageOf<Definitions[Code]>>,
    options?: ErrorOptions,
  ): CodedFailure<`${Namespace}.${Code}`> {
    const definition = Object.hasOwn(this.#definitions, code) ? this.#definitions[code] : undefined;
    if (definition === undefined)
      throw new ERROR_TYPES.type(CATALOG_FAILURES.unknownCode, "Unknown module error code.");
    const kind = typeof definition === "function" ? "error" : definition.kind;
    const text = typeof definition === "function" ? definition : definition.text;
    // Reflect.apply keeps each definition's precise parameter tuple at the public seam; its
    // result is validated as unknown rather than letting Reflect's any reach the return value.
    const message: unknown = Reflect.apply(text, undefined, parameters);
    if (typeof message !== "string")
      throw new ERROR_TYPES.type(
        CATALOG_FAILURES.invalidMessage,
        "A module error message must be text.",
      );
    return new ERROR_TYPES[kind](`${this.#namespace}.${code}` as const, message, options);
  }
}

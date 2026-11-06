import { SecretValue } from "@ckd/core/secret-value.js";

export { clearDerivationResult } from "@ckd/core/secrets.js";

const CONCEALED_TEXT = "Hidden";
/** Separated codes are another private presentation of the joined backup payload. */
export const APART_CODES = "apart-codes";
// Joined and separated backup encodings must retire with owned private values.
const PRIVATE_TEXT_SELECTOR = `.secret-value, .share-secret, .${APART_CODES}`;

/** Input-free refusal of a presentation transition or failure to finish native cleanup. */
export class RenderedSecretsError extends Error {
  /** Stable page code; native exceptions and supplied text are never retained. */
  readonly code: "ui.secret.cleanup" | "ui.secret.retired";

  /** Describe only which presentation operation failed. */
  constructor(code: RenderedSecretsError["code"]) {
    super(code);
    this.name = "RenderedSecretsError";
    this.code = code;
  }
}

/** Owns a rendered private text snapshot and revokes its native presentation on retirement. */
export class RenderedSecrets implements Disposable {
  static readonly #values = new WeakMap<HTMLElement, RenderedSecrets>();
  static readonly #changing = new WeakSet<HTMLElement>();
  readonly #element: HTMLElement;
  #value: SecretValue<readonly string[]> | undefined;
  #retired = false;

  /** Capture exact code units; only an explicit reveal writes the decoded view to native text. */
  constructor(element: HTMLElement, text: string, revealed: boolean) {
    this.#element = element;
    if (RenderedSecrets.#changing.has(element)) throw new RenderedSecretsError("ui.secret.retired");
    RenderedSecrets.#changing.add(element);
    try {
      const previous = RenderedSecrets.#values.get(element);
      if (previous !== undefined && !previous.#retire())
        throw new RenderedSecretsError("ui.secret.cleanup");
      this.#value = SecretValue.utf16Texts([text]);
      RenderedSecrets.#values.set(element, this);
      this.#show(revealed);
    } catch {
      // Construction can fail after bytes or native text were installed; revoke both first.
      this.#retire();
      throw new RenderedSecretsError("ui.secret.cleanup");
    } finally {
      RenderedSecrets.#changing.delete(element);
    }
  }

  #show(revealed: boolean): void {
    if (this.#retired || this.#value === undefined) return;
    this.#element.textContent = revealed ? (this.#value.value[0] ?? "") : CONCEALED_TEXT;
    this.#element.setAttribute("aria-hidden", String(!revealed));
  }

  static #elements(root: HTMLElement): HTMLElement[] {
    return [
      ...(root.matches(PRIVATE_TEXT_SELECTOR) ? [root] : []),
      ...root.querySelectorAll<HTMLElement>(PRIVATE_TEXT_SELECTOR),
    ];
  }

  /** Concealment drops owned native text; only live owners can be revealed again. */
  static setVisible(root: HTMLElement, revealed: boolean): void {
    for (const element of this.#elements(root)) {
      const value = this.#values.get(element);
      if (value !== undefined) value.#show(revealed);
    }
  }

  /** Wipe every presentation owner before removing its nodes, including detached references. */
  static clear(root: HTMLElement): void {
    this.replace(root);
  }

  /** Revoke removed private nodes before native replacement; explicitly retained children stay owned. */
  static replace(root: HTMLElement, ...nodes: (Node | string)[]): void {
    const removed = this.#elements(root).filter(
      (element) => !nodes.some((node) => typeof node !== "string" && node.contains(element)),
    );
    const locked = new Set([root, ...removed]);
    if ([...locked].some((element) => this.#changing.has(element)))
      throw new RenderedSecretsError("ui.secret.retired");
    for (const element of locked) this.#changing.add(element);
    let clean = true;
    try {
      // Lock the whole captured set before native callbacks can replace another owner in it.
      for (const element of removed) {
        const owner = this.#values.get(element);
        if (owner !== undefined) clean = owner.#retire() && clean;
        else
          clean =
            this.#attempt(() => {
              element.textContent = "";
            }) && clean;
      }
      clean = this.#attempt(() => root.replaceChildren(...nodes)) && clean;
    } finally {
      for (const element of locked) this.#changing.delete(element);
    }
    if (!clean) throw new RenderedSecretsError("ui.secret.cleanup");
  }

  /** Retire the old result's private descendants before showing a status or failure as native text. */
  static text(root: HTMLElement, text: string): void {
    this.clear(root);
    root.textContent = text;
  }

  /** Erase owned bytes as far as JavaScript allows and permanently revoke this node's text. */
  wipe(): void {
    if (this.#retired) return;
    if (RenderedSecrets.#changing.has(this.#element))
      throw new RenderedSecretsError("ui.secret.retired");
    RenderedSecrets.#changing.add(this.#element);
    try {
      if (!this.#retire()) throw new RenderedSecretsError("ui.secret.cleanup");
    } finally {
      RenderedSecrets.#changing.delete(this.#element);
    }
  }

  static #attempt(operation: () => void): boolean {
    try {
      operation();
      return true;
    } catch {
      return false;
    }
  }

  #retire(): boolean {
    if (this.#retired) return true;
    this.#retired = true;
    this.#value?.wipe();
    this.#value = undefined;
    const textCleared = RenderedSecrets.#attempt(() => {
      this.#element.textContent = "";
    });
    const attributeCleared = RenderedSecrets.#attempt(() =>
      this.#element.setAttribute("aria-hidden", "true"),
    );
    if (RenderedSecrets.#values.get(this.#element) === this)
      RenderedSecrets.#values.delete(this.#element);
    return textCleared && attributeCleared;
  }

  /** End the same presentation lifetime as clearing or replacing the result. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}

/** Compatibility entry for native result clearing. */
export const clearRenderedSecrets = RenderedSecrets.clear.bind(RenderedSecrets);

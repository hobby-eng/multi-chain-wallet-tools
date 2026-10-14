// Synthetic DOM for recovery lifecycle/controller regressions. No rendering, KDF or worker runs.
// Extends the existing MHFE test elements with ancestry, bubbling, selection and focus only.
import { vi } from "vitest";
import { FakeElement } from "./fake-mhfe-page.js";

/** Extends existing test support only for interfaces these real controllers consume. */
export class RecoveryTestElement extends FakeElement {
  id = "";
  name = "";
  tabIndex = 0;
  parentElement: RecoveryTestElement | null = null;
  readonly style: Record<string, string> = {};

  constructor(
    readonly tagName: string,
    readonly ownerDocument: RecoveryTestPage,
  ) {
    super();
    this.type = tagName === "button" ? "button" : "text";
    let classNames: string[] = [];
    Object.defineProperty(this, "className", {
      get: () => classNames.join(" "),
      set: (value: string) => {
        this.classList.remove(...classNames);
        classNames = value.split(/\s+/u).filter(Boolean);
        this.classList.add(...classNames);
      },
    });
    let text = "";
    Object.defineProperty(this, "textContent", {
      get: () => text,
      set: (value: string) => {
        for (const child of this.children)
          if (child instanceof RecoveryTestElement) child.parentElement = null;
        this.children.length = 0;
        text = value;
      },
    });
  }

  readonly #removedAttributes = new Set<string>();

  override setAttribute(name: string, value: string): void {
    this.#removedAttributes.delete(name);
    super.setAttribute(name, value);
    if (name === "hidden") this.hidden = true;
  }
  override getAttribute(name: string): string | null {
    return this.#removedAttributes.has(name) ? null : super.getAttribute(name);
  }
  removeAttribute(name: string): void {
    this.#removedAttributes.add(name);
    if (name === "hidden") this.hidden = false;
  }

  get firstElementChild(): RecoveryTestElement | null {
    return (
      (this.children.find(
        (child) => child instanceof RecoveryTestElement,
      ) as RecoveryTestElement) ?? null
    );
  }

  override append(...nodes: (FakeElement | string)[]): void {
    for (const node of nodes) {
      if (node instanceof RecoveryTestElement) {
        node.remove();
        node.parentElement = this;
      }
      super.append(node);
    }
  }

  override replaceChildren(...nodes: (FakeElement | string)[]): void {
    for (const child of this.children)
      if (child instanceof RecoveryTestElement) child.parentElement = null;
    this.children.length = 0;
    this.textContent = "";
    this.append(...nodes);
  }

  before(...nodes: (RecoveryTestElement | string)[]): void {
    const parent = this.parentElement;
    if (parent === null) return;
    for (const node of nodes) {
      if (node instanceof RecoveryTestElement) {
        node.remove();
        node.parentElement = parent;
      }
      parent.children.splice(parent.children.indexOf(this), 0, node);
    }
  }

  remove(): void {
    const siblings = this.parentElement?.children;
    if (siblings !== undefined) {
      const index = siblings.indexOf(this);
      if (index >= 0) siblings.splice(index, 1);
    }
    this.parentElement = null;
  }

  contains(other: RecoveryTestElement): boolean {
    return other === this || this.descendants().includes(other);
  }

  override closest(selector = "label"): RecoveryTestElement | null {
    for (let node: RecoveryTestElement | null = this; node !== null; node = node.parentElement)
      if (node.matches(selector)) return node;
    return null;
  }

  descendants(): RecoveryTestElement[] {
    return this.children.flatMap((child) =>
      child instanceof RecoveryTestElement ? [child, ...child.descendants()] : [],
    );
  }

  matches(selector: string): boolean {
    return selector.split(",").some((alternative) => {
      const parts = alternative.trim().split(/\s+/u);
      if (!this.#simple(parts.pop()!)) return false;
      let ancestor = this.parentElement;
      while (parts.length > 0) {
        const part = parts.pop()!;
        while (ancestor !== null && !ancestor.#simple(part)) ancestor = ancestor.parentElement;
        if (ancestor === null) return false;
        ancestor = ancestor.parentElement;
      }
      return true;
    });
  }

  #simple(selector: string): boolean {
    const tag = /^[a-z][\w-]*/iu.exec(selector)?.[0];
    if (tag !== undefined && tag.toLowerCase() !== this.tagName) return false;
    const id = /#([\w-]+)/u.exec(selector)?.[1];
    if (id !== undefined && id !== this.id) return false;
    for (const [, name] of selector.matchAll(/\.([\w-]+)/gu))
      if (!this.classList.contains(name!)) return false;
    if (selector.includes(":checked") && !this.checked) return false;
    for (const [, name, quoted, plain] of selector.matchAll(
      /\[([\w-]+)(?:=(?:"([^"]*)"|([^\]]+)))?\]/gu,
    )) {
      const value = this.#attribute(name!);
      if (value === null || ((quoted ?? plain) !== undefined && value !== (quoted ?? plain)))
        return false;
    }
    return true;
  }

  #attribute(name: string): string | null {
    if (name === "id") return this.id || null;
    if (name === "name") return this.name || null;
    if (name === "type") return this.type;
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/gu, (_, letter: string) => letter.toUpperCase());
      return this.dataset[key] ?? null;
    }
    return this.getAttribute(name);
  }

  override querySelector(): null;
  override querySelector(selector: string): RecoveryTestElement | null;
  override querySelector(selector?: string): RecoveryTestElement | null {
    return selector === undefined ? null : (this.querySelectorAll(selector)[0] ?? null);
  }
  override querySelectorAll(selector?: string): RecoveryTestElement[] {
    return selector === undefined
      ? []
      : this.descendants().filter((element) => element.matches(selector));
  }
  override focus(): void {
    this.ownerDocument.activeElement = this;
  }
  override click(): void {
    if (this.disabled) return;
    this.dispatchEvent(new Event("click", { bubbles: true }));
    this.onclick?.();
  }
  override dispatchEvent(event: Event): boolean {
    // Preserve the original target while forwarding to parents: Node EventTarget has no DOM tree.
    if (event.target === null) Object.defineProperty(event, "target", { value: this });
    const accepted = super.dispatchEvent(event);
    if (event.bubbles && !event.cancelBubble) {
      if (this.parentElement !== null) this.parentElement.dispatchEvent(event);
      else if (this === this.ownerDocument.body) this.ownerDocument.dispatchEvent(event);
    }
    return accepted;
  }
}

class RecoveryTestInput extends RecoveryTestElement {}

export class RecoveryTestPage extends EventTarget {
  readonly body = new RecoveryTestElement("body", this);
  readonly window = Object.assign(new EventTarget(), {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  });
  /** The page's window, as a real document names it. */
  get defaultView(): EventTarget {
    return this.window;
  }
  activeElement: RecoveryTestElement | null = null;
  visibilityState = "visible";

  constructor() {
    super();
    vi.stubGlobal("document", this);
    vi.stubGlobal("window", this.window);
    vi.stubGlobal("Node", RecoveryTestElement);
    vi.stubGlobal("Element", RecoveryTestElement);
    vi.stubGlobal(
      "KeyboardEvent",
      class extends Event {
        readonly key: string;
        constructor(type: string, options: KeyboardEventInit) {
          super(type, options);
          this.key = options.key ?? "";
        }
      },
    );
    vi.stubGlobal("HTMLElement", RecoveryTestElement);
    vi.stubGlobal("HTMLInputElement", RecoveryTestInput);
    vi.stubGlobal(
      "__MNEMOCODE_SEARCH_WORKER_SOURCE__",
      "Synthetic deferred worker; never executed",
    );
  }

  createElement(tag: string): RecoveryTestElement {
    return tag === "input" ? new RecoveryTestInput(tag, this) : new RecoveryTestElement(tag, this);
  }
  add(id: string, tag = "div", parent = this.body): RecoveryTestElement {
    const element = this.createElement(tag);
    element.id = id;
    parent.append(element);
    return element;
  }
  querySelector(selector: string): RecoveryTestElement | null {
    return this.body.querySelector(selector);
  }
  querySelectorAll(selector: string): RecoveryTestElement[] {
    return this.body.querySelectorAll(selector);
  }
  require(id: string): RecoveryTestElement {
    const element = this.querySelector(`#${id}`);
    if (element === null) throw new Error(`Recovery fixture is missing #${id}.`);
    return element;
  }
  hideOrBlur(event: "blur" | "hidden"): void {
    if (event === "blur") this.window.dispatchEvent(new Event("blur"));
    else {
      this.visibilityState = "hidden";
      this.dispatchEvent(new Event("visibilitychange"));
    }
  }
}

export function edit(element: RecoveryTestElement, value: string, type = "input"): void {
  element.value = value;
  element.dispatchEvent(new Event(type, { bubbles: true }));
}

/** Flush promise reactions without advancing any input debounce. */
export async function settlePromises(): Promise<void> {
  for (let turn = 0; turn < 24; turn += 1) await Promise.resolve();
}

export function keyDown(element: RecoveryTestElement, key: string): Event {
  const event = new Event("keydown", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "key", { value: key });
  element.dispatchEvent(event);
  return event;
}

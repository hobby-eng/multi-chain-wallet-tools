import { vi } from "vitest";
import {
  RecoveryTestPage,
  type RecoveryTestElement,
} from "../../apps/key-derivation/tests/fake-recovery-page.js";

type PassiveCanvas = RecoveryTestElement & {
  width: number;
  height: number;
};

type ObservedMutation = {
  readonly type: "attributes" | "childList";
  readonly target?: RecoveryTestElement;
  readonly attributeName?: string;
  readonly removedNodes: readonly RecoveryTestElement[];
};

/** Extends existing fake elements only with connectivity, passive popovers and delayed toBlob. */
export class PassiveQrPage extends RecoveryTestPage {
  readonly #removals: ((nodes: readonly RecoveryTestElement[]) => void)[] = [];
  readonly #attributes: ((target: RecoveryTestElement, name: string) => void)[] = [];
  readonly documentElement = { namespaceURI: "http://www.w3.org/1999/xhtml" };
  readonly canvases: PassiveCanvas[] = [];
  readonly pending: BlobCallback[] = [];
  readonly downloads: string[] = [];
  failure: "context" | "blob" | undefined;

  constructor() {
    super();
    Object.assign(this.window, { innerWidth: 1200, innerHeight: 800 });
    const subscribe = (deliver: (records: ObservedMutation[]) => void): void => {
      this.#removals.push((nodes) => deliver([{ type: "childList", removedNodes: nodes }]));
    };
    const attributes = this.#attributes;
    Object.assign(this.window, {
      MutationObserver: class {
        readonly #records: ObservedMutation[] = [];
        constructor(deliver: (records: ObservedMutation[]) => void) {
          subscribe(deliver);
          attributes.push((target, name) => {
            this.#records.push({
              type: "attributes",
              target,
              attributeName: name,
              removedNodes: [],
            });
          });
        }
        observe(): void {}
        takeRecords(): ObservedMutation[] {
          return this.#records.splice(0);
        }
      },
    });
  }

  /** Queues a reflected native attribute transition for synchronous takeRecords admission. */
  queueAttribute(target: RecoveryTestElement, name: string): void {
    for (const queue of this.#attributes) queue(target, name);
  }

  /** Delivers the native removal-record boundary explicitly; no browser mutation queue runs. */
  deliverRemoved(...nodes: RecoveryTestElement[]): void {
    for (const deliver of this.#removals) deliver(nodes);
  }

  override createElement(tag: string): RecoveryTestElement {
    const element = super.createElement(tag);
    Object.defineProperty(element, "isConnected", { get: () => this.body.contains(element) });
    let open = false;
    const matches = element.matches.bind(element);
    element.matches = (selector) =>
      selector === ":popover-open" ? open : selector === ":hover" ? false : matches(selector);
    Object.assign(element, {
      showPopover: () => (open = true),
      hidePopover: () => (open = false),
      getBoundingClientRect: () => ({ width: 100, height: 100, top: 0, right: 100, bottom: 100 }),
    });
    if (tag === "canvas") {
      const canvas = Object.assign(element, {
        width: 0,
        height: 0,
        getContext: () =>
          this.failure === "context"
            ? null
            : { imageSmoothingEnabled: true, fillStyle: "", fillRect: vi.fn() },
        toBlob: (callback: BlobCallback) => {
          if (this.failure === "blob") throw new Error("Synthetic canvas encoder rejection.");
          this.pending.push(callback);
        },
      });
      this.canvases.push(canvas);
    }
    if (tag === "a")
      element.click = () => {
        const name: unknown = Reflect.get(element, "download");
        if (typeof name !== "string") throw new Error("The download needs a filename.");
        this.downloads.push(name);
      };
    return element;
  }

  createElementNS(_namespace: string, tag: string): RecoveryTestElement {
    return this.createElement(tag);
  }

  asDocument(): Document {
    return this as unknown as Document;
  }
}
